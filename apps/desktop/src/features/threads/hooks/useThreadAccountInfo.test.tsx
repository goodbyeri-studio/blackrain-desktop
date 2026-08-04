// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getAccountInfo } from "@services/desktop";
import { useThreadAccountInfo } from "./useThreadAccountInfo";

vi.mock("@services/desktop", () => ({
  getAccountInfo: vi.fn(),
}));

describe("useThreadAccountInfo", () => {
  it("refreshes account info on connect and dispatches snapshot", async () => {
    vi.mocked(getAccountInfo).mockResolvedValue({
      result: {
        account: { type: "chatgpt", email: "user@example.com", planType: "pro" },
        requiresOpenaiAuth: false,
      },
    });

    const dispatch = vi.fn();

    renderHook(() =>
      useThreadAccountInfo({
        activeWorkspaceId: "ws-1",
        activeWorkspaceConnected: true,
        dispatch,
      }),
    );

    await waitFor(() => {
      expect(getAccountInfo).toHaveBeenCalledWith("ws-1");
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "setAccountInfo",
      workspaceId: "ws-1",
      account: {
        type: "chatgpt",
        email: "user@example.com",
        planType: "pro",
        requiresOpenaiAuth: false,
      },
    });
  });
});
