import type { BrowserWindow } from "electron";
import { describe, expect, it, vi } from "vitest";
import { DesktopDialogService } from "./desktop-dialog-service";

const ownerWindow = {} as BrowserWindow;

describe("DesktopDialogService", () => {
  it("按按钮索引返回确认结果并保留危险操作标签", async () => {
    const provider = {
      showMessageBox: vi.fn(async () => ({
        response: 0,
        checkboxChecked: false,
      })),
    };
    const service = new DesktopDialogService(provider);

    await expect(service.confirm(ownerWindow, {
      message: "Delete workspace?",
      title: "Delete Workspace",
      kind: "warning",
      okLabel: "Delete",
      cancelLabel: "Cancel",
    })).resolves.toBe(true);

    expect(provider.showMessageBox).toHaveBeenCalledWith(ownerWindow, {
      type: "warning",
      title: "Delete Workspace",
      message: "Delete workspace?",
      buttons: ["Delete", "Cancel"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
  });

  it("取消返回 false，消息框只有安全的确认按钮", async () => {
    const provider = {
      showMessageBox: vi
        .fn()
        .mockResolvedValueOnce({ response: 1, checkboxChecked: false })
        .mockResolvedValueOnce({ response: 0, checkboxChecked: false }),
    };
    const service = new DesktopDialogService(provider);

    await expect(service.confirm(ownerWindow, { message: "Continue?" }))
      .resolves.toBe(false);
    await expect(service.message(ownerWindow, {
      message: "Operation failed",
      kind: "error",
    })).resolves.toBeUndefined();

    expect(provider.showMessageBox).toHaveBeenLastCalledWith(ownerWindow, {
      type: "error",
      title: undefined,
      message: "Operation failed",
      buttons: ["OK"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
  });

  it("拒绝空消息和越界枚举", async () => {
    const service = new DesktopDialogService({ showMessageBox: vi.fn() });

    await expect(service.confirm(ownerWindow, { message: "" })).rejects.toThrow();
    await expect(service.message(ownerWindow, {
      message: "x",
      kind: "question",
    })).rejects.toThrow();
  });
});
