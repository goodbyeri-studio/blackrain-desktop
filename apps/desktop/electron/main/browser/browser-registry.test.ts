import { describe, expect, it } from "vitest";
import { BROWSER_PARTITION } from "./browser-policy";
import {
  BrowserRegistry,
  MAX_BROWSER_TABS_PER_OWNER,
  type BrowserTabRecord,
} from "./browser-registry";

function record(
  overrides: Partial<BrowserTabRecord<{ id: string }>> = {},
): BrowserTabRecord<{ id: string }> {
  return {
    browserTabId: "tab-1",
    viewGeneration: 1,
    documentGeneration: 1,
    threadId: "thread-1",
    routeKey: "route-1",
    url: "about:blank",
    title: "",
    loading: false,
    canGoBack: false,
    canGoForward: false,
    crashed: false,
    error: null,
    controlOwner: "user",
    agentTurnId: null,
    blockedAgentTurnId: null,
    detached: false,
    ownerWebContentsId: 10,
    ownerWindowId: 20,
    ownerWindowGeneration: 2,
    profileId: BROWSER_PARTITION,
    webContentsId: 30,
    view: { id: "view-1" },
    ...overrides,
    permissionRequest: overrides.permissionRequest ?? null,
    download: overrides.download ?? null,
    dialog: overrides.dialog ?? null,
    consoleMessages: overrides.consoleMessages ?? [],
    debuggerStatus: overrides.debuggerStatus ?? "attached",
  };
}

describe("BrowserRegistry", () => {
  it("按 window/thread/route/view generation 校验 ownership", () => {
    const registry = new BrowserRegistry<{ id: string }>();
    registry.add(record());
    const owner = { webContentsId: 10, windowId: 20, windowGeneration: 2 };

    expect(
      registry.requireOwned(
        owner,
        { threadId: "thread-1", routeKey: "route-1" },
        "tab-1",
        1,
      ).webContentsId,
    ).toBe(30);
    expect(() =>
      registry.requireOwned(
        owner,
        { threadId: "other", routeKey: "route-1" },
        "tab-1",
        1,
      ),
    ).toThrow(/ownership/);
    expect(() =>
      registry.requireOwned(
        { ...owner, windowGeneration: 3 },
        { threadId: "thread-1", routeKey: "route-1" },
        "tab-1",
        1,
      ),
    ).toThrow(/generation/);
  });

  it("拒绝重复 tab 并按 owner 清单和移除", () => {
    const registry = new BrowserRegistry<{ id: string }>();
    registry.add(record());
    expect(() => registry.add(record())).toThrow(/已存在/);
    expect(
      registry.listOwned({
        webContentsId: 10,
        windowId: 20,
        windowGeneration: 2,
      }),
    ).toHaveLength(1);
    expect(registry.remove("tab-1")?.view.id).toBe("view-1");
    expect(registry.all()).toHaveLength(0);
  });

  it("Agent 路径仍按 thread/route/view generation 使用同一 record", () => {
    const registry = new BrowserRegistry<{ id: string }>();
    registry.add(record());
    const scope = { threadId: "thread-1", routeKey: "route-1" };

    expect(registry.listForRoute(scope)[0]?.view.id).toBe("view-1");
    expect(registry.requireForRoute(scope, "tab-1", 1).webContentsId).toBe(30);
    expect(() => registry.requireForRoute(scope, "tab-1", 2)).toThrow(
      /generation/,
    );
  });

  it("按 owner 限制 tab 数量，不影响其他 owner", () => {
    const registry = new BrowserRegistry<{ id: string }>();
    const owner = { webContentsId: 10, windowId: 20, windowGeneration: 2 };

    for (let index = 0; index < MAX_BROWSER_TABS_PER_OWNER; index += 1) {
      registry.assertCanAddForOwner(owner);
      registry.add(
        record({
          browserTabId: `tab-${index}`,
          webContentsId: 100 + index,
          view: { id: `view-${index}` },
        }),
      );
    }

    expect(() => registry.assertCanAddForOwner(owner)).toThrow(/上限/);
    expect(() =>
      registry.assertCanAddForOwner({
        webContentsId: 11,
        windowId: 21,
        windowGeneration: 1,
      }),
    ).not.toThrow();
  });
});
