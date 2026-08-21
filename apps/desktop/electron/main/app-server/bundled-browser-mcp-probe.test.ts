import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { BrowserAgentBackend } from "../browser/browser-dynamic-tool-adapter";
import {
  BROWSER_MCP_SERVER_NAME,
  BrowserMcpRuntime,
} from "../browser/browser-mcp-runtime";
import { AppServerProcess } from "./app-server-process";
import { resolveCodexExecutablePath } from "./codex-executable";

const probeEnabled = process.env.BLACKRAIN_BUNDLED_CODEX_PROBE === "1";
const turnId = "blackrain-mcp-probe-turn";

describe.skipIf(!probeEnabled)("bundled codex Browser MCP 生产接缝探针", () => {
  it("注册 stdio MCP、发现窄接口工具并透传可信 route metadata", async () => {
    if (process.platform !== "win32") {
      throw new Error("bundled Browser MCP 探针仅支持 Windows x64");
    }
    const resourcesPath = fileURLToPath(
      new URL("../../../resources/", import.meta.url),
    );
    const executablePath = resolveCodexExecutablePath({
      resourcesPath,
      allowOverride: false,
      platform: "win32",
    });
    const browserResources = path.join(resourcesPath, "browser-client");
    const probeHome = await mkdtemp(
      path.join(os.tmpdir(), "blackrain-browser-mcp-probe-"),
    );
    const backend = createBackend();
    const browserMcp = new BrowserMcpRuntime({
      backend,
      appBuild: "0.7.68-bundled-probe",
      resolveNodeExecutablePath: () => {
        const nodePath = process.env.BLACKRAIN_BROWSER_MCP_PROBE_NODE;
        if (!nodePath || !path.isAbsolute(nodePath)) {
          throw new Error("bundled Browser MCP 探针缺少锁定 Node runtime");
        }
        return nodePath;
      },
      resolveAdapterPath: () =>
        path.join(browserResources, "browser-mcp-server.mjs"),
      resolveClientPath: () => path.join(browserResources, "browser-client.mjs"),
    });
    const launch = await browserMcp.start();
    const appServer = new AppServerProcess({
      executablePath,
      cwd: process.cwd(),
      clientVersion: "0.7.68-bundled-browser-mcp-probe",
      codexHome: { mode: "custom", path: probeHome },
      extraCodexArgs: launch.codexArgs,
      environment: launch.environment,
      connection: { serverRequestTimeoutMs: 5_000 },
    });

    try {
      const client = await appServer.start();
      const threadResponse = (await client.request("thread/start", {
        cwd: process.cwd(),
        runtimeWorkspaceRoots: [process.cwd()],
        approvalPolicy: "never",
        sandbox: "read-only",
        threadSource: "blackrain-mcp-probe",
      })) as { thread: { id: string } };
      const threadId = threadResponse.thread.id;
      browserMcp.registerThread(threadId);
      browserMcp.setActiveTurn(threadId, turnId);

      const status = (await client.request("mcpServerStatus/list", {
        threadId,
        detail: "toolsAndAuthOnly",
      })) as { data: Array<{ name: string; tools: Record<string, unknown> }> };
      const server = status.data.find(
        (candidate) => candidate.name === BROWSER_MCP_SERVER_NAME,
      );
      expect(server).toBeDefined();
      expect(Object.keys(server?.tools ?? {})).toContain("browser_tabs_list");
      expect(Object.keys(server?.tools ?? {})).not.toContain("js");

      const result = (await client.request("mcpServer/tool/call", {
        threadId,
        server: BROWSER_MCP_SERVER_NAME,
        tool: "browser_tabs_list",
        arguments: {},
        _meta: {
          "x-codex-turn-metadata": {
            session_id: threadId,
            thread_id: threadId,
            turn_id: turnId,
            model: "probe",
          },
        },
      })) as { isError?: boolean; structuredContent?: unknown };
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual([]);
      expect(backend.listTabsForAgent).toHaveBeenCalledWith({
        threadId,
        routeKey: "browser-sidebar",
      });
    } finally {
      await appServer.stop();
      await browserMcp.stop();
      await rm(probeHome, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 200,
      });
    }
  }, 90_000);
});

function createBackend(): BrowserAgentBackend {
  const unexpected = (operation: string): never => {
    throw new Error(`bundled Browser MCP 探针不执行 ${operation}`);
  };
  return {
    listTabsForAgent: vi.fn<BrowserAgentBackend["listTabsForAgent"]>(() => []),
    createTabForAgent: async () => unexpected("new_tab"),
    navigateForAgent: async () => unexpected("navigate"),
    controlForAgent: () => unexpected("control"),
    snapshotForAgent: async () => unexpected("snapshot"),
    clickForAgent: async () => unexpected("click"),
    typeTextForAgent: async () => unexpected("type_text"),
    screenshotForAgent: async () => unexpected("screenshot"),
  };
}
