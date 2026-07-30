import { describe, expect, it } from "vitest";
import {
  clampBrowserBounds,
  isAllowedPageNavigation,
  normalizeBrowserUrl,
} from "./browser-policy";

describe("Browser page policy", () => {
  it("只接受无内嵌凭据的 http/https URL", () => {
    expect(normalizeBrowserUrl("https://example.com/path")).toBe(
      "https://example.com/path",
    );
    expect(isAllowedPageNavigation("about:blank")).toBe(true);
    expect(isAllowedPageNavigation("http://127.0.0.1:3000/")).toBe(true);
    expect(() => normalizeBrowserUrl("file:///C:/secret.txt")).toThrow(
      "http/https",
    );
    expect(() => normalizeBrowserUrl("https://user:pass@example.com")).toThrow(
      "凭据",
    );
    expect(isAllowedPageNavigation("javascript:alert(1)")).toBe(false);
  });

  it("将 renderer bounds 约束在窗口 content area", () => {
    expect(
      clampBrowserBounds(
        { x: -20, y: 50, width: 900, height: 800 },
        [800, 600],
      ),
    ).toEqual({ x: 0, y: 50, width: 800, height: 550 });
    expect(
      clampBrowserBounds(
        { x: 900, y: 700, width: 100, height: 100 },
        [800, 600],
      ),
    ).toEqual({ x: 800, y: 600, width: 0, height: 0 });
  });
});
