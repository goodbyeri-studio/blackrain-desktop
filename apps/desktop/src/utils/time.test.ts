import { afterEach, describe, expect, it, vi } from "vitest";

import { formatRelativeTime } from "./time";

describe("formatRelativeTime", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps labels stable across host locales", () => {
    vi.spyOn(Date, "now").mockReturnValue(
      Date.parse("2026-01-01T10:00:00Z"),
    );

    expect(formatRelativeTime(Date.parse("2026-01-01T12:00:00Z"))).toBe(
      "in 2 hours",
    );
  });
});
