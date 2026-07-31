import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { BrowserTabState } from "../../shared/browser-tabs";
import type { BrowserAgentBackend } from "./browser-dynamic-tool-adapter";
import { BrowserClientRuntime } from "./browser-client-runtime";

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

function backend(): BrowserAgentBackend {
  return {
    listTabsForAgent: vi.fn(() => [tab]),
    createTabForAgent: vi.fn(async () => tab),
    navigateForAgent: vi.fn(async () => tab),
    controlForAgent: vi.fn(() => tab),
    snapshotForAgent: vi.fn(async () => ({
      snapshotId: "snapshot-1",
      url: tab.url,
      text: "Example",
    })),
    clickForAgent: vi.fn(async () => tab),
    typeTextForAgent: vi.fn(async () => tab),
    screenshotForAgent: vi.fn(async () => ({
      browserTabId: tab.browserTabId,
      viewGeneration: tab.viewGeneration,
      url: tab.url,
      mimeType: "image/png" as const,
      imageUrl: "data:image/png;base64,iVBORw0KGgo=",
    })),
  };
}

describe("BrowserClientRuntime", () => {
  it("实际加载打包 client，并按 thread/turn/generation 调用 framed transport", async () => {
    const browser = backend();
    const runtime = new BrowserClientRuntime({
      backend: browser,
      appBuild: "0.7.68",
      resolveClientModulePath: () =>
        path.resolve("resources/browser-client/browser-client.mjs"),
    });
    runtime.registerThread("thread-1");

    await expect(
      runtime.call(
        "thread-1",
        "turn-1",
        "list_tabs",
        {},
        new AbortController().signal,
      ),
    ).resolves.toEqual([tab]);
    expect(browser.listTabsForAgent).toHaveBeenCalledWith({
      threadId: "thread-1",
      routeKey: "browser-sidebar",
    });

    runtime.completeTurn("thread-1", "turn-1");
    await runtime.stop();
  });
});
