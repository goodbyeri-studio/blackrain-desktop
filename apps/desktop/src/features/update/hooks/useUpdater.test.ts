// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlackRainHostApi } from "../../../../electron/shared/host-api";
import type { DebugEntry } from "../../../types";
import { STORAGE_KEY_PENDING_POST_UPDATE_VERSION } from "../utils/postUpdateRelease";
import { useUpdater } from "./useUpdater";

const check = vi.fn();
const download = vi.fn();
const install = vi.fn();

describe("useUpdater Electron 更新链路", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.blackrain = {
      updates: { check, download, install },
    } as unknown as BlackRainHostApi;
  });

  afterEach(() => {
    delete window.blackrain;
    vi.useRealTimers();
  });

  it("检查失败时进入 error 并记录诊断", async () => {
    check.mockRejectedValue(new Error("manifest unavailable"));
    const onDebug = vi.fn();
    const { result } = renderHook(() => useUpdater({ autoCheckOnMount: false, onDebug }));

    await act(async () => {
      await result.current.checkForUpdates();
    });

    expect(result.current.state).toMatchObject({
      stage: "error",
      error: "manifest unavailable",
    });
    expect(onDebug).toHaveBeenCalledWith(expect.objectContaining({
      label: "updater/error",
      source: "error",
      payload: "manifest unavailable",
    } satisfies Partial<DebugEntry>));
  });

  it("手动检查无更新时短暂显示 latest", async () => {
    vi.useFakeTimers();
    check.mockResolvedValue({ available: false });
    const { result } = renderHook(() => useUpdater({ autoCheckOnMount: false }));

    await act(async () => {
      await result.current.checkForUpdates({ announceNoUpdate: true });
    });
    expect(result.current.state.stage).toBe("latest");

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current.state.stage).toBe("idle");
  });

  it("按 typed API 检查、下载并交给 Windows 安装器", async () => {
    check.mockResolvedValue({
      available: true,
      version: "1.2.3",
      downloadUrl: "https://updates.example/BlackRain.msix",
      sha256: "a".repeat(64),
    });
    download.mockResolvedValue({ version: "1.2.3", stagedPath: "C:\\staging\\1.2.3.msix" });
    install.mockResolvedValue(undefined);
    const { result } = renderHook(() => useUpdater({ autoCheckOnMount: false }));

    await act(async () => {
      await result.current.startUpdate();
    });
    expect(result.current.state).toMatchObject({ stage: "available", version: "1.2.3" });

    await act(async () => {
      await result.current.startUpdate();
    });
    await waitFor(() => expect(result.current.state.stage).toBe("restarting"));
    expect(download).toHaveBeenCalledWith({
      version: "1.2.3",
      downloadUrl: "https://updates.example/BlackRain.msix",
      sha256: "a".repeat(64),
    });
    expect(install).toHaveBeenCalledWith({ stagedPath: "C:\\staging\\1.2.3.msix" });
    expect(window.localStorage.getItem(STORAGE_KEY_PENDING_POST_UPDATE_VERSION)).toBe("1.2.3");
  });

  it("清理与当前版本不匹配的升级后标记", async () => {
    window.localStorage.setItem(STORAGE_KEY_PENDING_POST_UPDATE_VERSION, "0.0.1");
    renderHook(() => useUpdater({ autoCheckOnMount: false }));

    await waitFor(() => {
      expect(window.localStorage.getItem(STORAGE_KEY_PENDING_POST_UPDATE_VERSION)).toBeNull();
    });
  });
});
