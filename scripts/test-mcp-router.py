#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import socket
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

import mcp.types as types
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

REPO = Path(__file__).resolve().parents[1]
ROUTER_PATH = REPO / "apps/desktop/src-tauri/resources/mcp-router/blackrain_mcp_router.py"
SPEC = importlib.util.spec_from_file_location("blackrain_mcp_router", ROUTER_PATH)
assert SPEC and SPEC.loader
router = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = router
SPEC.loader.exec_module(router)


def desired(generation: str, servers: list[dict[str, Any]]) -> Any:
    return router.parse_desired_generation({"generationId": generation, "servers": servers})


def server(server_id: str, *, command: str | None = None) -> dict[str, Any]:
    return {
        "id": server_id,
        "command": command or sys.executable,
        "args": [],
        "environment": {},
        "connectTimeoutSeconds": 5,
        "timeoutSeconds": 5,
        "supportsParallelToolCalls": False,
    }


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


async def control_request(
    port: int, bearer: str, method: str, path: str, payload: dict[str, Any] | None = None
) -> bytes:
    reader, writer = await asyncio.open_connection("127.0.0.1", port)
    encoded = json.dumps(payload).encode() if payload is not None else b""
    headers = (
        f"{method} {path} HTTP/1.1\r\n"
        f"Authorization: Bearer {bearer}\r\n"
        + ("Content-Type: application/json\r\n" if payload is not None else "")
        + f"Content-Length: {len(encoded)}\r\n\r\n"
    ).encode()
    writer.write(headers + encoded)
    await writer.drain()
    response = await reader.read()
    writer.close()
    await writer.wait_closed()
    return response


class FakeWorker:
    instances: list["FakeWorker"] = []

    def __init__(self, spec: Any, callback: Any):
        self.spec = spec
        self.callback = callback
        self.started = False
        self.stopped = False
        self._tools = (
            types.Tool(
                name="echo",
                description="Echo fixture",
                inputSchema={"type": "object", "properties": {"value": {"type": "string"}}},
            ),
        )
        self.instances.append(self)

    async def start(self) -> None:
        if self.spec.server_id.startswith("fail"):
            raise router.RouterError("router_downstream_connect_failed", "fixture", 503)
        self.started = True

    async def stop(self) -> None:
        self.stopped = True

    async def tools(self) -> tuple[types.Tool, ...]:
        return self._tools

    async def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> types.CallToolResult:
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=f"{tool_name}:{arguments.get('value', '')}")]
        )

    async def change_tools(self) -> None:
        self._tools = (
            types.Tool(name="changed", description="Changed", inputSchema={"type": "object"}),
        )
        await self.callback(self)


class FakeHermesSession:
    def __init__(self) -> None:
        self.notifications = 0

    async def send_tool_list_changed(self) -> None:
        self.notifications += 1


class RouterContractTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        FakeWorker.instances.clear()

    def test_desired_state_is_strict_and_keeps_secret_only_in_memory(self) -> None:
        payload = server("office")
        payload["environment"] = {"OFFICE_TOKEN": "secret-fixture"}
        parsed = desired("generation-1", [payload])
        self.assertEqual(parsed.servers[0].process_environment()["OFFICE_TOKEN"], "secret-fixture")
        invalid = dict(payload)
        invalid["cwd"] = str(REPO)
        with self.assertRaisesRegex(router.RouterError, "unsupported fields"):
            desired("generation-2", [invalid])
        with self.assertRaisesRegex(router.RouterError, "unique and valid"):
            desired("generation-2", [payload, payload])
        reserved = server("reserved")
        reserved["environment"] = {"PATH": "untrusted"}
        with self.assertRaisesRegex(router.RouterError, "reserved"):
            desired("generation-3", [reserved])

    async def test_connect_before_swap_keeps_old_generation_on_failure(self) -> None:
        state = router.RouterState(worker_factory=FakeWorker)
        first = await state.replace(desired("generation-1", [server("office")]))
        self.assertEqual(first["toolCount"], 1)
        old = FakeWorker.instances[0]
        with self.assertRaises(router.RouterError):
            await state.replace(desired("generation-2", [server("fail-office")]))
        summary = await state.summary(changed=False)
        self.assertEqual(summary["generationId"], "generation-1")
        self.assertFalse(old.stopped)
        self.assertEqual([tool.name for tool in await state.list_tools()], ["office__echo"])
        await state.close()

    async def test_failed_worker_stop_does_not_rethrow_transport_error(self) -> None:
        async def changed(_worker: Any) -> None:
            return None

        payload = server("broken")
        payload["args"] = ["-c", "raise RuntimeError('boom')"]
        worker = router.DownstreamWorker(desired("generation-broken", [payload]).servers[0], changed)

        with self.assertRaises(router.RouterError):
            await worker.start()
        await worker.stop()

    async def test_swap_routes_calls_retires_old_and_notifies_hermes(self) -> None:
        state = router.RouterState(worker_factory=FakeWorker)
        session = FakeHermesSession()
        await state.observe_hermes_session(session, initialized=True)
        await state.replace(desired("generation-1", [server("office")]))
        old = FakeWorker.instances[0]
        result = await state.call_tool("office__echo", {"value": "ok"})
        self.assertEqual(result.content[0].text, "echo:ok")
        await state.replace(desired("generation-2", [server("finance")]))
        self.assertTrue(old.stopped)
        self.assertEqual([tool.name for tool in await state.list_tools()], ["finance__echo"])
        self.assertEqual(session.notifications, 2)
        await state.close()

    async def test_downstream_list_changed_rebuilds_routes_before_notification(self) -> None:
        state = router.RouterState(worker_factory=FakeWorker)
        session = FakeHermesSession()
        await state.observe_hermes_session(session, initialized=True)
        await state.replace(desired("generation-1", [server("office")]))
        worker = FakeWorker.instances[0]
        await worker.change_tools()
        self.assertEqual([tool.name for tool in await state.list_tools()], ["office__changed"])
        self.assertEqual(session.notifications, 2)
        await state.close()

    async def test_control_plane_requires_bearer_and_never_echoes_secret(self) -> None:
        state = router.RouterState(worker_factory=FakeWorker)
        bearer = "b" * 48
        control = router.ControlServer(state, 0, bearer)
        await control.start()
        assert control._server and control._server.sockets
        port = control._server.sockets[0].getsockname()[1]

        async def request(auth: str) -> bytes:
            reader, writer = await asyncio.open_connection("127.0.0.1", port)
            body = json.dumps({"generationId": "generation-1", "servers": [server("office")]})
            encoded = body.encode()
            writer.write(
                (
                    "PUT /v1/servers HTTP/1.1\r\n"
                    f"Authorization: Bearer {auth}\r\n"
                    "Content-Type: application/json\r\n"
                    f"Content-Length: {len(encoded)}\r\n\r\n"
                ).encode()
                + encoded
            )
            await writer.drain()
            response = await reader.read()
            writer.close()
            await writer.wait_closed()
            return response

        denied = await request("wrong")
        self.assertIn(b"401 Unauthorized", denied)
        self.assertNotIn(bearer.encode(), denied)
        accepted = await request(bearer)
        self.assertIn(b"200 OK", accepted)
        self.assertIn(b'"generationId":"generation-1"', accepted)
        await control.close()
        await state.close()

    async def test_real_stdio_downstream_lists_and_calls_tool(self) -> None:
        with tempfile.TemporaryDirectory(prefix="blackrain-router-e2e-") as temp:
            child = Path(temp) / "fake_mcp.py"
            child.write_text(
                """
from mcp.server.fastmcp import FastMCP
mcp = FastMCP("fixture")
@mcp.tool()
def echo(value: str) -> str:
    return "fixture:" + value
if __name__ == "__main__":
    mcp.run()
""".strip()
                + "\n",
                encoding="utf-8",
            )
            payload = server("fixture")
            payload["args"] = [str(child)]
            state = router.RouterState()
            summary = await state.replace(desired("generation-real", [payload]))
            self.assertEqual(summary["toolCount"], 1)
            tools = await state.list_tools()
            self.assertEqual(tools[0].name, "fixture__echo")
            result = await state.call_tool("fixture__echo", {"value": "ok"})
            self.assertFalse(result.isError)
            self.assertIn("fixture:ok", result.content[0].text)
            await state.close()

    async def test_router_process_serves_authenticated_mcp_and_pushes_list_changed(self) -> None:
        with tempfile.TemporaryDirectory(prefix="blackrain-router-http-e2e-") as temp:
            child = Path(temp) / "fake_mcp.py"
            child.write_text(
                """
from mcp.server.fastmcp import FastMCP
mcp = FastMCP("fixture")
@mcp.tool()
def echo(value: str) -> str:
    return "http-fixture:" + value
if __name__ == "__main__":
    mcp.run()
""".strip()
                + "\n",
                encoding="utf-8",
            )
            control_port = free_port()
            mcp_port = free_port()
            while mcp_port == control_port:
                mcp_port = free_port()
            control_bearer = "c" * 48
            mcp_bearer = "m" * 48
            environment = {
                **os.environ,
                "BLACKRAIN_MCP_ROUTER_CONTROL_PORT": str(control_port),
                "BLACKRAIN_MCP_ROUTER_CONTROL_BEARER": control_bearer,
                "BLACKRAIN_MCP_ROUTER_MCP_PORT": str(mcp_port),
                "BLACKRAIN_MCP_ROUTER_MCP_BEARER": mcp_bearer,
            }
            process = await asyncio.create_subprocess_exec(
                sys.executable,
                str(ROUTER_PATH),
                env=environment,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                for _ in range(100):
                    try:
                        response = await control_request(
                            control_port, control_bearer, "GET", "/health"
                        )
                        if b"200 OK" in response:
                            break
                    except OSError:
                        pass
                    await asyncio.sleep(0.03)
                else:
                    stderr = await process.stderr.read() if process.stderr else b""
                    self.fail(f"router did not become ready: {stderr.decode(errors='replace')}")

                payload = server("fixture")
                payload["args"] = [str(child)]
                response = await control_request(
                    control_port,
                    control_bearer,
                    "PUT",
                    "/v1/servers",
                    {"generationId": "generation-http-1", "servers": [payload]},
                )
                self.assertIn(b"200 OK", response)
                notification = asyncio.Event()

                async def message_handler(message: Any) -> None:
                    if isinstance(message, types.ServerNotification) and isinstance(
                        message.root, types.ToolListChangedNotification
                    ):
                        notification.set()

                async with streamablehttp_client(
                    f"http://127.0.0.1:{mcp_port}/mcp",
                    headers={"Authorization": f"Bearer {mcp_bearer}"},
                    timeout=5,
                    sse_read_timeout=10,
                ) as streams:
                    async with ClientSession(
                        streams[0], streams[1], message_handler=message_handler
                    ) as session:
                        await session.initialize()
                        tools = await session.list_tools()
                        self.assertEqual([tool.name for tool in tools.tools], ["fixture__echo"])
                        result = await session.call_tool("fixture__echo", {"value": "ok"})
                        self.assertFalse(result.isError)
                        self.assertIn("http-fixture:ok", result.content[0].text)
                        response = await control_request(
                            control_port,
                            control_bearer,
                            "PUT",
                            "/v1/servers",
                            {"generationId": "generation-http-2", "servers": []},
                        )
                        self.assertIn(b"200 OK", response)
                        await asyncio.wait_for(notification.wait(), 3)
                        self.assertEqual((await session.list_tools()).tools, [])
            finally:
                process.terminate()
                try:
                    await asyncio.wait_for(process.wait(), 5)
                except asyncio.TimeoutError:
                    process.kill()
                    await process.wait()


if __name__ == "__main__":
    unittest.main()
