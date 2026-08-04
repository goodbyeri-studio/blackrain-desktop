// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRemoteThreadRefreshOnFocus } from "./useRemoteThreadRefreshOnFocus";

describe("useRemoteThreadRefreshOnFocus", () => {
  let visibilityState: DocumentVisibilityState;

  beforeEach(() => {
    vi.useFakeTimers();
    visibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes the active remote thread on focus with debounce", () => {
    const refreshThread = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useRemoteThreadRefreshOnFocus({
        backendMode: "remote",
        activeWorkspace: {
          id: "ws-1",
          name: "Workspace",
          path: "/tmp/ws-1",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
        activeThreadId: "thread-1",
        refreshThread,
      }),
    );

    act(() => {
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(499);
    });
    expect(refreshThread).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(refreshThread).toHaveBeenCalledWith("ws-1", "thread-1");
  });

  it("refreshes even when workspace is marked disconnected", () => {
    const refreshThread = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useRemoteThreadRefreshOnFocus({
        backendMode: "remote",
        activeWorkspace: {
          id: "ws-1",
          name: "Workspace",
          path: "/tmp/ws-1",
          connected: false,
          settings: { sidebarCollapsed: false },
        },
        activeThreadId: "thread-1",
        refreshThread,
      }),
    );

    act(() => {
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(500);
    });

    expect(refreshThread).toHaveBeenCalledWith("ws-1", "thread-1");
  });

  it("attempts reconnect before refresh when workspace is disconnected", async () => {
    const reconnectWorkspace = vi.fn().mockResolvedValue(undefined);
    const refreshThread = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useRemoteThreadRefreshOnFocus({
        backendMode: "remote",
        activeWorkspace: {
          id: "ws-1",
          name: "Workspace",
          path: "/tmp/ws-1",
          connected: false,
          settings: { sidebarCollapsed: false },
        },
        activeThreadId: "thread-1",
        reconnectWorkspace,
        refreshThread,
      }),
    );

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(reconnectWorkspace).toHaveBeenCalledTimes(1);
    expect(reconnectWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ws-1" }),
    );
    expect(refreshThread).toHaveBeenCalledTimes(1);
    expect(reconnectWorkspace.mock.invocationCallOrder[0]).toBeLessThan(
      refreshThread.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it("does not drop a pending focus refresh when callback identity changes", async () => {
    const firstRefreshThread = vi.fn().mockResolvedValue(undefined);
    const secondRefreshThread = vi.fn().mockResolvedValue(undefined);

    const { rerender } = renderHook(
      (props: { refreshThread: typeof firstRefreshThread }) =>
        useRemoteThreadRefreshOnFocus({
          backendMode: "remote",
          activeWorkspace: {
            id: "ws-1",
            name: "Workspace",
            path: "/tmp/ws-1",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
          activeThreadId: "thread-1",
          refreshThread: props.refreshThread,
        }),
      {
        initialProps: { refreshThread: firstRefreshThread },
      },
    );

    act(() => {
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(250);
    });

    rerender({ refreshThread: secondRefreshThread });

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(firstRefreshThread).not.toHaveBeenCalled();
    expect(secondRefreshThread).toHaveBeenCalledTimes(1);
    expect(secondRefreshThread).toHaveBeenCalledWith("ws-1", "thread-1");
  });

  it("does not poll while processing and refreshes when visibility returns", async () => {
    const refreshThread = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useRemoteThreadRefreshOnFocus({
        backendMode: "remote",
        activeWorkspace: {
          id: "ws-1",
          name: "Workspace",
          path: "/tmp/ws-1",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
        activeThreadId: "thread-1",
        activeThreadIsProcessing: true,
        refreshThread,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(20_000);
      await Promise.resolve();
    });
    expect(refreshThread).toHaveBeenCalledTimes(0);

    await act(async () => {
      visibilityState = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(20_000);
      await Promise.resolve();
    });
    expect(refreshThread).toHaveBeenCalledTimes(0);

    await act(async () => {
      visibilityState = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
    expect(refreshThread).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(20_000);
      await Promise.resolve();
    });
    expect(refreshThread).toHaveBeenCalledTimes(1);
  });

  it("keeps a low-frequency poll for active remote threads when not processing", async () => {
    const refreshThread = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useRemoteThreadRefreshOnFocus({
        backendMode: "remote",
        activeWorkspace: {
          id: "ws-1",
          name: "Workspace",
          path: "/tmp/ws-1",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
        activeThreadId: "thread-1",
        activeThreadIsProcessing: false,
        refreshThread,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(11_999);
      await Promise.resolve();
    });
    expect(refreshThread).toHaveBeenCalledTimes(0);

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(refreshThread).toHaveBeenCalledTimes(1);
  });
});
