import { spawn } from "node:child_process";
import { createConnection, type Socket } from "node:net";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserTabState } from "../../shared/browser-tabs";
import type { BrowserAgentBackend } from "./browser-dynamic-tool-adapter";
import {
  BROWSER_CLIENT_MAX_FRAME_BYTES,
  BrowserClientTransportServer,
  type BrowserClientBootstrap,
} from "./browser-client-transport";

const tab: BrowserTabState = {
  threadId: "thread-1",
  routeKey: "browser-sidebar",
  browserTabId: "tab-1",
  viewGeneration: 1,
  url: "https://example.com/",
  title: "Example",
  loading: false,
  canGoBack: false,
  canGoForward: false,
  crashed: false,
  error: null,
  controlOwner: "user",
  agentTurnId: null,
  permissionRequest: null,
  download: null,
  dialog: null,
  consoleMessages: [],
  debuggerStatus: "attached",
};

describe("BrowserClientTransportServer", () => {
  const servers: BrowserClientTransportServer[] = [];
  const sockets: Socket[] = [];

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.destroy();
    for (const server of servers.splice(0)) await server.stop();
  });

  it("通过随机 endpoint、capability 和 session generation 握手后调用同一 backend", async () => {
    const backend = createBackend();
    const { server, bootstrap } = await startServer(backend);
    servers.push(server);
    server.setActiveTurn("turn-1");
    const client = await connectClient(bootstrap.endpoint);
    sockets.push(client.socket);

    client.send(handshake(1, bootstrap));
    await expect(client.next()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: 1,
        codexSessionId: "thread-1",
        backendGeneration: 7,
      },
    });

    client.send({
      jsonrpc: "2.0",
      id: 2,
      method: "browser.call",
      params: {
        session_id: "thread-1",
        turn_id: "turn-1",
        tool: "list_tabs",
        arguments: {},
      },
    });
    await expect(client.next()).resolves.toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: [tab],
    });
    expect(backend.listTabsForAgent).toHaveBeenCalledWith({
      threadId: "thread-1",
      routeKey: "browser-sidebar",
    });
  });

  it("拒绝缺失或错误 capability、build、session 或 generation", async () => {
    const backend = createBackend();
    const { server, bootstrap } = await startServer(backend);
    servers.push(server);

    for (const overrides of [
      { capabilityToken: undefined },
      { capabilityToken: "x".repeat(43) },
      { appBuild: "other-build" },
      { codexSessionId: "thread-2" },
      { backendGeneration: 8 },
    ]) {
      const client = await connectClient(bootstrap.endpoint);
      sockets.push(client.socket);
      client.send(handshake(1, bootstrap, overrides));
      await client.closed();
    }
    expect(backend.listTabsForAgent).not.toHaveBeenCalled();
  });

  it("服务重启后拒绝旧 token 和旧 backend generation", async () => {
    const backend = createBackend();
    const first = await startServer(backend);
    await first.server.stop();

    const server = new BrowserClientTransportServer({
      backend,
      appBuild: "0.7.68-test",
      codexSessionId: "thread-1",
      backendGeneration: 8,
      endpoint: first.bootstrap.endpoint,
      capabilityToken: "new-token-".padEnd(43, "x"),
      requestTimeoutMs: 1_000,
    });
    const bootstrap = await server.start();
    servers.push(server);

    const staleClient = await connectClient(bootstrap.endpoint);
    sockets.push(staleClient.socket);
    staleClient.send(handshake(1, first.bootstrap));
    await staleClient.closed();

    const currentClient = await connectClient(bootstrap.endpoint);
    sockets.push(currentClient.socket);
    currentClient.send(handshake(2, bootstrap));
    await expect(currentClient.next()).resolves.toMatchObject({
      id: 2,
      result: { backendGeneration: 8 },
    });
  });

  it("对旧 turn fail closed，并在完成 turn 后撤销 Agent 控制", async () => {
    const backend = createBackend();
    const { server, bootstrap } = await startServer(backend);
    servers.push(server);
    server.setActiveTurn("turn-2");
    const client = await connectClient(bootstrap.endpoint);
    sockets.push(client.socket);
    client.send(handshake(1, bootstrap));
    await client.next();

    client.send({
      jsonrpc: "2.0",
      id: 2,
      method: "browser.call",
      params: {
        session_id: "thread-1",
        turn_id: "turn-1",
        tool: "list_tabs",
        arguments: {},
      },
    });
    await expect(client.next()).resolves.toMatchObject({
      id: 2,
      error: { code: -32003 },
    });

    server.completeTurn("turn-2");
    expect(backend.completeAgentTurn).toHaveBeenCalledWith(
      { threadId: "thread-1", routeKey: "browser-sidebar" },
      "turn-2",
    );
  });

  it("支持拆分 frame，并拒绝超过 8 MiB 的 frame", async () => {
    const backend = createBackend();
    const { server, bootstrap } = await startServer(backend);
    servers.push(server);
    const client = await connectClient(bootstrap.endpoint);
    sockets.push(client.socket);
    const frame = encodeFrame(handshake(1, bootstrap));
    client.socket.write(frame.subarray(0, 2));
    client.socket.write(frame.subarray(2, 11));
    client.socket.write(frame.subarray(11));
    await expect(client.next()).resolves.toMatchObject({ id: 1, result: {} });

    const oversized = Buffer.alloc(4);
    oversized.writeUInt32LE(BROWSER_CLIENT_MAX_FRAME_BYTES + 1, 0);
    client.socket.write(oversized);
    await client.closed();
  });

  it("socket 断连会取消当前 pending Browser 操作", async () => {
    let operationSignal: AbortSignal | undefined;
    const backend = createBackend();
    backend.snapshotForAgent.mockImplementation((_input, signal) => {
      operationSignal = signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    });
    const { server, bootstrap } = await startServer(backend);
    servers.push(server);
    server.setActiveTurn("turn-1");
    const client = await connectClient(bootstrap.endpoint);
    sockets.push(client.socket);
    client.send(handshake(1, bootstrap));
    await client.next();
    client.send({
      jsonrpc: "2.0",
      id: 2,
      method: "browser.call",
      params: {
        session_id: "thread-1",
        turn_id: "turn-1",
        tool: "snapshot",
        arguments: { browserTabId: "tab-1", viewGeneration: 1 },
      },
    });
    await vi.waitFor(() => expect(operationSignal).toBeDefined());
    client.socket.destroy();
    await vi.waitFor(() => expect(operationSignal?.aborted).toBe(true));
  });

  it("超过 transport deadline 会中止 Browser 操作并返回有界错误", async () => {
    let operationSignal: AbortSignal | undefined;
    const backend = createBackend();
    backend.snapshotForAgent.mockImplementation((_input, signal) => {
      operationSignal = signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    });
    const server = new BrowserClientTransportServer({
      backend,
      appBuild: "0.7.68-test",
      codexSessionId: "thread-1",
      backendGeneration: 7,
      requestTimeoutMs: 25,
    });
    const bootstrap = await server.start();
    servers.push(server);
    server.setActiveTurn("turn-1");
    const client = await connectClient(bootstrap.endpoint);
    sockets.push(client.socket);
    client.send(handshake(1, bootstrap));
    await client.next();
    client.send({
      jsonrpc: "2.0",
      id: 2,
      method: "browser.call",
      params: {
        session_id: "thread-1",
        turn_id: "turn-1",
        tool: "snapshot",
        arguments: { browserTabId: "tab-1", viewGeneration: 1 },
      },
    });

    await expect(client.next()).resolves.toMatchObject({
      id: 2,
      error: { code: -32000, message: "Browser client request 超时" },
    });
    expect(operationSignal?.aborted).toBe(true);
  });

  it("stop 会释放活跃 Browser Agent turn", async () => {
    const backend = createBackend();
    const { server } = await startServer(backend);
    servers.push(server);
    server.setActiveTurn("turn-stop");
    await server.stop();
    expect(backend.completeAgentTurn).toHaveBeenCalledWith(
      { threadId: "thread-1", routeKey: "browser-sidebar" },
      "turn-stop",
    );
  });

  it("新 turn 会取消旧 turn 的 pending 操作并释放旧控制权", async () => {
    let operationSignal: AbortSignal | undefined;
    const backend = createBackend();
    backend.snapshotForAgent.mockImplementation((_input, signal) => {
      operationSignal = signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    });
    const { server, bootstrap } = await startServer(backend);
    servers.push(server);
    server.setActiveTurn("turn-1");
    const client = await connectClient(bootstrap.endpoint);
    sockets.push(client.socket);
    client.send(handshake(1, bootstrap));
    await client.next();
    client.send({
      jsonrpc: "2.0",
      id: 2,
      method: "browser.call",
      params: {
        session_id: "thread-1",
        turn_id: "turn-1",
        tool: "snapshot",
        arguments: { browserTabId: "tab-1", viewGeneration: 1 },
      },
    });
    await vi.waitFor(() => expect(operationSignal).toBeDefined());

    server.setActiveTurn("turn-2");

    await vi.waitFor(() => expect(operationSignal?.aborted).toBe(true));
    expect(backend.completeAgentTurn).toHaveBeenCalledWith(
      { threadId: "thread-1", routeKey: "browser-sidebar" },
      "turn-1",
    );
  });

  it("由独立 Browser client 子进程完成握手并调用 backend", async () => {
    const backend = createBackend();
    const { server, bootstrap } = await startServer(backend);
    servers.push(server);
    server.setActiveTurn("turn-1");
    const fixture = fileURLToPath(
      new URL("./test-fixtures/browser-client-probe.mjs", import.meta.url),
    );
    const child = spawn(process.execPath, [fixture], {
      env: {
        ...process.env,
        BLACKRAIN_BROWSER_CLIENT_BOOTSTRAP: JSON.stringify(bootstrap),
        BLACKRAIN_BROWSER_CLIENT_TURN_ID: "turn-1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    const exitCode = await new Promise<number | null>((resolve) =>
      child.once("exit", resolve),
    );
    expect(Buffer.concat(stderr).toString("utf8")).toBe("");
    expect(exitCode).toBe(0);
    expect(JSON.parse(Buffer.concat(stdout).toString("utf8"))).toMatchObject({
      clientId: expect.any(String),
      tabs: [tab],
    });
  });

  async function startServer(backend: ReturnType<typeof createBackend>) {
    const server = new BrowserClientTransportServer({
      backend,
      appBuild: "0.7.68-test",
      codexSessionId: "thread-1",
      backendGeneration: 7,
      requestTimeoutMs: 1_000,
    });
    const bootstrap = await server.start();
    return { server, bootstrap };
  }
});

function createBackend() {
  return {
    listTabsForAgent: vi.fn<BrowserAgentBackend["listTabsForAgent"]>(() => [tab]),
    createTabForAgent: vi.fn<BrowserAgentBackend["createTabForAgent"]>(async () => tab),
    navigateForAgent: vi.fn<BrowserAgentBackend["navigateForAgent"]>(async () => tab),
    controlForAgent: vi.fn<BrowserAgentBackend["controlForAgent"]>(() => tab),
    completeAgentTurn: vi.fn<NonNullable<BrowserAgentBackend["completeAgentTurn"]>>(),
    snapshotForAgent: vi.fn<BrowserAgentBackend["snapshotForAgent"]>(async () => ({
      snapshotId: "snapshot-1",
      url: tab.url,
      text: "document Example",
    })),
    clickForAgent: vi.fn<BrowserAgentBackend["clickForAgent"]>(async () => ({
      browserTabId: tab.browserTabId,
      viewGeneration: tab.viewGeneration,
      url: tab.url,
    })),
    typeTextForAgent: vi.fn<BrowserAgentBackend["typeTextForAgent"]>(async () => ({
      browserTabId: tab.browserTabId,
      viewGeneration: tab.viewGeneration,
      url: tab.url,
    })),
    screenshotForAgent: vi.fn<BrowserAgentBackend["screenshotForAgent"]>(async () => ({
      browserTabId: tab.browserTabId,
      viewGeneration: tab.viewGeneration,
      url: tab.url,
      mimeType: "image/png" as const,
      imageUrl: "data:image/png;base64,AA==",
    })),
  } satisfies BrowserAgentBackend;
}

function handshake(
  id: number,
  bootstrap: BrowserClientBootstrap,
  overrides: Partial<BrowserClientBootstrap> = {},
) {
  return {
    jsonrpc: "2.0",
    id,
    method: "browser.handshake",
    params: {
      protocolVersion: bootstrap.protocolVersion,
      appBuild: bootstrap.appBuild,
      codexSessionId: bootstrap.codexSessionId,
      backendGeneration: bootstrap.backendGeneration,
      capabilityToken: bootstrap.capabilityToken,
      ...overrides,
    },
  };
}

async function connectClient(endpoint: string) {
  const socket = createConnection(endpoint);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  let buffer = Buffer.alloc(0);
  const messages: unknown[] = [];
  const waiters: Array<(value: unknown) => void> = [];
  socket.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const length = buffer.readUInt32LE(0);
      if (buffer.length < length + 4) return;
      const message = JSON.parse(buffer.subarray(4, length + 4).toString("utf8"));
      buffer = buffer.subarray(length + 4);
      const waiter = waiters.shift();
      if (waiter) waiter(message);
      else messages.push(message);
    }
  });
  return {
    socket,
    send(value: unknown) {
      socket.write(encodeFrame(value));
    },
    next(): Promise<unknown> {
      if (messages.length > 0) return Promise.resolve(messages.shift());
      return new Promise((resolve) => waiters.push(resolve));
    },
    closed(): Promise<void> {
      if (socket.destroyed) return Promise.resolve();
      return new Promise((resolve) => socket.once("close", () => resolve()));
    },
  };
}

function encodeFrame(value: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(value), "utf8");
  const frame = Buffer.allocUnsafe(payload.length + 4);
  frame.writeUInt32LE(payload.length, 0);
  payload.copy(frame, 4);
  return frame;
}
