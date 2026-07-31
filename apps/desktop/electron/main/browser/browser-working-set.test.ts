import { describe, expect, it } from "vitest";
import {
  MAX_LIVE_BROWSER_TABS_PER_OWNER,
  planBrowserWorkingSet,
} from "./browser-working-set";

describe("planBrowserWorkingSet", () => {
  it("保留 8 个最近活动页面并挂起其余页面", () => {
    const states = planBrowserWorkingSet(
      Array.from({ length: 12 }, (_, index) => ({
        browserTabId: `tab-${index}`,
        crashed: false,
        lastActiveAt: index,
        protected: false,
      })),
    );

    expect(
      [...states.values()].filter((state) => state === "live"),
    ).toHaveLength(MAX_LIVE_BROWSER_TABS_PER_OWNER);
    expect(states.get("tab-11")).toBe("live");
    expect(states.get("tab-0")).toBe("suspended");
  });

  it("优先保护可见或正在运行的页面并隔离 crashed 页面", () => {
    const states = planBrowserWorkingSet(
      [
        { browserTabId: "visible", crashed: false, lastActiveAt: 1, protected: true },
        { browserTabId: "running", crashed: false, lastActiveAt: 0, protected: true },
        { browserTabId: "recent", crashed: false, lastActiveAt: 3, protected: false },
        { browserTabId: "old", crashed: false, lastActiveAt: 2, protected: false },
        { browserTabId: "crashed", crashed: true, lastActiveAt: 4, protected: false },
      ],
      3,
    );

    expect(states).toEqual(
      new Map([
        ["crashed", "crashed"],
        ["visible", "live"],
        ["running", "live"],
        ["recent", "live"],
        ["old", "suspended"],
      ]),
    );
  });
});
