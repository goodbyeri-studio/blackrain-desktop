/* @vitest-environment jsdom */
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useWindowFocusState } from "./useWindowFocusState";

describe("useWindowFocusState", () => {
	it("uses DOM focus state", () => {
		const { result, unmount } = renderHook(() => useWindowFocusState());
		expect(typeof result.current).toBe("boolean");
		unmount();
	});
});
