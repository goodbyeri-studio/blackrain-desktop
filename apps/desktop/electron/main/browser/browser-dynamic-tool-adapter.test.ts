import { describe, expect, it, vi } from "vitest";
import type { BrowserTabState } from "../../shared/browser-tabs";
import {
  BROWSER_DYNAMIC_TOOLS,
  BrowserDynamicToolAdapter,
  type BrowserAgentBackend,
} from "./browser-dynamic-tool-adapter";

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

function request(
  tool: string,
  args: unknown,
  signal = new AbortController().signal,
) {
  return {
    id: "rpc-1",
    method: "item/tool/call",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      callId: "call-1",
      namespace: "blackrain_browser",
      tool,
      arguments: args,
    },
    signal,
  };
}

function backend(): BrowserAgentBackend {
  return {
    listTabsForAgent: vi.fn(() => [tab]),
    createTabForAgent: vi.fn(async () => tab),
    navigateForAgent: vi.fn(async () => tab),
    controlForAgent: vi.fn(() => tab),
    snapshotForAgent: vi.fn(async () => ({
      snapshotId: "snapshot-1",
      url: tab.url,
      text: 'RootWebArea "Example"',
    })),
    locateForAgent: vi.fn(async () => ({
      snapshotId: "snapshot-1",
      ref: "ref-1",
      role: "button",
      name: "提交",
      url: tab.url,
    })),
    clickForAgent: vi.fn(async () => ({
      browserTabId: tab.browserTabId,
      viewGeneration: tab.viewGeneration,
      url: tab.url,
    })),
    typeTextForAgent: vi.fn(async () => ({
      browserTabId: tab.browserTabId,
      viewGeneration: tab.viewGeneration,
      url: tab.url,
    })),
    screenshotForAgent: vi.fn(async () => ({
      browserTabId: tab.browserTabId,
      viewGeneration: tab.viewGeneration,
      url: tab.url,
      mimeType: "image/png" as const,
      imageUrl: "data:image/png;base64,iVBORw0KGgo=",
    })),
    completeAgentTurn: vi.fn(),
  };
}

describe("BrowserDynamicToolAdapter", () => {
  it("只为已注册的 active thread/turn 路由到同一 Browser backend", async () => {
    const browser = backend();
    const adapter = new BrowserDynamicToolAdapter(browser);
    adapter.registerThread("thread-1");
    adapter.handleNotification("turn/started", {
      threadId: "thread-1",
      turn: { id: "turn-1" },
    });

    await expect(adapter.handleServerRequest(request("list_tabs", {}))).resolves.toEqual({
      contentItems: [{ type: "inputText", text: JSON.stringify([tab]) }],
      success: true,
    });
    expect(browser.listTabsForAgent).toHaveBeenCalledWith({
      threadId: "thread-1",
      routeKey: "browser-sidebar",
    });

    await adapter.handleServerRequest(
      request("goto", {
        browserTabId: "tab-1",
        viewGeneration: 1,
        url: "https://openai.com/",
      }),
    );
    expect(browser.navigateForAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-1",
        turnId: "turn-1",
        browserTabId: "tab-1",
        url: "https://openai.com/",
      }),
      expect.any(AbortSignal),
    );

    await expect(
      adapter.handleServerRequest(request("new_tab", { url: "https://openai.com/" })),
    ).resolves.toEqual({
      contentItems: [{ type: "inputText", text: JSON.stringify(tab) }],
      success: true,
    });
    expect(browser.createTabForAgent).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "thread-1", turnId: "turn-1", url: "https://openai.com/" }),
      expect.any(AbortSignal),
    );

    adapter.handleNotification("turn/completed", {
      threadId: "thread-1",
      turn: { id: "turn-1" },
    });
    expect(browser.completeAgentTurn).toHaveBeenCalledWith(
      { threadId: "thread-1", routeKey: "browser-sidebar" },
      "turn-1",
    );
  });

  it("拒绝旧 turn、未知工具和已取消请求", async () => {
    const adapter = new BrowserDynamicToolAdapter(backend());
    adapter.registerThread("thread-1");
    adapter.handleNotification("turn/started", {
      threadId: "thread-1",
      turn: { id: "turn-other" },
    });
    await expect(adapter.handleServerRequest(request("list_tabs", {}))).rejects.toThrow(
      /thread\/turn/,
    );

    adapter.handleNotification("turn/started", {
      threadId: "thread-1",
      turn: { id: "turn-1" },
    });
    await expect(adapter.handleServerRequest(request("unknown", {}))).rejects.toThrow();

    const controller = new AbortController();
    controller.abort();
    await expect(
      adapter.handleServerRequest(request("list_tabs", {}, controller.signal)),
    ).rejects.toThrow(/取消/);
  });

  it("将 snapshot/ref/input/screenshot 路由到同一受限 backend", async () => {
    const browser = backend();
    const adapter = new BrowserDynamicToolAdapter(browser);
    adapter.registerThread("thread-1");
    adapter.handleNotification("turn/started", {
      threadId: "thread-1",
      turn: { id: "turn-1" },
    });

    const snapshot = await adapter.handleServerRequest(
      request("snapshot", { browserTabId: "tab-1", viewGeneration: 1 }),
    );
    expect(snapshot).toEqual({
      contentItems: [
        {
          type: "inputText",
          text: JSON.stringify({
            snapshotId: "snapshot-1",
            url: tab.url,
            text: 'RootWebArea "Example"',
          }),
        },
      ],
      success: true,
    });

    await adapter.handleServerRequest(
      request("locate", {
        browserTabId: "tab-1",
        viewGeneration: 1,
        role: "button",
        name: "提交",
        exact: true,
        state: "actionable",
        timeoutMs: 2_000,
      }),
    );
    expect(browser.locateForAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "button",
        name: "提交",
        exact: true,
        state: "actionable",
        timeoutMs: 2_000,
      }),
      expect.any(AbortSignal),
    );

    const refArgs = {
      browserTabId: "tab-1",
      viewGeneration: 1,
      snapshotId: "snapshot-1",
      ref: "ref-1",
    };
    await adapter.handleServerRequest(request("click", refArgs));
    await adapter.handleServerRequest(
      request("type_text", { ...refArgs, text: "private input" }),
    );
    expect(browser.clickForAgent).toHaveBeenCalledWith(
      expect.objectContaining(refArgs),
      expect.any(AbortSignal),
    );
    expect(browser.typeTextForAgent).toHaveBeenCalledWith(
      expect.objectContaining({ ...refArgs, text: "private input" }),
      expect.any(AbortSignal),
    );

    await expect(
      adapter.handleServerRequest(
        request("screenshot", {
          browserTabId: "tab-1",
          viewGeneration: 1,
          fullPage: true,
        }),
      ),
    ).resolves.toEqual({
      contentItems: [
        { type: "inputImage", imageUrl: "data:image/png;base64,iVBORw0KGgo=" },
      ],
      success: true,
    });
    expect(browser.screenshotForAgent).toHaveBeenCalledWith(
      expect.objectContaining({ fullPage: true }),
      expect.any(AbortSignal),
    );

    const names = BROWSER_DYNAMIC_TOOLS[0].tools.map((tool) => tool.name);
    expect(names).toEqual([
      "list_tabs",
      "new_tab",
      "goto",
      "back",
      "forward",
      "reload",
      "stop",
      "snapshot",
      "locate",
      "click",
      "hover",
      "type_text",
      "press_key",
      "scroll",
      "screenshot",
      "finalize",
    ]);
  });
});
