#!/usr/bin/env python3
"""Run pinned Hermes against a deterministic local Chat Completions server."""

from __future__ import annotations

import argparse
import json
import os
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
HERMES = ROOT / "hermes-upstream"
CONFIG_FIXTURE = (
    ROOT
    / "apps"
    / "desktop"
    / "src-tauri"
    / "test-fixtures"
    / "hermes"
    / "v2026.7.7.2"
    / "blackrain-managed-config.yaml"
)
FIXED_MODEL_URL = "http://127.0.0.1:18765/v1"
API_BEARER = "blackrain-live-probe-api-bearer-0000000000000001"
MODEL_BEARER = "blackrain-live-probe-model-bearer"
EXPECTED_OUTPUT = "BlackRain locked Hermes live probe completed."
EXPECTED_FILE_CONTENT = "blackrain-read-tool-result-verified"
DISALLOWED_TOOLS = {"memory", "session_search", "cronjob"}


class ProbeFailure(RuntimeError):
    pass


class ModelState:
    def __init__(self) -> None:
        self.requests: list[dict[str, Any]] = []
        self.read_path: str | None = None
        self.lock = threading.Lock()


def json_bytes(value: Any) -> bytes:
    return json.dumps(value, separators=(",", ":")).encode("utf-8")


class ModelHandler(BaseHTTPRequestHandler):
    server: "ModelServer"

    def log_message(self, _format: str, *_args: Any) -> None:
        return

    def do_GET(self) -> None:  # noqa: N802
        if self.path.rstrip("/") == "/v1/models":
            self._send_json(
                200,
                {
                    "object": "list",
                    "data": [
                        {
                            "id": "blackrain-fixture",
                            "object": "model",
                            "owned_by": "blackrain",
                        }
                    ],
                },
            )
            return
        self._send_json(404, {"error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path.rstrip("/") != "/v1/chat/completions":
            self._send_json(404, {"error": "not_found"})
            return
        if self.headers.get("Authorization") != f"Bearer {MODEL_BEARER}":
            self._send_json(401, {"error": "unauthorized"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            request = json.loads(self.rfile.read(length))
        except (ValueError, json.JSONDecodeError) as error:
            self._send_json(400, {"error": str(error)})
            return
        with self.server.state.lock:
            self.server.state.requests.append(request)
            request_index = len(self.server.state.requests)
        if request.get("stream"):
            self._send_stream(request_index)
        else:
            self._send_json(200, self._completion(request_index))

    def _completion(self, request_index: int) -> dict[str, Any]:
        if request_index == 1:
            return {
                "id": "chatcmpl-blackrain-live-probe-tool",
                "object": "chat.completion",
                "created": 1,
                "model": "blackrain-fixture",
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": None,
                            "tool_calls": [self._tool_call()],
                        },
                        "finish_reason": "tool_calls",
                    }
                ],
                "usage": {"prompt_tokens": 11, "completion_tokens": 7, "total_tokens": 18},
            }
        return {
            "id": "chatcmpl-blackrain-live-probe",
            "object": "chat.completion",
            "created": 1,
            "model": "blackrain-fixture",
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": EXPECTED_OUTPUT},
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 11, "completion_tokens": 7, "total_tokens": 18},
        }

    def _tool_call(self) -> dict[str, Any]:
        read_path = self.server.state.read_path
        if not read_path:
            raise ProbeFailure("Live probe read path was not configured")
        return {
            "index": 0,
            "id": "call_blackrain_read_probe",
            "type": "function",
            "function": {
                "name": "read_file",
                "arguments": json.dumps({"path": read_path}, separators=(",", ":")),
            },
        }

    def _send_stream(self, request_index: int) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        if request_index == 1:
            chunks = [
                {
                    "id": "chatcmpl-blackrain-live-probe-tool",
                    "object": "chat.completion.chunk",
                    "created": 1,
                    "model": "blackrain-fixture",
                    "choices": [
                        {
                            "index": 0,
                            "delta": {"role": "assistant", "tool_calls": [self._tool_call()]},
                            "finish_reason": None,
                        }
                    ],
                },
                {
                    "id": "chatcmpl-blackrain-live-probe-tool",
                    "object": "chat.completion.chunk",
                    "created": 1,
                    "model": "blackrain-fixture",
                    "choices": [
                        {"index": 0, "delta": {}, "finish_reason": "tool_calls"}
                    ],
                },
            ]
            self._write_stream_chunks(chunks)
            return
        chunks = [
            {
                "id": "chatcmpl-blackrain-live-probe",
                "object": "chat.completion.chunk",
                "created": 1,
                "model": "blackrain-fixture",
                "choices": [
                    {"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}
                ],
            },
            {
                "id": "chatcmpl-blackrain-live-probe",
                "object": "chat.completion.chunk",
                "created": 1,
                "model": "blackrain-fixture",
                "choices": [
                    {
                        "index": 0,
                        "delta": {"content": EXPECTED_OUTPUT},
                        "finish_reason": None,
                    }
                ],
            },
            {
                "id": "chatcmpl-blackrain-live-probe",
                "object": "chat.completion.chunk",
                "created": 1,
                "model": "blackrain-fixture",
                "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
            },
            {
                "id": "chatcmpl-blackrain-live-probe",
                "object": "chat.completion.chunk",
                "created": 1,
                "model": "blackrain-fixture",
                "choices": [],
                "usage": {"prompt_tokens": 11, "completion_tokens": 7, "total_tokens": 18},
            },
        ]
        self._write_stream_chunks(chunks)

    def _write_stream_chunks(self, chunks: list[dict[str, Any]]) -> None:
        for chunk in chunks:
            self.wfile.write(b"data: " + json_bytes(chunk) + b"\n\n")
            self.wfile.flush()
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()

    def _send_json(self, status: int, body: Any) -> None:
        encoded = json_bytes(body)
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


class ModelServer(ThreadingHTTPServer):
    def __init__(self, state: ModelState):
        super().__init__(("127.0.0.1", 0), ModelHandler)
        self.state = state


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def request_json(
    method: str,
    url: str,
    bearer: str | None = None,
    body: Any | None = None,
    timeout: float = 5.0,
) -> tuple[int, Any]:
    headers = {"Accept": "application/json"}
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    data = None
    if body is not None:
        data = json_bytes(body)
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())


def wait_ready(base_url: str, process: subprocess.Popen[str]) -> dict[str, Any]:
    deadline = time.monotonic() + 30
    last_error = "not started"
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise ProbeFailure(f"Hermes exited before readiness with code {process.returncode}")
        try:
            status, health = request_json("GET", f"{base_url}/health", timeout=1)
            if status == 200 and health.get("status") == "ok":
                return health
            last_error = f"HTTP {status}: {health}"
        except (OSError, ValueError) as error:
            last_error = str(error)
        time.sleep(0.1)
    raise ProbeFailure(f"Hermes readiness timed out: {last_error}")


def stream_events(base_url: str, run_id: str) -> list[dict[str, Any]]:
    request = urllib.request.Request(
        f"{base_url}/v1/runs/{run_id}/events",
        headers={"Authorization": f"Bearer {API_BEARER}", "Accept": "text/event-stream"},
    )
    events: list[dict[str, Any]] = []
    with urllib.request.urlopen(request, timeout=30) as response:
        for raw_line in response:
            line = raw_line.decode("utf-8").strip()
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if not payload or payload == "[DONE]":
                continue
            event = json.loads(payload)
            events.append(event)
            if event.get("event") in {"run.completed", "run.failed", "run.cancelled"}:
                break
    return events


def stop_process(process: subprocess.Popen[str]) -> tuple[str, str]:
    if process.poll() is None:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        else:
            os.killpg(process.pid, signal.SIGTERM)
    try:
        return process.communicate(timeout=5)
    except subprocess.TimeoutExpired:
        if os.name != "nt":
            os.killpg(process.pid, signal.SIGKILL)
        return process.communicate(timeout=5)


def resolve_python(explicit: str | None) -> Path:
    candidates = [Path(explicit).expanduser()] if explicit else []
    candidates.extend([HERMES / ".venv" / "Scripts" / "python.exe", HERMES / ".venv" / "bin" / "python"])
    for candidate in candidates:
        if candidate.is_file():
            return candidate.absolute()
    raise ProbeFailure("Pinned Hermes venv Python is unavailable")


def run_probe(python: Path) -> None:
    state = ModelState()
    model_server = ModelServer(state)
    model_thread = threading.Thread(target=model_server.serve_forever, daemon=True)
    model_thread.start()
    model_port = int(model_server.server_address[1])
    api_port = free_port()
    process: subprocess.Popen[str] | None = None
    try:
        with tempfile.TemporaryDirectory(prefix="blackrain-hermes-live-") as temp:
            root = Path(temp)
            hermes_home = root / "hermes-home"
            process_home = hermes_home / "process-home"
            project = root / "project"
            hermes_home.mkdir(parents=True)
            process_home.mkdir()
            project.mkdir()
            read_fixture = project / "read-probe.txt"
            read_fixture.write_text(EXPECTED_FILE_CONTENT + "\n", encoding="utf-8")
            state.read_path = str(read_fixture)
            rendered = CONFIG_FIXTURE.read_text(encoding="utf-8").replace(
                FIXED_MODEL_URL, f"http://127.0.0.1:{model_port}/v1"
            )
            (hermes_home / "config.yaml").write_text(rendered, encoding="utf-8")

            env = {
                key: value
                for key, value in os.environ.items()
                if key in {"PATH", "TMPDIR", "TEMP", "TMP", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT"}
            }
            env.update(
                {
                    "HERMES_HOME": str(hermes_home),
                    "HOME": str(process_home),
                    "USERPROFILE": str(process_home),
                    "APPDATA": str(process_home / "AppData" / "Roaming"),
                    "LOCALAPPDATA": str(process_home / "AppData" / "Local"),
                    "API_SERVER_ENABLED": "true",
                    "API_SERVER_HOST": "127.0.0.1",
                    "API_SERVER_PORT": str(api_port),
                    "API_SERVER_KEY": API_BEARER,
                    "BLACKRAIN_HERMES_PROVIDER_API_KEY": MODEL_BEARER,
                    "CUA_DRIVER_RS_TELEMETRY_ENABLED": "0",
                    "HERMES_WRITE_SAFE_ROOT": str(project),
                }
            )
            creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
            process = subprocess.Popen(
                [str(python), "-m", "hermes_cli.main", "gateway", "run"],
                cwd=HERMES,
                env=env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                start_new_session=os.name != "nt",
                creationflags=creationflags,
            )
            base_url = f"http://127.0.0.1:{api_port}"
            health = wait_ready(base_url, process)
            status, capabilities = request_json(
                "GET", f"{base_url}/v1/capabilities", API_BEARER
            )
            if status != 200 or not capabilities.get("features", {}).get("run_submission"):
                raise ProbeFailure(f"Unexpected capabilities: HTTP {status}")
            status, started = request_json(
                "POST",
                f"{base_url}/v1/runs",
                API_BEARER,
                {"input": "Return the fixed live-probe completion.", "model": "blackrain-fixture"},
            )
            if status != 202 or not started.get("run_id"):
                raise ProbeFailure(f"Run creation failed: HTTP {status}: {started}")
            run_id = str(started["run_id"])
            events = stream_events(base_url, run_id)
            event_names = [str(event.get("event")) for event in events]
            required_events = {"tool.started", "tool.completed", "message.delta", "run.completed"}
            if not required_events.issubset(event_names):
                terminal = events[-1] if events else {}
                raise ProbeFailure(
                    f"Incomplete run events: {event_names}; terminal={terminal}"
                )
            completed = next(event for event in events if event.get("event") == "run.completed")
            if completed.get("output") != EXPECTED_OUTPUT:
                raise ProbeFailure("Completed output did not match the deterministic model response")
            status, run_status = request_json(
                "GET", f"{base_url}/v1/runs/{run_id}", API_BEARER
            )
            if status != 200 or run_status.get("status") != "completed":
                raise ProbeFailure(f"Run did not converge to completed: {run_status}")
            with state.lock:
                model_requests = list(state.requests)
            if len(model_requests) != 2:
                raise ProbeFailure(f"Expected two model requests, received {len(model_requests)}")
            if EXPECTED_FILE_CONTENT not in json.dumps(model_requests[1]):
                raise ProbeFailure("read_file result did not return to the second model iteration")
            request_tools = {
                str(tool.get("function", {}).get("name"))
                for tool in model_requests[0].get("tools", [])
                if isinstance(tool, dict)
            }
            exposed = sorted(DISALLOWED_TOOLS & request_tools)
            if exposed:
                raise ProbeFailure(f"Managed-disabled tools reached the model: {exposed}")
            print(
                "OK: pinned Hermes live probe completed "
                f"({health.get('version')}, {len(events)} events, "
                f"{len(model_requests)} model calls, {len(request_tools)} tools)"
            )
    finally:
        if process is not None:
            stdout, stderr = stop_process(process)
            if process.returncode not in {0, -signal.SIGTERM, 1}:
                detail = (stderr or stdout)[-4000:]
                print(f"Hermes shutdown output:\n{detail}", file=sys.stderr)
        model_server.shutdown()
        model_server.server_close()
        model_thread.join(timeout=5)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upstream-python", help="Pinned Hermes venv Python path")
    return parser.parse_args()


def main() -> int:
    try:
        run_probe(resolve_python(parse_args().upstream_python))
        return 0
    except (ProbeFailure, OSError, ValueError, json.JSONDecodeError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
