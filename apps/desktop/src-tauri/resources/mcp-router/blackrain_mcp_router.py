#!/usr/bin/env python3
"""BlackRain managed MCP router.

Hermes connects to this process through one authenticated Streamable HTTP MCP
endpoint. BlackRain Core updates the verified downstream stdio server set
through a separate authenticated loopback control plane. Secrets exist only in
the control request and downstream process memory.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import re
import sys
from contextlib import AsyncExitStack
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from typing import Any, Awaitable, Callable

import mcp.types as types
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.server.lowlevel import NotificationOptions, Server
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from starlette.responses import JSONResponse

ROUTER_VERSION = "1"
MAX_CONTROL_HEADER_BYTES = 64 * 1024
MAX_CONTROL_BODY_BYTES = 1024 * 1024
MAX_SERVERS = 32
MAX_TOOLS = 2048
MAX_ARGS = 128
MAX_ENVIRONMENT = 64
MAX_TEXT = 4096
ROUTER_STATUS_TOOL = "blackrain_workbench_status"
IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
ENV_KEY = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,127}$")
TOOL_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
SAFE_CHILD_ENVIRONMENT = (
    "APPDATA",
    "COMSPEC",
    "HOME",
    "LANG",
    "LOCALAPPDATA",
    "PATH",
    "PATHEXT",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "WINDIR",
)
RESERVED_CHILD_ENVIRONMENT = {
    *SAFE_CHILD_ENVIRONMENT,
    "CODEX_HOME",
    "HERMES_HOME",
    "BLACKRAIN_MCP_ROUTER_CONTROL_BEARER",
    "BLACKRAIN_MCP_ROUTER_CONTROL_PORT",
    "BLACKRAIN_MCP_ROUTER_MCP_BEARER",
    "BLACKRAIN_MCP_ROUTER_MCP_PORT",
}


class RouterError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


@dataclass(frozen=True)
class DesiredServer:
    server_id: str
    command: str
    args: tuple[str, ...]
    environment: tuple[tuple[str, str], ...]
    connect_timeout_seconds: int
    timeout_seconds: int
    supports_parallel_tool_calls: bool

    def process_environment(self) -> dict[str, str]:
        environment = {
            key: value for key in SAFE_CHILD_ENVIRONMENT if (value := os.environ.get(key))
        }
        environment.update(self.environment)
        return environment


@dataclass(frozen=True)
class DesiredGeneration:
    generation_id: str
    servers: tuple[DesiredServer, ...]


@dataclass(frozen=True)
class RoutedTool:
    public_name: str
    server_id: str
    downstream_name: str
    definition: types.Tool
    worker: "DownstreamWorker"


def _require_object(value: Any, code: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise RouterError(code, "Control payload must be a JSON object.")
    return value


def _reject_unknown(value: dict[str, Any], allowed: set[str], code: str) -> None:
    if set(value) - allowed:
        raise RouterError(code, "Control payload contains unsupported fields.")


def _bounded_text(value: Any, label: str, max_length: int = MAX_TEXT) -> str:
    if not isinstance(value, str) or not value or len(value) > max_length or "\x00" in value:
        raise RouterError("router_desired_state_invalid", f"{label} is invalid.")
    return value


def _bounded_int(value: Any, label: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise RouterError("router_desired_state_invalid", f"{label} is invalid.")
    return value


def parse_desired_generation(payload: Any) -> DesiredGeneration:
    root = _require_object(payload, "router_desired_state_invalid")
    _reject_unknown(root, {"generationId", "servers"}, "router_desired_state_invalid")
    generation_id = _bounded_text(root.get("generationId"), "generation id", 128)
    if not IDENTIFIER.fullmatch(generation_id):
        raise RouterError("router_desired_state_invalid", "Generation id is invalid.")
    raw_servers = root.get("servers")
    if not isinstance(raw_servers, list) or len(raw_servers) > MAX_SERVERS:
        raise RouterError("router_desired_state_invalid", "Server list is invalid or too large.")
    servers: list[DesiredServer] = []
    seen: set[str] = set()
    for raw in raw_servers:
        item = _require_object(raw, "router_desired_state_invalid")
        _reject_unknown(
            item,
            {
                "id",
                "command",
                "args",
                "environment",
                "connectTimeoutSeconds",
                "timeoutSeconds",
                "supportsParallelToolCalls",
            },
            "router_desired_state_invalid",
        )
        server_id = _bounded_text(item.get("id"), "server id", 128)
        if not IDENTIFIER.fullmatch(server_id) or server_id in seen:
            raise RouterError("router_desired_state_invalid", "Server ids must be unique and valid.")
        seen.add(server_id)
        command = _bounded_text(item.get("command"), "server command")
        command_path = Path(command)
        if not command_path.is_absolute() or not command_path.is_file():
            raise RouterError("router_desired_state_invalid", "Server command is not a verified file.")
        raw_args = item.get("args", [])
        if not isinstance(raw_args, list) or len(raw_args) > MAX_ARGS:
            raise RouterError("router_desired_state_invalid", "Server arguments are invalid.")
        args = tuple(_bounded_text(arg, "server argument") for arg in raw_args)
        raw_environment = item.get("environment", {})
        if not isinstance(raw_environment, dict) or len(raw_environment) > MAX_ENVIRONMENT:
            raise RouterError("router_desired_state_invalid", "Server environment is invalid.")
        environment: list[tuple[str, str]] = []
        for key, raw_value in raw_environment.items():
            if not isinstance(key, str) or not ENV_KEY.fullmatch(key):
                raise RouterError("router_desired_state_invalid", "Server environment key is invalid.")
            if key.upper() in RESERVED_CHILD_ENVIRONMENT or key.upper().startswith("BLACKRAIN_MCP_ROUTER_"):
                raise RouterError(
                    "router_desired_state_invalid", "Server environment key is reserved."
                )
            environment.append((key, _bounded_text(raw_value, "server environment value", 16_384)))
        environment.sort()
        supports_parallel = item.get("supportsParallelToolCalls", False)
        if not isinstance(supports_parallel, bool):
            raise RouterError("router_desired_state_invalid", "Parallel tool flag is invalid.")
        servers.append(
            DesiredServer(
                server_id=server_id,
                command=command,
                args=args,
                environment=tuple(environment),
                connect_timeout_seconds=_bounded_int(
                    item.get("connectTimeoutSeconds"), "connect timeout", 1, 300
                ),
                timeout_seconds=_bounded_int(item.get("timeoutSeconds"), "tool timeout", 1, 3600),
                supports_parallel_tool_calls=supports_parallel,
            )
        )
    servers.sort(key=lambda server: server.server_id)
    return DesiredGeneration(generation_id=generation_id, servers=tuple(servers))


class _Call:
    def __init__(self, tool_name: str, arguments: dict[str, Any], future: asyncio.Future[types.CallToolResult]):
        self.tool_name = tool_name
        self.arguments = arguments
        self.future = future


class _Refresh:
    pass


class _Stop:
    pass


class DownstreamWorker:
    def __init__(
        self,
        spec: DesiredServer,
        on_tools_changed: Callable[["DownstreamWorker"], Awaitable[None]],
    ):
        self.spec = spec
        self._on_tools_changed = on_tools_changed
        self._queue: asyncio.Queue[_Call | _Refresh | _Stop] = asyncio.Queue()
        self._ready: asyncio.Future[None] | None = None
        self._task: asyncio.Task[None] | None = None
        self._tools: tuple[types.Tool, ...] = ()
        self._closing = False
        self._lifecycle_lock = asyncio.Lock()

    async def start(self) -> None:
        async with self._lifecycle_lock:
            if self._task is not None:
                return
            self._ready = asyncio.get_running_loop().create_future()
            self._task = asyncio.create_task(self._run())
        assert self._ready is not None
        try:
            await asyncio.wait_for(asyncio.shield(self._ready), self.spec.connect_timeout_seconds + 1)
        except Exception:
            await self.stop()
            raise RouterError("router_downstream_connect_failed", "Managed MCP server failed readiness.", 503)

    async def tools(self) -> tuple[types.Tool, ...]:
        return self._tools

    async def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> types.CallToolResult:
        async with self._lifecycle_lock:
            if self._closing or self._task is None or self._task.done():
                raise RouterError("router_downstream_unavailable", "Managed MCP server is unavailable.", 503)
            future: asyncio.Future[types.CallToolResult] = asyncio.get_running_loop().create_future()
            await self._queue.put(_Call(tool_name, arguments, future))
        return await future

    async def request_refresh(self) -> None:
        async with self._lifecycle_lock:
            if not self._closing and self._task is not None and not self._task.done():
                await self._queue.put(_Refresh())

    async def stop(self) -> None:
        async with self._lifecycle_lock:
            task = self._task
            if task is None:
                return
            if not self._closing:
                self._closing = True
                await self._queue.put(_Stop())
        try:
            await asyncio.wait_for(task, 10)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        except Exception:
            # Initialization and transport failures are normalized by the
            # start/call paths. Shutdown remains idempotent and best-effort.
            pass

    async def _run(self) -> None:
        assert self._ready is not None
        try:
            async with AsyncExitStack() as stack:
                errlog = open(os.devnull, "w", encoding="utf-8")
                stack.callback(errlog.close)
                streams = await stack.enter_async_context(
                    stdio_client(
                        StdioServerParameters(
                            command=self.spec.command,
                            args=list(self.spec.args),
                            env=self.spec.process_environment(),
                        ),
                        errlog=errlog,
                    )
                )

                async def message_handler(message: Any) -> None:
                    if isinstance(message, types.ServerNotification) and isinstance(
                        message.root, types.ToolListChangedNotification
                    ):
                        asyncio.create_task(self.request_refresh())

                session = await stack.enter_async_context(
                    ClientSession(
                        streams[0],
                        streams[1],
                        read_timeout_seconds=timedelta(seconds=self.spec.connect_timeout_seconds),
                        message_handler=message_handler,
                    )
                )
                await asyncio.wait_for(session.initialize(), self.spec.connect_timeout_seconds)
                listed = await asyncio.wait_for(session.list_tools(), self.spec.connect_timeout_seconds)
                self._tools = tuple(listed.tools)
                if not self._ready.done():
                    self._ready.set_result(None)
                while True:
                    command = await self._queue.get()
                    if isinstance(command, _Stop):
                        break
                    if isinstance(command, _Refresh):
                        try:
                            listed = await asyncio.wait_for(
                                session.list_tools(), self.spec.connect_timeout_seconds
                            )
                            self._tools = tuple(listed.tools)
                            await self._on_tools_changed(self)
                        except Exception:
                            pass
                        continue
                    try:
                        result = await asyncio.wait_for(
                            session.call_tool(
                                command.tool_name,
                                command.arguments,
                                read_timeout_seconds=timedelta(seconds=self.spec.timeout_seconds),
                            ),
                            self.spec.timeout_seconds + 1,
                        )
                        if not command.future.done():
                            command.future.set_result(result)
                    except Exception:
                        if not command.future.done():
                            command.future.set_exception(
                                RouterError(
                                    "router_downstream_call_failed",
                                    "Managed MCP tool execution failed.",
                                    502,
                                )
                            )
        except Exception as exc:
            if not self._ready.done():
                self._ready.set_exception(exc)
            while not self._queue.empty():
                pending = self._queue.get_nowait()
                if isinstance(pending, _Call) and not pending.future.done():
                    pending.future.set_exception(
                        RouterError("router_downstream_unavailable", "Managed MCP server stopped.", 503)
                    )
        finally:
            self._closing = True


def _route_name(server_id: str, downstream_name: str) -> str:
    readable = f"{server_id}__{downstream_name}"
    if TOOL_NAME.fullmatch(readable):
        return readable
    digest = hashlib.sha256(f"{server_id}\0{downstream_name}".encode("utf-8")).hexdigest()[:32]
    return f"br_{digest}"


class RouterState:
    def __init__(
        self,
        worker_factory: Callable[
            [DesiredServer, Callable[[DownstreamWorker], Awaitable[None]]], DownstreamWorker
        ] = DownstreamWorker,
    ):
        self._worker_factory = worker_factory
        self._lock = asyncio.Lock()
        self._update_lock = asyncio.Lock()
        self._generation: DesiredGeneration | None = None
        self._workers: dict[str, DownstreamWorker] = {}
        self._routes: dict[str, RoutedTool] = {}
        self._hermes_session: Any | None = None
        self._hermes_initialized = False

    async def observe_hermes_session(self, session: Any, initialized: bool) -> None:
        async with self._lock:
            self._hermes_session = session
            self._hermes_initialized = self._hermes_initialized or initialized

    async def list_tools(self) -> list[types.Tool]:
        async with self._lock:
            routed = [self._routes[name].definition for name in sorted(self._routes)]
        return [self._status_tool(), *routed]

    async def call_tool(self, public_name: str, arguments: dict[str, Any]) -> types.CallToolResult:
        if public_name == ROUTER_STATUS_TOOL:
            async with self._lock:
                payload = {
                    "generationId": self._generation.generation_id if self._generation else None,
                    "serverIds": sorted(self._workers),
                    "toolNames": sorted(self._routes),
                }
            return types.CallToolResult(
                content=[
                    types.TextContent(
                        type="text",
                        text=json.dumps(payload, separators=(",", ":")),
                    )
                ]
            )
        async with self._lock:
            route = self._routes.get(public_name)
        if route is None:
            return types.CallToolResult(
                content=[types.TextContent(type="text", text="Managed MCP tool is no longer available.")],
                isError=True,
            )
        try:
            return await route.worker.call_tool(route.downstream_name, arguments)
        except RouterError:
            return types.CallToolResult(
                content=[types.TextContent(type="text", text="Managed MCP tool execution failed.")],
                isError=True,
            )

    async def replace(self, desired: DesiredGeneration) -> dict[str, Any]:
        async with self._update_lock:
            async with self._lock:
                current = self._generation
                existing = dict(self._workers)
            if current is not None and current.generation_id == desired.generation_id:
                if current == desired:
                    return await self.summary(changed=False)
                raise RouterError(
                    "router_generation_conflict",
                    "Generation id already exists with different desired state.",
                    409,
                )
            desired_by_id = {server.server_id: server for server in desired.servers}
            next_workers: dict[str, DownstreamWorker] = {}
            started: list[DownstreamWorker] = []
            try:
                for server_id, spec in desired_by_id.items():
                    old = existing.get(server_id)
                    if old is not None and old.spec == spec:
                        next_workers[server_id] = old
                        continue
                    worker = self._worker_factory(spec, self._refresh_worker)
                    await worker.start()
                    next_workers[server_id] = worker
                    started.append(worker)
                routes = await self._build_routes(next_workers)
            except Exception:
                await asyncio.gather(*(worker.stop() for worker in started), return_exceptions=True)
                raise
            async with self._lock:
                self._generation = desired
                self._workers = next_workers
                self._routes = routes
            await self._notify_tools_changed()
            retired = [
                worker
                for server_id, worker in existing.items()
                if next_workers.get(server_id) is not worker
            ]
            await asyncio.gather(*(worker.stop() for worker in retired), return_exceptions=True)
            return await self.summary(changed=True)

    async def summary(self, changed: bool) -> dict[str, Any]:
        async with self._lock:
            return {
                "ok": True,
                "changed": changed,
                "generationId": self._generation.generation_id if self._generation else None,
                "serverCount": len(self._workers),
                "toolCount": len(self._routes),
            }

    async def close(self) -> None:
        async with self._update_lock:
            async with self._lock:
                workers = list(self._workers.values())
                self._workers = {}
                self._routes = {}
            await asyncio.gather(*(worker.stop() for worker in workers), return_exceptions=True)

    async def _build_routes(self, workers: dict[str, DownstreamWorker]) -> dict[str, RoutedTool]:
        routes: dict[str, RoutedTool] = {}
        for server_id in sorted(workers):
            worker = workers[server_id]
            for tool in await worker.tools():
                public_name = _route_name(server_id, tool.name)
                if public_name == ROUTER_STATUS_TOOL or public_name in routes:
                    raise RouterError("router_tool_collision", "Managed MCP tool names collided.", 409)
                payload = tool.model_dump(by_alias=True, exclude_none=True)
                payload["name"] = public_name
                description = tool.description or ""
                payload["description"] = f"BlackRain managed source {server_id}. {description}".strip()
                metadata = dict(payload.get("_meta") or {})
                metadata["blackrain/sourceServerId"] = server_id
                metadata["blackrain/downstreamToolName"] = tool.name
                payload["_meta"] = metadata
                definition = types.Tool.model_validate(payload)
                routes[public_name] = RoutedTool(
                    public_name=public_name,
                    server_id=server_id,
                    downstream_name=tool.name,
                    definition=definition,
                    worker=worker,
                )
                if len(routes) + 1 > MAX_TOOLS:
                    raise RouterError("router_tool_limit", "Managed MCP tool limit was exceeded.", 409)
        return routes

    @staticmethod
    def _status_tool() -> types.Tool:
        return types.Tool(
            name=ROUTER_STATUS_TOOL,
            description=(
                "Inspect the active BlackRain workbench tool generation. "
                "This read-only tool remains available while managed plugins change."
            ),
            inputSchema={
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
            _meta={"blackrain/routerAnchor": True},
        )

    async def _refresh_worker(self, worker: DownstreamWorker) -> None:
        async with self._update_lock:
            async with self._lock:
                if self._workers.get(worker.spec.server_id) is not worker:
                    return
                workers = dict(self._workers)
            try:
                routes = await self._build_routes(workers)
            except Exception:
                return
            async with self._lock:
                if self._workers.get(worker.spec.server_id) is not worker:
                    return
                self._routes = routes
            await self._notify_tools_changed()

    async def _notify_tools_changed(self) -> None:
        async with self._lock:
            session = self._hermes_session if self._hermes_initialized else None
        if session is None:
            return
        try:
            await session.send_tool_list_changed()
        except Exception:
            pass


class RouterMcpServer(Server):
    def __init__(self, state: RouterState):
        super().__init__("blackrain-mcp-router", version=ROUTER_VERSION)
        self.state = state

    def create_initialization_options(
        self,
        notification_options: NotificationOptions | None = None,
        experimental_capabilities: dict[str, dict[str, Any]] | None = None,
    ) -> Any:
        return super().create_initialization_options(
            notification_options or NotificationOptions(tools_changed=True),
            experimental_capabilities or {},
        )

    async def _handle_message(self, message: Any, session: Any, *args: Any, **kwargs: Any) -> Any:
        initialized = isinstance(message, types.ClientNotification) and isinstance(
            message.root, types.InitializedNotification
        )
        await self.state.observe_hermes_session(session, initialized=False)
        result = await super()._handle_message(message, session, *args, **kwargs)
        if initialized:
            await self.state.observe_hermes_session(session, initialized=True)
        return result


class ControlServer:
    def __init__(self, state: RouterState, port: int, bearer: str):
        self.state = state
        self.port = port
        self.bearer = bearer
        self._server: asyncio.AbstractServer | None = None

    async def start(self) -> None:
        self._server = await asyncio.start_server(self._handle, "127.0.0.1", self.port)

    async def close(self) -> None:
        if self._server is not None:
            self._server.close()
            await self._server.wait_closed()

    async def _handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            request = await asyncio.wait_for(self._read_request(reader), 5)
            status, body = await self._dispatch(*request)
        except RouterError as error:
            status, body = error.status, {"ok": False, "code": error.code}
        except Exception:
            status, body = 500, {"ok": False, "code": "router_control_internal"}
        encoded = json.dumps(body, separators=(",", ":")).encode("utf-8")
        reason = {
            200: "OK",
            400: "Bad Request",
            401: "Unauthorized",
            404: "Not Found",
            409: "Conflict",
            413: "Payload Too Large",
            500: "Internal Server Error",
            503: "Service Unavailable",
        }.get(status, "Error")
        writer.write(
            f"HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {len(encoded)}\r\nConnection: close\r\n\r\n".encode(
                "ascii"
            )
            + encoded
        )
        await writer.drain()
        writer.close()
        await writer.wait_closed()

    async def _read_request(
        self, reader: asyncio.StreamReader
    ) -> tuple[str, str, dict[str, str], bytes]:
        try:
            header = await reader.readuntil(b"\r\n\r\n")
        except (asyncio.IncompleteReadError, asyncio.LimitOverrunError):
            raise RouterError("router_control_request_invalid", "Control request is invalid.")
        if len(header) > MAX_CONTROL_HEADER_BYTES:
            raise RouterError("router_control_request_too_large", "Control headers are too large.", 413)
        try:
            lines = header[:-4].decode("ascii").split("\r\n")
            method, path, version = lines[0].split(" ")
        except Exception:
            raise RouterError("router_control_request_invalid", "Control request is invalid.")
        if version != "HTTP/1.1":
            raise RouterError("router_control_request_invalid", "Control protocol version is invalid.")
        headers: dict[str, str] = {}
        for line in lines[1:]:
            if ":" not in line:
                raise RouterError("router_control_request_invalid", "Control headers are invalid.")
            key, value = line.split(":", 1)
            normalized = key.strip().lower()
            if normalized in headers:
                raise RouterError("router_control_request_invalid", "Duplicate control headers are invalid.")
            headers[normalized] = value.strip()
        raw_length = headers.get("content-length", "0")
        if not raw_length.isdigit() or int(raw_length) > MAX_CONTROL_BODY_BYTES:
            raise RouterError("router_control_request_too_large", "Control body is too large.", 413)
        body = await reader.readexactly(int(raw_length)) if int(raw_length) else b""
        return method, path, headers, body

    async def _dispatch(
        self, method: str, path: str, headers: dict[str, str], body: bytes
    ) -> tuple[int, dict[str, Any]]:
        supplied = headers.get("authorization", "")
        expected = f"Bearer {self.bearer}"
        if not hmac.compare_digest(supplied, expected):
            raise RouterError("router_control_unauthorized", "Control authorization failed.", 401)
        if method == "GET" and path == "/health":
            return 200, await self.state.summary(changed=False)
        if method != "PUT" or path != "/v1/servers":
            raise RouterError("router_control_not_found", "Control route was not found.", 404)
        if headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
            raise RouterError("router_control_content_type", "Control content type is invalid.")
        try:
            payload = json.loads(body)
        except Exception:
            raise RouterError("router_control_json_invalid", "Control JSON is invalid.")
        return 200, await self.state.replace(parse_desired_generation(payload))


class BearerMcpApp:
    def __init__(self, manager: StreamableHTTPSessionManager, bearer: str):
        self.manager = manager
        self.bearer = bearer

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        headers = {
            key.decode("latin-1").lower(): value.decode("latin-1")
            for key, value in scope.get("headers", [])
        }
        if not hmac.compare_digest(headers.get("authorization", ""), f"Bearer {self.bearer}"):
            await JSONResponse(
                {"ok": False, "code": "router_mcp_unauthorized"}, status_code=401
            )(scope, receive, send)
            return
        await self.manager.handle_request(scope, receive, send)


def _router_configuration() -> tuple[int, str, int, str]:
    def port(name: str) -> int:
        raw = os.environ.get(name, "")
        if not raw.isdigit() or not 1024 <= int(raw) <= 65535:
            raise RouterError("router_control_config_invalid", "Router port is invalid.")
        return int(raw)

    def bearer(name: str) -> str:
        value = os.environ.get(name, "")
        if not 32 <= len(value) <= 256 or any(character.isspace() for character in value):
            raise RouterError("router_control_config_invalid", "Router bearer is invalid.")
        return value

    control_port = port("BLACKRAIN_MCP_ROUTER_CONTROL_PORT")
    mcp_port = port("BLACKRAIN_MCP_ROUTER_MCP_PORT")
    if control_port == mcp_port:
        raise RouterError("router_control_config_invalid", "Router ports must be distinct.")
    return (
        control_port,
        bearer("BLACKRAIN_MCP_ROUTER_CONTROL_BEARER"),
        mcp_port,
        bearer("BLACKRAIN_MCP_ROUTER_MCP_BEARER"),
    )


async def run_router() -> None:
    import uvicorn
    from starlette.applications import Starlette
    from starlette.routing import Mount

    control_port, control_bearer, mcp_port, mcp_bearer = _router_configuration()
    state = RouterState()
    server = RouterMcpServer(state)

    @server.list_tools()
    async def list_tools() -> list[types.Tool]:
        return await state.list_tools()

    @server.call_tool(validate_input=True)
    async def call_tool(name: str, arguments: dict[str, Any]) -> types.CallToolResult:
        return await state.call_tool(name, arguments)

    manager = StreamableHTTPSessionManager(server, json_response=False, stateless=False)
    app = Starlette(routes=[Mount("/mcp", app=BearerMcpApp(manager, mcp_bearer))])
    control = ControlServer(state, control_port, control_bearer)
    await control.start()
    try:
        async with manager.run():
            uvicorn_server = uvicorn.Server(
                uvicorn.Config(
                    app,
                    host="127.0.0.1",
                    port=mcp_port,
                    log_level="critical",
                    access_log=False,
                )
            )
            await uvicorn_server.serve()
    finally:
        await control.close()
        await state.close()


def main() -> int:
    try:
        asyncio.run(run_router())
        return 0
    except RouterError as error:
        print(error.code, file=sys.stderr)
        return 2
    except Exception:
        print("router_unexpected_failure", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
