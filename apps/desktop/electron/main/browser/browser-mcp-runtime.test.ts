import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserTabState } from "../../shared/browser-tabs";
import type { BrowserSnapshotResult } from "./browser-cdp-controller";
import type { BrowserAgentBackend } from "./browser-dynamic-tool-adapter";
import {
  BROWSER_MCP_SERVER_NAME,
  BROWSER_MCP_SHELL_ENV_FILTER,
  BrowserMcpRuntime,
  buildBrowserMcpCodexArguments,
} from "./browser-mcp-runtime";

const threadId = "019c1234-1234-7000-8000-000000000001";
const turnId = "turn-1";
const tab: BrowserTabState = {
  threadId,
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
  controlOwner: "agent",
  agentTurnId: turnId,
  permissionRequest: null,
  download: null,
  dialog: null,
  consoleMessages: [],
  debuggerStatus: "attached",
};

describe("BrowserMcpRuntime", () => {
  const runtimes: BrowserMcpRuntime[] = [];
  const children: ChildProcessWithoutNullStreams[] = [];

  afterEach(async () => {
    for (const child of children.splice(0)) child.kill();
    for (const runtime of runtimes.splice(0)) await runtime.stop();
  });

  it("通过 stdio MCP、可信 _meta 和自有 transport 调用唯一 backend", async () => {
    const backend = createBackend();
    const runtime = createRuntime(backend);
    runtimes.push(runtime);
    const launch = await runtime.start();
    expect(launch.codexArgs.join(" ")).not.toContain(
      launch.environment.BLACKRAIN_BROWSER_CAPABILITY_TOKEN,
    );
    runtime.registerThread(threadId);
    runtime.setActiveTurn(threadId, turnId);
    const child = spawn(process.execPath, [adapterPath()], {
      env: { ...process.env, ...launch.environment },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    children.push(child);
    const rpc = createLineRpc(child);

    await expect(
      rpc.request("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      }),
    ).resolves.toMatchObject({
      protocolVersion: "2025-06-18",
      serverInfo: { name: "blackrain-browser" },
    });
    const listed = await rpc.request("tools/list", {});
    expect(listed.tools.map((tool: { name: string }) => tool.name)).toContain(
      "browser_tabs_list",
    );
    expect(listed.tools.map((tool: { name: string }) => tool.name)).not.toContain(
      "js",
    );
    const locateTool = listed.tools.find(
      (tool: { name: string }) => tool.name === "browser_locate",
    );
    expect(locateTool).toMatchObject({
      inputSchema: {
        properties: {
          state: { enum: ["attached", "visible", "actionable"] },
          timeoutMs: { type: "integer", minimum: 0, maximum: 10_000 },
        },
      },
    });

    await expect(
      rpc.request("tools/call", {
        name: "browser_tabs_list",
        arguments: {},
        _meta: trustedMeta(),
      }),
    ).resolves.toMatchObject({
      structuredContent: [tab],
    });
    expect(backend.listTabsForAgent).toHaveBeenCalledWith({
      threadId,
      routeKey: "browser-sidebar",
    });
  });

  it("拒绝缺失可信 metadata、跨 thread 和旧 turn", async () => {
    const backend = createBackend();
    const runtime = createRuntime(backend);
    runtimes.push(runtime);
    const launch = await runtime.start();
    runtime.registerThread(threadId);
    runtime.setActiveTurn(threadId, turnId);
    const child = spawn(process.execPath, [adapterPath()], {
      env: { ...process.env, ...launch.environment },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    children.push(child);
    const rpc = createLineRpc(child);
    await rpc.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });

    await expect(
      rpc.request("tools/call", {
        name: "browser_tabs_list",
        arguments: {},
      }),
    ).rejects.toThrow("可信 request _meta");
    await expect(
      rpc.request("tools/call", {
        name: "browser_tabs_list",
        arguments: {},
        _meta: trustedMeta({ threadId: "other-thread" }),
      }),
    ).rejects.toThrow("metadata 不一致");
    await expect(
      rpc.request("tools/call", {
        name: "browser_tabs_list",
        arguments: {},
        _meta: trustedMeta({ turnId: "old-turn" }),
      }),
    ).resolves.toMatchObject({ isError: true });
    expect(backend.listTabsForAgent).not.toHaveBeenCalled();
  });

  it("MCP 取消会中止 backend 调用，并在下一次调用自动重连", async () => {
    let operationSignal: AbortSignal | undefined;
    const backend = createBackend();
    backend.snapshotForAgent = vi.fn((_input, signal): Promise<BrowserSnapshotResult> => {
      operationSignal = signal;
      return new Promise<BrowserSnapshotResult>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    });
    const runtime = createRuntime(backend);
    runtimes.push(runtime);
    const launch = await runtime.start();
    runtime.registerThread(threadId);
    runtime.setActiveTurn(threadId, turnId);
    const child = spawn(process.execPath, [adapterPath()], {
      env: { ...process.env, ...launch.environment },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    children.push(child);
    const rpc = createLineRpc(child);
    await rpc.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    const call = rpc.startRequest("tools/call", {
      name: "browser_snapshot",
      arguments: { browserTabId: "tab-1", viewGeneration: 1 },
      _meta: trustedMeta(),
    });
    await vi.waitFor(() => expect(operationSignal).toBeDefined());
    rpc.notify("notifications/cancelled", {
      requestId: call.id,
      reason: "test cancellation",
    });

    await expect(call.promise).resolves.toMatchObject({ isError: true });
    await vi.waitFor(() => expect(operationSignal?.aborted).toBe(true));
    await expect(
      rpc.request("tools/call", {
        name: "browser_tabs_list",
        arguments: {},
        _meta: trustedMeta(),
      }),
    ).resolves.toMatchObject({ structuredContent: [tab] });
  });

  it("生成进程级 MCP 配置并通过 env_vars 白名单转发 bootstrap", () => {
    const args = buildBrowserMcpCodexArguments(
      "node",
      adapterPath(),
    );
    expect(args.join(" ")).toContain(
      `mcp_servers.${BROWSER_MCP_SERVER_NAME}.command`,
    );
    expect(args.join(" ")).toContain("required=true");
    expect(args.join(" ")).toContain("env_vars");
    expect(args.join(" ")).toContain(
      `shell_environment_policy.filters.${JSON.stringify(BROWSER_MCP_SHELL_ENV_FILTER)}="exclude"`,
    );
  });
});

function createRuntime(backend: BrowserAgentBackend) {
  return new BrowserMcpRuntime({
    backend,
    appBuild: "0.7.68-test",
    resolveNodeExecutablePath: () => process.execPath,
    resolveAdapterPath: adapterPath,
    resolveClientPath: clientPath,
  });
}

function adapterPath() {
  return fileURLToPath(
    new URL("../../../resources/browser-client/browser-mcp-server.mjs", import.meta.url),
  );
}

function clientPath() {
  return fileURLToPath(
    new URL("../../../resources/browser-client/browser-client.mjs", import.meta.url),
  );
}

function trustedMeta(overrides: { threadId?: string; turnId?: string } = {}) {
  const metadataThreadId = threadId;
  return {
    threadId: overrides.threadId ?? threadId,
    "x-codex-turn-metadata": {
      session_id: metadataThreadId,
      thread_id: metadataThreadId,
      turn_id: overrides.turnId ?? turnId,
      model: "test-model",
    },
  };
}

function createLineRpc(child: ChildProcessWithoutNullStreams) {
  let nextId = 1;
  let buffer = "";
  const pending = new Map<
    number,
    { resolve: (value: any) => void; reject: (error: Error) => void }
  >();
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    for (;;) {
      const index = buffer.indexOf("\n");
      if (index < 0) break;
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      const request = pending.get(message.id);
      if (!request) continue;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    }
  });
  return {
    startRequest(method: string, params: unknown) {
      const id = nextId++;
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      const promise = new Promise<any>((resolve, reject) =>
        pending.set(id, { resolve, reject }),
      );
      return { id, promise };
    },
    request(method: string, params: unknown): Promise<any> {
      return this.startRequest(method, params).promise;
    },
    notify(method: string, params: unknown): void {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
    },
  };
}

function createBackend(): BrowserAgentBackend {
  return {
    listTabsForAgent: vi.fn(() => [tab]),
    createTabForAgent: vi.fn(async () => tab),
    navigateForAgent: vi.fn(async () => tab),
    controlForAgent: vi.fn(() => tab),
    completeAgentTurn: vi.fn(),
    snapshotForAgent: vi.fn(async () => ({
      snapshotId: "snapshot-1",
      url: tab.url,
      text: "document Example",
    })),
    clickForAgent: vi.fn(async () => tab),
    typeTextForAgent: vi.fn(async () => tab),
    screenshotForAgent: vi.fn(async () => ({
      ...tab,
      mimeType: "image/png" as const,
      imageUrl: "data:image/png;base64,AA==",
    })),
  };
}
