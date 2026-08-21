import type { BrowserRouteScope, BrowserTabState } from "../../shared/browser-tabs";

export type BrowserTabRecord<TView> = BrowserTabState & {
  blockedAgentTurnId: string | null;
  createdByTurnId?: string | null;
  detached: boolean;
  deliverable?: boolean;
  documentGeneration: number;
  handoff?: boolean;
  lastActiveAt: number;
  origin?: "user" | "agent" | "popup" | "restored";
  ownerWebContentsId: number;
  ownerWindowId: number;
  ownerWindowGeneration: number;
  profileId: typeof import("./browser-policy").BROWSER_PARTITION;
  pageLifecycle: "live" | "suspended" | "persisted" | "crashed";
  webContentsId: number;
  view: TView;
};

export type BrowserOwner = {
  webContentsId: number;
  windowId: number;
  windowGeneration: number;
};

export const MAX_BROWSER_TABS_PER_OWNER = 64;

export class BrowserRegistry<TView> {
  readonly #tabs = new Map<string, BrowserTabRecord<TView>>();

  assertCanAddForOwner(owner: BrowserOwner): void {
    if (this.listOwned(owner).length >= MAX_BROWSER_TABS_PER_OWNER) {
      throw new Error(
        `Browser tab 已达到当前窗口上限（${MAX_BROWSER_TABS_PER_OWNER}）`,
      );
    }
  }

  add(record: BrowserTabRecord<TView>): void {
    if (this.#tabs.has(record.browserTabId)) {
      throw new Error(`Browser tab ${record.browserTabId} 已存在`);
    }
    this.#tabs.set(record.browserTabId, record);
  }

  requireOwned(
    owner: BrowserOwner,
    scope: BrowserRouteScope,
    browserTabId: string,
    viewGeneration: number,
  ): BrowserTabRecord<TView> {
    const record = this.#tabs.get(browserTabId);
    if (
      !record ||
      record.ownerWebContentsId !== owner.webContentsId ||
      record.ownerWindowId !== owner.windowId ||
      record.ownerWindowGeneration !== owner.windowGeneration ||
      record.threadId !== scope.threadId ||
      record.routeKey !== scope.routeKey ||
      record.viewGeneration !== viewGeneration
    ) {
      throw new Error("Browser tab ownership 或 generation 已失效");
    }
    return record;
  }

  listOwned(owner: BrowserOwner, scope?: BrowserRouteScope): BrowserTabRecord<TView>[] {
    return [...this.#tabs.values()].filter(
      (record) =>
        record.ownerWebContentsId === owner.webContentsId &&
        record.ownerWindowId === owner.windowId &&
        record.ownerWindowGeneration === owner.windowGeneration &&
        (!scope ||
          (record.threadId === scope.threadId && record.routeKey === scope.routeKey)),
    );
  }

  requireForRoute(
    scope: BrowserRouteScope,
    browserTabId: string,
    viewGeneration: number,
  ): BrowserTabRecord<TView> {
    const record = this.#tabs.get(browserTabId);
    if (
      !record ||
      record.threadId !== scope.threadId ||
      record.routeKey !== scope.routeKey ||
      record.viewGeneration !== viewGeneration
    ) {
      throw new Error("Browser Agent tab ownership 或 generation 已失效");
    }
    return record;
  }

  listForRoute(scope: BrowserRouteScope): BrowserTabRecord<TView>[] {
    return [...this.#tabs.values()].filter(
      (record) =>
        record.threadId === scope.threadId && record.routeKey === scope.routeKey,
    );
  }

  remove(browserTabId: string): BrowserTabRecord<TView> | undefined {
    const record = this.#tabs.get(browserTabId);
    this.#tabs.delete(browserTabId);
    return record;
  }

  all(): BrowserTabRecord<TView>[] {
    return [...this.#tabs.values()];
  }
}
