import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserAgentBackend } from "../browser/browser-dynamic-tool-adapter";
import {
  installElectronE2eHarness,
  type ElectronE2eHarness,
} from "./electron-e2e-harness";

const globalHarness = globalThis as typeof globalThis & {
  __blackrainElectronE2e?: ElectronE2eHarness;
};

function backend(): BrowserAgentBackend {
  return {
    listTabsForAgent: vi.fn(() => []),
    createTabForAgent: vi.fn(async () => { throw new Error("not used"); }),
    navigateForAgent: vi.fn(async () => {
      throw new Error("not used");
    }),
    controlForAgent: vi.fn(() => {
      throw new Error("not used");
    }),
    snapshotForAgent: vi.fn(async () => {
      throw new Error("not used");
    }),
    clickForAgent: vi.fn(async () => {
      throw new Error("not used");
    }),
    typeTextForAgent: vi.fn(async () => {
      throw new Error("not used");
    }),
    screenshotForAgent: vi.fn(async () => {
      throw new Error("not used");
    }),
  };
}

afterEach(() => {
  delete globalHarness.__blackrainElectronE2e;
});

describe("Electron E2E main harness", () => {
  it("未显式启用或 packaged 时不安装", () => {
    const browser = backend();
    installElectronE2eHarness(browser, { enabled: false, packaged: false });
    expect(globalHarness.__blackrainElectronE2e).toBeUndefined();

    installElectronE2eHarness(browser, { enabled: true, packaged: true });
    expect(globalHarness.__blackrainElectronE2e).toBeUndefined();
  });

  it("只在开发 E2E 中路由合成的 dynamic tool request", async () => {
    const browser = backend();
    const dispose = installElectronE2eHarness(browser, {
      enabled: true,
      packaged: false,
    });
    const harness = globalHarness.__blackrainElectronE2e;
    expect(harness).toBeDefined();

    harness?.startBrowserTurn("thread-e2e", "turn-e2e");
    await expect(
      harness?.callBrowserTool({
        threadId: "thread-e2e",
        turnId: "turn-e2e",
        tool: "list_tabs",
        arguments: {},
      }),
    ).resolves.toEqual({
      contentItems: [{ type: "inputText", text: "[]" }],
      success: true,
    });
    expect(browser.listTabsForAgent).toHaveBeenCalledWith({
      threadId: "thread-e2e",
      routeKey: "browser-sidebar",
    });

    dispose();
    expect(globalHarness.__blackrainElectronE2e).toBeUndefined();
  });
});
