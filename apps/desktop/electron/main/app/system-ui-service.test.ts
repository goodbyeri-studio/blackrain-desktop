import { beforeEach, describe, expect, it, vi } from "vitest";
import { SystemUiService } from "./system-ui-service";

const popup = vi.hoisted(() => vi.fn());
const buildFromTemplate = vi.hoisted(() =>
  vi.fn((_template: Array<{ click: () => void }>) => ({ popup })),
);
const show = vi.hoisted(() => vi.fn());
const notification = vi.hoisted(() => vi.fn(function NotificationMock() {
  return { show };
}));

vi.mock("electron", () => ({
  Menu: { buildFromTemplate },
  Notification: Object.assign(notification, { isSupported: vi.fn(() => true) }),
}));

describe("SystemUiService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("只接受 schema 内的菜单项并返回用户选择", async () => {
    const service = new SystemUiService();
    const result = service.popupContextMenu({} as never, {
      x: 12,
      y: 24,
      items: [{ kind: "item", id: "open", label: "Open" }],
    });
    const template = buildFromTemplate.mock.calls[0]?.[0];
    template![0].click();
    popup.mock.calls[0]?.[0].callback();

    await expect(result).resolves.toBe("open");
    expect(() => service.popupContextMenu({} as never, {
      x: 0,
      y: 0,
      items: [{ kind: "item", id: "", label: "invalid" }],
    })).toThrow();
  });

  it("通过 Electron Notification 展示经过校验的通知", () => {
    const service = new SystemUiService();
    service.showNotification({ title: "BlackRain", body: "Turn complete" });

    expect(notification).toHaveBeenCalledWith({ title: "BlackRain", body: "Turn complete" });
    expect(show).toHaveBeenCalledOnce();
    expect(() => service.showNotification({ title: "", body: "invalid" })).toThrow();
  });

  it("只接受受支持的 thread 深链并扇出 typed 事件", () => {
    const service = new SystemUiService();
    const listener = vi.fn();
    service.subscribe(listener);

    service.openDeepLink("blackrain://thread/open?workspaceId=ws-1&threadId=thread-1");
    expect(listener).toHaveBeenCalledWith({
      kind: "tray-open-thread",
      workspaceId: "ws-1",
      threadId: "thread-1",
    });
    expect(() => service.openDeepLink("blackrain://settings/open"))
      .toThrow("不支持的 BlackRain 深链");
    expect(() => service.openDeepLink("blackrain://thread/open?workspaceId=&threadId=x"))
      .toThrow();
  });
});
