// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLayoutMode } from "./useLayoutMode";

vi.mock("../../../services/tauri", () => ({
  isMobileRuntime: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../../utils/platformPaths", () => ({
  isMobilePlatform: () => false,
}));

describe("useLayoutMode", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      value: 1200,
      writable: true,
      configurable: true,
    });
  });

  it("switches to the single-column phone layout before sidebar content collapses", () => {
    const { result } = renderHook(() => useLayoutMode());
    expect(result.current).toBe("desktop");

    act(() => {
      window.innerWidth = 760;
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current).toBe("phone");
  });

  it("keeps the two-column tablet layout in the intermediate window range", () => {
    window.innerWidth = 960;

    const { result } = renderHook(() => useLayoutMode());

    expect(result.current).toBe("tablet");
  });
});
