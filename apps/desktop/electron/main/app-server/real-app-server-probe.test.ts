import { mkdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BrowserAgentBackend } from "../browser/browser-dynamic-tool-adapter";
import { AppServerRuntime } from "./app-server-runtime";

const codexBin = process.env.BLACKRAIN_CODEX_BIN?.trim();
const probeHome = process.env.BLACKRAIN_CODEX_PROBE_HOME?.trim();

describe.skipIf(!codexBin || !probeHome)("真实 codex app-server 协议探针", () => {
  it("initialize 后用 dynamicTools 启动真实 thread", async () => {
    if (!codexBin || !probeHome) return;
    if (!path.isAbsolute(probeHome)) {
      throw new Error("BLACKRAIN_CODEX_PROBE_HOME 必须是绝对路径");
    }
    mkdirSync(probeHome, { recursive: true });
    const browser: BrowserAgentBackend = {
      listTabsForAgent: () => [],
      navigateForAgent: async () => {
        throw new Error("协议探针不执行 Browser 导航");
      },
      controlForAgent: () => {
        throw new Error("协议探针不执行 Browser 控制");
      },
      snapshotForAgent: async () => {
        throw new Error("协议探针不执行 Browser snapshot");
      },
      clickForAgent: async () => {
        throw new Error("协议探针不执行 Browser click");
      },
      typeTextForAgent: async () => {
        throw new Error("协议探针不执行 Browser type_text");
      },
      screenshotForAgent: async () => {
        throw new Error("协议探针不执行 Browser screenshot");
      },
    };
    const runtime = new AppServerRuntime({
      resolveExecutablePath: () => codexBin,
      cwd: process.cwd(),
      clientVersion: "0.7.68-probe",
      browserBackend: browser,
      codexHome: { mode: "custom", path: probeHome },
    });
    try {
      const thread = await runtime.startThread({ cwd: process.cwd() });
      expect(thread.threadId).toMatch(/^[A-Za-z0-9._:-]+$/);
      expect(runtime.status().state).toBe("ready");
    } finally {
      await runtime.stop();
    }
  }, 30_000);
});
