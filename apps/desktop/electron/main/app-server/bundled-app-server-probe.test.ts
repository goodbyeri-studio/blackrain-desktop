import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { BrowserAgentBackend } from "../browser/browser-dynamic-tool-adapter";
import { AppServerRuntime } from "./app-server-runtime";
import { resolveCodexExecutablePath } from "./codex-executable";

const probeEnabled = process.env.BLACKRAIN_BUNDLED_CODEX_PROBE === "1";

describe.skipIf(!probeEnabled)("bundled codex app-server 集成探针", () => {
  it("从生产资源布局启动、初始化 thread 并优雅退出", async () => {
    const resourcesPath = fileURLToPath(
      new URL("../../../resources/", import.meta.url),
    );
    // 用宿主平台解析；resolveCodexExecutablePath 会对未 vendored 的
    // 平台/架构给出可定位的错误，不需要在这里再加平台守卫。
    const executablePath = resolveCodexExecutablePath({
      resourcesPath,
      allowOverride: false,
    });
    const probeHome = await mkdtemp(
      path.join(os.tmpdir(), "blackrain-bundled-codex-probe-"),
    );
    const runtime = new AppServerRuntime({
      resolveExecutablePath: () => executablePath,
      cwd: process.cwd(),
      clientVersion: "0.7.68-bundled-probe",
      browserBackend: createProbeBrowserBackend(),
      codexHome: { mode: "custom", path: probeHome },
    });

    try {
      const thread = await runtime.startThread({ cwd: process.cwd() });
      expect(thread.threadId).toMatch(/^[A-Za-z0-9._:-]+$/);
      expect(runtime.status().state).toBe("ready");
    } finally {
      await runtime.stop();
      await rm(probeHome, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 200,
      });
    }

    expect(runtime.status().state).toBe("stopped");
  }, 90_000);
});

function createProbeBrowserBackend(): BrowserAgentBackend {
  const unexpected = (operation: string): never => {
    throw new Error(`bundled 协议探针不执行 Browser ${operation}`);
  };
  return {
    listTabsForAgent: () => [],
    createTabForAgent: async () => unexpected("new_tab"),
    navigateForAgent: async () => unexpected("navigate"),
    controlForAgent: () => unexpected("control"),
    snapshotForAgent: async () => unexpected("snapshot"),
    clickForAgent: async () => unexpected("click"),
    typeTextForAgent: async () => unexpected("type_text"),
    screenshotForAgent: async () => unexpected("screenshot"),
  };
}
