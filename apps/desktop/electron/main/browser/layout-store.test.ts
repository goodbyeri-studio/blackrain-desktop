import { describe, expect, it } from "vitest";
import { BrowserLayoutStore } from "./layout-store";

const validLayout = {
  windowGeneration: 1,
  layoutRevision: 1,
  threadId: "thread-1",
  routeKey: "route-1",
  activeTabId: "tab-1",
  views: [
    {
      browserTabId: "tab-1",
      viewGeneration: 1,
      bounds: { x: 10, y: 20, width: 800, height: 600 },
      visible: true,
      occluded: false,
    },
  ],
};

describe("BrowserLayoutStore", () => {
  it("接受当前窗口 generation 的单调 revision", () => {
    const store = new BrowserLayoutStore();
    expect(store.update(7, 1, validLayout)).toEqual({
      accepted: true,
      layoutRevision: 1,
    });
    expect(
      store.update(7, 1, { ...validLayout, layoutRevision: 2 }),
    ).toEqual({ accepted: true, layoutRevision: 2 });
  });

  it("拒绝旧 generation 和旧 revision", () => {
    const store = new BrowserLayoutStore();
    expect(() => store.update(7, 2, validLayout)).toThrow(/generation/);
    store.update(7, 1, validLayout);
    expect(() => store.update(7, 1, validLayout)).toThrow(/revision/);
  });

  it("拒绝重复 tab 和无效 active tab", () => {
    const store = new BrowserLayoutStore();
    expect(() =>
      store.update(7, 1, {
        ...validLayout,
        activeTabId: "missing",
        views: [...validLayout.views, validLayout.views[0]],
      }),
    ).toThrow();
  });
});
