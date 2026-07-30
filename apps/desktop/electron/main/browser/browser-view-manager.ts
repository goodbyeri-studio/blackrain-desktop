import {
  BrowserWindow,
  session as electronSession,
  WebContentsView,
  type Session,
} from "electron";
import { randomUUID } from "node:crypto";
import { BrowserLayoutUpdateSchema, type BrowserLayoutAck } from "../../shared/browser-layout";
import {
  BrowserControlInputSchema,
  BrowserCreateTabInputSchema,
  BrowserNavigateInputSchema,
  BrowserRouteScopeSchema,
  BrowserTabRequestSchema,
  type BrowserCloseTabAck,
  type BrowserControlInput,
  type BrowserNavigateInput,
  type BrowserRouteScope,
  type BrowserTabRequest,
  type BrowserTabState,
} from "../../shared/browser-tabs";
import { IPC_CHANNELS } from "../../shared/ipc";
import { BrowserLayoutStore } from "./layout-store";
import {
  BROWSER_PARTITION,
  clampBrowserBounds,
  isAllowedPageNavigation,
  normalizeBrowserUrl,
} from "./browser-policy";
import {
  BrowserRegistry,
  type BrowserOwner,
  type BrowserTabRecord,
} from "./browser-registry";
import {
  BrowserCdpController,
  type BrowserCdpTarget,
} from "./browser-cdp-controller";
import type {
  BrowserAgentTabInput,
  BrowserSnapshotRefInput,
  BrowserTypeTextInput,
} from "./browser-dynamic-tool-adapter";

const securedBrowserSessions = new WeakSet<Session>();

export class BrowserViewManager {
  readonly #registry = new BrowserRegistry<WebContentsView>();
  readonly #layouts = new BrowserLayoutStore();
  readonly #cdp: BrowserCdpController;

  constructor(cdp: BrowserCdpController = new BrowserCdpController()) {
    this.#cdp = cdp;
  }

  async createTab(
    ownerWindow: BrowserWindow,
    windowGeneration: number,
    input: unknown,
  ): Promise<BrowserTabState> {
    const request = BrowserCreateTabInputSchema.parse(input);
    const owner = this.#owner(ownerWindow, windowGeneration);
    this.#registry.assertCanAddForOwner(owner);
    const pageSession = electronSession.fromPartition(BROWSER_PARTITION, {
      cache: true,
    });
    secureBrowserSession(pageSession);
    const view = new WebContentsView({
      webPreferences: {
        partition: BROWSER_PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        nodeIntegrationInWorker: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
        plugins: false,
      },
    });
    view.setVisible(false);
    ownerWindow.contentView.addChildView(view);

    const record: BrowserTabRecord<WebContentsView> = {
      browserTabId: randomUUID(),
      viewGeneration: 1,
      documentGeneration: 1,
      threadId: request.threadId,
      routeKey: request.routeKey,
      url: "about:blank",
      title: "",
      loading: false,
      canGoBack: false,
      canGoForward: false,
      crashed: false,
      error: null,
      ownerWebContentsId: owner.webContentsId,
      ownerWindowId: owner.windowId,
      ownerWindowGeneration: owner.windowGeneration,
      profileId: BROWSER_PARTITION,
      webContentsId: view.webContents.id,
      view,
    };
    this.#registry.add(record);
    this.#installPagePolicy(ownerWindow, record);

    try {
      if (request.url) {
        await view.webContents.loadURL(normalizeBrowserUrl(request.url));
      }
      this.#refreshState(record);
      this.#emitTabsChanged(ownerWindow, record);
      return tabState(record);
    } catch (error) {
      this.#destroyRecord(record, ownerWindow);
      throw error;
    }
  }

  listTabs(
    ownerWindow: BrowserWindow,
    windowGeneration: number,
    input: unknown,
  ): BrowserTabState[] {
    const scope = BrowserRouteScopeSchema.parse(input);
    return this.#registry
      .listOwned(this.#owner(ownerWindow, windowGeneration), scope)
      .map((record) => {
        this.#refreshState(record);
        return tabState(record);
      });
  }

  listTabsForAgent(scope: BrowserRouteScope): BrowserTabState[] {
    const request = BrowserRouteScopeSchema.parse(scope);
    return this.#registry.listForRoute(request).map((record) => {
      this.#refreshState(record);
      return tabState(record);
    });
  }

  async navigateForAgent(
    input: BrowserNavigateInput,
    signal: AbortSignal,
  ): Promise<BrowserTabState> {
    const request = BrowserNavigateInputSchema.parse(input);
    const record = this.#registry.requireForRoute(
      request,
      request.browserTabId,
      request.viewGeneration,
    );
    const handleAbort = () => record.view.webContents.stop();
    signal.addEventListener("abort", handleAbort, { once: true });
    try {
      if (signal.aborted) {
        throw new Error("Browser Agent 导航已取消");
      }
      await record.view.webContents.loadURL(normalizeBrowserUrl(request.url));
      if (signal.aborted) {
        throw new Error("Browser Agent 导航已取消");
      }
      this.#refreshState(record);
      this.#emitTabsChangedForRecord(record);
      return tabState(record);
    } finally {
      signal.removeEventListener("abort", handleAbort);
    }
  }

  controlForAgent(input: BrowserControlInput): BrowserTabState {
    const request = BrowserControlInputSchema.parse(input);
    const record = this.#registry.requireForRoute(
      request,
      request.browserTabId,
      request.viewGeneration,
    );
    this.#applyControl(record, request.action);
    this.#refreshState(record);
    this.#emitTabsChangedForRecord(record);
    return tabState(record);
  }

  async snapshotForAgent(
    input: BrowserAgentTabInput,
    signal: AbortSignal,
  ) {
    const request = BrowserTabRequestSchema.parse(input);
    const record = this.#requireAgentRecord(request);
    return this.#cdp.snapshot(this.#cdpTarget(record, input.turnId), signal);
  }

  async clickForAgent(
    input: BrowserSnapshotRefInput,
    signal: AbortSignal,
  ) {
    const request = BrowserTabRequestSchema.parse(input);
    const record = this.#requireAgentRecord(request);
    return this.#cdp.click(
      this.#cdpTarget(record, input.turnId),
      input.snapshotId,
      input.ref,
      signal,
    );
  }

  async typeTextForAgent(
    input: BrowserTypeTextInput,
    signal: AbortSignal,
  ) {
    const request = BrowserTabRequestSchema.parse(input);
    const record = this.#requireAgentRecord(request);
    return this.#cdp.typeText(
      this.#cdpTarget(record, input.turnId),
      input.snapshotId,
      input.ref,
      input.text,
      signal,
    );
  }

  async screenshotForAgent(
    input: BrowserAgentTabInput,
    signal: AbortSignal,
  ) {
    const request = BrowserTabRequestSchema.parse(input);
    const record = this.#requireAgentRecord(request);
    return this.#cdp.screenshot(this.#cdpTarget(record, input.turnId), signal);
  }

  async navigate(
    ownerWindow: BrowserWindow,
    windowGeneration: number,
    input: unknown,
  ): Promise<BrowserTabState> {
    const request = BrowserNavigateInputSchema.parse(input);
    const record = this.#registry.requireOwned(
      this.#owner(ownerWindow, windowGeneration),
      request,
      request.browserTabId,
      request.viewGeneration,
    );
    await record.view.webContents.loadURL(normalizeBrowserUrl(request.url));
    this.#refreshState(record);
    this.#emitTabsChanged(ownerWindow, record);
    return tabState(record);
  }

  control(
    ownerWindow: BrowserWindow,
    windowGeneration: number,
    input: unknown,
  ): BrowserTabState {
    const request = BrowserControlInputSchema.parse(input);
    const record = this.#registry.requireOwned(
      this.#owner(ownerWindow, windowGeneration),
      request,
      request.browserTabId,
      request.viewGeneration,
    );
    this.#applyControl(record, request.action);
    this.#refreshState(record);
    this.#emitTabsChanged(ownerWindow, record);
    return tabState(record);
  }

  closeTab(
    ownerWindow: BrowserWindow,
    windowGeneration: number,
    input: unknown,
  ): BrowserCloseTabAck {
    const request = BrowserTabRequestSchema.parse(input);
    const record = this.#registry.requireOwned(
      this.#owner(ownerWindow, windowGeneration),
      request,
      request.browserTabId,
      request.viewGeneration,
    );
    const scope = { threadId: record.threadId, routeKey: record.routeKey };
    this.#destroyRecord(record, ownerWindow);
    this.#emitTabsChangedForScope(ownerWindow, record, scope);
    return { closed: true, browserTabId: request.browserTabId };
  }

  setLayout(
    ownerWindow: BrowserWindow,
    windowGeneration: number,
    input: unknown,
  ): BrowserLayoutAck {
    const update = BrowserLayoutUpdateSchema.parse(input);
    const owner = this.#owner(ownerWindow, windowGeneration);
    const scope = { threadId: update.threadId, routeKey: update.routeKey };
    const recordsById = new Map(
      this.#registry.listOwned(owner, scope).map((record) => [record.browserTabId, record]),
    );

    for (const layout of update.views) {
      this.#registry.requireOwned(
        owner,
        scope,
        layout.browserTabId,
        layout.viewGeneration,
      );
    }
    const ack = this.#layouts.update(owner.webContentsId, windowGeneration, update);

    for (const record of this.#registry.listOwned(owner)) {
      record.view.setVisible(false);
    }
    const [contentWidth, contentHeight] = ownerWindow.getContentSize();
    const contentSize: readonly [number, number] = [contentWidth, contentHeight];
    for (const layout of update.views) {
      const record = recordsById.get(layout.browserTabId);
      if (!record) {
        throw new Error("Browser layout 引用了不属于当前 route 的 tab");
      }
      const bounds = clampBrowserBounds(layout.bounds, contentSize);
      record.view.setBounds(bounds);
      record.view.setVisible(
        layout.visible &&
          !layout.occluded &&
          update.activeTabId === record.browserTabId &&
          bounds.width > 0 &&
          bounds.height > 0,
      );
    }
    return ack;
  }

  releaseWindow(ownerWindow: BrowserWindow, windowGeneration: number): void {
    const owner = this.#owner(ownerWindow, windowGeneration);
    for (const record of this.#registry.listOwned(owner)) {
      this.#destroyRecord(record, ownerWindow);
    }
    this.#layouts.remove(owner.webContentsId);
  }

  dispose(): void {
    for (const record of this.#registry.all()) {
      this.#cdp.disposeTarget(record.webContentsId);
      this.#registry.remove(record.browserTabId);
      if (!record.view.webContents.isDestroyed()) {
        record.view.webContents.close();
      }
    }
    this.#cdp.dispose();
  }

  #requireAgentRecord(request: BrowserTabRequest): BrowserTabRecord<WebContentsView> {
    const record = this.#registry.requireForRoute(
      request,
      request.browserTabId,
      request.viewGeneration,
    );
    this.#refreshState(record);
    if (record.crashed || record.view.webContents.isDestroyed()) {
      throw new Error("Browser Agent tab 页面已崩溃或销毁");
    }
    return record;
  }

  #cdpTarget(
    record: BrowserTabRecord<WebContentsView>,
    turnId: string,
  ): BrowserCdpTarget {
    return {
      browserTabId: record.browserTabId,
      turnId,
      viewGeneration: record.viewGeneration,
      documentGeneration: record.documentGeneration,
      webContentsId: record.webContentsId,
      url: record.url,
      debugger: record.view.webContents.debugger,
      readDocumentState: () => ({
        documentGeneration: record.documentGeneration,
        url: record.url,
      }),
    };
  }

  #owner(ownerWindow: BrowserWindow, windowGeneration: number): BrowserOwner {
    return {
      webContentsId: ownerWindow.webContents.id,
      windowId: ownerWindow.id,
      windowGeneration,
    };
  }

  #installPagePolicy(
    ownerWindow: BrowserWindow,
    record: BrowserTabRecord<WebContentsView>,
  ): void {
    const page = record.view.webContents;
    page.setWindowOpenHandler(() => ({ action: "deny" }));
    page.on("will-navigate", (event, target) => {
      if (!isAllowedPageNavigation(target)) {
        event.preventDefault();
      }
    });
    page.on("will-redirect", (event, target) => {
      if (!isAllowedPageNavigation(target)) {
        event.preventDefault();
      }
    });
    page.on("did-start-navigation", (_event, _url, _isInPlace, isMainFrame) => {
      if (!isMainFrame) return;
      record.documentGeneration += 1;
      this.#cdp.invalidateDocument(record.webContentsId);
    });
    page.on("did-start-loading", () => {
      record.error = null;
      record.loading = true;
      this.#emitTabsChanged(ownerWindow, record);
    });
    page.on("did-stop-loading", () => {
      this.#refreshState(record);
      this.#emitTabsChanged(ownerWindow, record);
    });
    page.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
      if (!isMainFrame || code === -3) {
        return;
      }
      record.error = { code, description, url };
      record.loading = false;
      this.#emitTabsChanged(ownerWindow, record);
    });
    page.on("page-title-updated", () => {
      this.#refreshState(record);
      this.#emitTabsChanged(ownerWindow, record);
    });
    page.on("did-navigate", () => {
      record.error = null;
      this.#refreshState(record);
      this.#emitTabsChanged(ownerWindow, record);
    });
    page.on("did-navigate-in-page", () => {
      this.#refreshState(record);
      this.#emitTabsChanged(ownerWindow, record);
    });
    page.on("render-process-gone", () => {
      record.crashed = true;
      record.loading = false;
      this.#cdp.disposeTarget(record.webContentsId);
      this.#emitTabsChanged(ownerWindow, record);
    });
  }

  #emitTabsChanged(
    ownerWindow: BrowserWindow,
    record: BrowserTabRecord<WebContentsView>,
  ): void {
    this.#emitTabsChangedForScope(ownerWindow, record, {
      threadId: record.threadId,
      routeKey: record.routeKey,
    });
  }

  #emitTabsChangedForRecord(record: BrowserTabRecord<WebContentsView>): void {
    const ownerWindow = BrowserWindow.fromId(record.ownerWindowId);
    if (!ownerWindow || ownerWindow.isDestroyed()) {
      throw new Error("Browser tab 的 owner window 已失效");
    }
    this.#emitTabsChanged(ownerWindow, record);
  }

  #applyControl(
    record: BrowserTabRecord<WebContentsView>,
    action: BrowserControlInput["action"],
  ): void {
    const navigation = record.view.webContents.navigationHistory;
    switch (action) {
      case "back":
        if (navigation.canGoBack()) navigation.goBack();
        break;
      case "forward":
        if (navigation.canGoForward()) navigation.goForward();
        break;
      case "reload":
        record.error = null;
        record.view.webContents.reload();
        break;
      case "stop":
        record.view.webContents.stop();
        break;
    }
  }

  #emitTabsChangedForScope(
    ownerWindow: BrowserWindow,
    record: BrowserTabRecord<WebContentsView>,
    scope: { threadId: string; routeKey: string },
  ): void {
    if (ownerWindow.isDestroyed() || ownerWindow.webContents.isDestroyed()) {
      return;
    }
    const owner = {
      webContentsId: record.ownerWebContentsId,
      windowId: record.ownerWindowId,
      windowGeneration: record.ownerWindowGeneration,
    };
    const tabs = this.#registry.listOwned(owner, scope).map((item) => {
      this.#refreshState(item);
      return tabState(item);
    });
    ownerWindow.webContents.send(IPC_CHANNELS.browserTabsChanged, { scope, tabs });
  }

  #refreshState(record: BrowserTabRecord<WebContentsView>): void {
    const page = record.view.webContents;
    if (page.isDestroyed()) {
      record.crashed = true;
      record.loading = false;
      return;
    }
    record.url = page.getURL() || "about:blank";
    record.title = page.getTitle();
    record.loading = page.isLoading();
    record.canGoBack = page.navigationHistory.canGoBack();
    record.canGoForward = page.navigationHistory.canGoForward();
  }

  #destroyRecord(
    record: BrowserTabRecord<WebContentsView>,
    ownerWindow: BrowserWindow,
  ): void {
    this.#cdp.disposeTarget(record.webContentsId);
    this.#registry.remove(record.browserTabId);
    try {
      ownerWindow.contentView.removeChildView(record.view);
    } catch {
      // 窗口 teardown 期间 contentView 可能已经不可用。
    }
    if (!record.view.webContents.isDestroyed()) {
      record.view.webContents.close();
    }
  }
}

function secureBrowserSession(pageSession: Session): void {
  if (securedBrowserSessions.has(pageSession)) {
    return;
  }
  securedBrowserSessions.add(pageSession);
  pageSession.setPermissionCheckHandler(() => false);
  pageSession.setPermissionRequestHandler((_page, _permission, callback) => {
    callback(false);
  });
  pageSession.setDevicePermissionHandler(() => false);
  pageSession.on("will-download", (event) => {
    event.preventDefault();
  });
}

function tabState(record: BrowserTabRecord<WebContentsView>): BrowserTabState {
  return {
    browserTabId: record.browserTabId,
    viewGeneration: record.viewGeneration,
    threadId: record.threadId,
    routeKey: record.routeKey,
    url: record.url,
    title: record.title,
    loading: record.loading,
    canGoBack: record.canGoBack,
    canGoForward: record.canGoForward,
    crashed: record.crashed,
    error: record.error,
  };
}
