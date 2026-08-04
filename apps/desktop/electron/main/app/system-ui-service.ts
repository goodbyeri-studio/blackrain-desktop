import {
  Menu,
  Notification,
  Tray,
  nativeImage,
  type BrowserWindow,
} from "electron";
import {
  ContextMenuInputSchema,
  MenuAcceleratorInputSchema,
  NotificationInputSchema,
  SystemUiEventSchema,
  TrayRecentThreadsInputSchema,
  TraySessionUsageSchema,
  type ContextMenuResult,
  type SystemUiEvent,
  type TrayRecentThreadEntry,
  type TraySessionUsage,
} from "../../shared/system";

export class SystemUiService {
  readonly #listeners = new Set<(event: SystemUiEvent) => void>();
  #tray: Tray | null = null;
  #owner: BrowserWindow | null = null;
  #recentThreads: TrayRecentThreadEntry[] = [];
  #usage: TraySessionUsage = null;
  #quit: (() => void) | null = null;

  initializeTray(owner: BrowserWindow, iconPath: string, quit: () => void): void {
    this.#owner = owner;
    this.#quit = quit;
    if (this.#tray) return;
    const icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) throw new Error("托盘图标资源无效");
    this.#tray = new Tray(icon);
    this.#tray.setToolTip("BlackRain");
    this.#tray.on("click", () => this.#showOwner());
    this.#rebuildTrayMenu();
  }

  subscribe(listener: (event: SystemUiEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  setAccelerators(input: unknown): void {
    const updates = MenuAcceleratorInputSchema.parse(input);
    const template = updates
      .filter((entry) => entry.accelerator)
      .map((entry) => ({
        label: entry.id,
        accelerator: entry.accelerator ?? undefined,
        visible: false,
        click: () => this.#emit({ kind: "menu-command", id: entry.id }),
      }));
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  setRecentThreads(input: unknown): void {
    this.#recentThreads = TrayRecentThreadsInputSchema.parse(input);
    this.#rebuildTrayMenu();
  }

  setSessionUsage(input: unknown): void {
    this.#usage = TraySessionUsageSchema.parse(input);
    this.#rebuildTrayMenu();
  }

  openDeepLink(value: string): void {
    const url = new URL(value);
    if (url.protocol !== "blackrain:" || url.host !== "thread" || url.pathname !== "/open") {
      throw new Error("不支持的 BlackRain 深链");
    }
    const workspaceId = url.searchParams.get("workspaceId") ?? "";
    const threadId = url.searchParams.get("threadId") ?? "";
    const event = {
      kind: "tray-open-thread" as const,
      workspaceId,
      threadId,
    };
    SystemUiEventSchema.parse(event);
    this.#showOwner();
    this.#emit(event);
  }

  popupContextMenu(owner: BrowserWindow, input: unknown): Promise<ContextMenuResult> {
    const request = ContextMenuInputSchema.parse(input);
    return new Promise((resolve) => {
      let selected: string | null = null;
      const menu = Menu.buildFromTemplate(request.items.map((item) =>
        item.kind === "separator"
          ? { type: "separator" as const }
          : {
              type: "normal" as const,
              label: item.label,
              enabled: item.enabled ?? true,
              click: () => {
                selected = item.id;
              },
            },
      ));
      menu.popup({
        window: owner,
        x: request.x,
        y: request.y,
        callback: () => resolve(selected),
      });
    });
  }

  showNotification(input: unknown): void {
    const request = NotificationInputSchema.parse(input);
    if (!Notification.isSupported()) {
      throw new Error("当前 Windows 环境不支持系统通知");
    }
    new Notification(request).show();
  }

  dispose(): void {
    this.#listeners.clear();
    this.#tray?.destroy();
    this.#tray = null;
    this.#owner = null;
  }

  #emit(event: SystemUiEvent): void {
    for (const listener of this.#listeners) listener(event);
  }

  #showOwner(): void {
    if (!this.#owner || this.#owner.isDestroyed()) return;
    if (this.#owner.isMinimized()) this.#owner.restore();
    this.#owner.show();
    this.#owner.focus();
  }

  #rebuildTrayMenu(): void {
    if (!this.#tray) return;
    const recent = this.#recentThreads.slice(0, 10).map((entry) => ({
      label: `${entry.workspaceLabel}: ${entry.threadLabel}`,
      click: () => {
        this.#showOwner();
        this.#emit({
          kind: "tray-open-thread",
          workspaceId: entry.workspaceId,
          threadId: entry.threadId,
        });
      },
    }));
    this.#tray.setContextMenu(Menu.buildFromTemplate([
      { label: "打开 BlackRain", click: () => this.#showOwner() },
      ...(this.#usage
        ? [{ type: "separator" as const }, {
            label: [this.#usage.sessionLabel, this.#usage.weeklyLabel]
              .filter(Boolean).join(" | "),
            enabled: false,
          }]
        : []),
      ...(recent.length > 0
        ? [{ type: "separator" as const }, ...recent]
        : []),
      { type: "separator" },
      { label: "退出", click: () => this.#quit?.() },
    ]));
  }
}
