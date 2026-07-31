import {
  BrowserWindow,
  dialog,
  session as electronSession,
  WebContentsView,
  type DownloadItem,
  type Session,
  type WebContents,
} from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { BrowserLayoutUpdateSchema, type BrowserLayoutAck } from "../../shared/browser-layout";
import {
  BrowserControlInputSchema,
  BrowserCreateTabInputSchema,
  BrowserDialogDecisionInputSchema,
  BrowserDownloadDecisionInputSchema,
  BrowserFileChooserDecisionInputSchema,
  BrowserNavigateInputSchema,
  BrowserPermissionDecisionInputSchema,
  BrowserRouteScopeSchema,
  BrowserSensitiveActionDecisionInputSchema,
  BrowserTabRequestSchema,
  BrowserTakeControlInputSchema,
  type BrowserCloseTabAck,
  type BrowserControlInput,
  type BrowserRouteScope,
  type BrowserSensitiveActionCategory,
  type BrowserTabRequest,
  type BrowserTabState,
} from "../../shared/browser-tabs";
import { IPC_CHANNELS } from "../../shared/ipc";
import { BrowserLayoutStore } from "./layout-store";
import {
  BrowserSessionStore,
  type StoredBrowserTab,
} from "./browser-session-store";
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
  type BrowserDebuggerStatus,
} from "./browser-cdp-controller";
import type {
  BrowserAgentCreateTabInput,
  BrowserAgentTabInput,
  BrowserAgentControlInput,
  BrowserAgentNavigateInput,
  BrowserAgentScreenshotInput,
  BrowserLocatorInput,
  BrowserPressKeyInput,
  BrowserScrollInput,
  BrowserSnapshotRefInput,
  BrowserTypeTextInput,
} from "./browser-dynamic-tool-adapter";
import { BrowserSensitiveActionPolicy } from "./browser-sensitive-action-policy";
import { planBrowserWorkingSet } from "./browser-working-set";

const securedBrowserSessions = new WeakSet<Session>();
const PERMISSION_REQUEST_TTL_MS = 30_000;
const MAX_CONSOLE_MESSAGES = 20;
const CONSOLE_EVENT_COALESCE_MS = 100;
const DOWNLOAD_REQUEST_TTL_MS = 60_000;
const DOWNLOAD_GRANT_TTL_MS = 15_000;
const FILE_CHOOSER_REQUEST_TTL_MS = 60_000;
const SENSITIVE_ACTION_REQUEST_TTL_MS = 25_000;
const AGENT_INPUT_ECHO_TIMEOUT_MS = 250;
const CONFIRMABLE_PERMISSIONS = new Set([
  "clipboard-read",
  "display-capture",
  "geolocation",
  "media",
  "notifications",
]);

type PendingPermission = {
  browserTabId: string;
  callback: (granted: boolean) => void;
  expiresAt: number;
  timer: NodeJS.Timeout;
};

type PendingDownload = {
  browserTabId: string;
  expiresAt: number;
  filename: string;
  timer: NodeJS.Timeout;
  url: string;
};

type PendingFileChooser = {
  browserTabId: string;
  backendNodeId: number;
  expiresAt: number;
  mode: "selectSingle" | "selectMultiple";
  sessionId?: string;
  timer: NodeJS.Timeout;
};

type PendingSensitiveAction = {
  browserTabId: string;
  category: BrowserSensitiveActionCategory;
  origin: string;
  threadId: string;
  turnId: string;
  viewGeneration: number;
  expiresAt: number;
  timer: NodeJS.Timeout;
  signal: AbortSignal;
  abortListener: () => void;
  resolve: () => void;
  reject: (error: Error) => void;
};

type AgentInputDispatch = {
  keyboardEchoes: number;
  mouseEchoes: number;
};

export class BrowserViewManager {
  readonly #registry = new BrowserRegistry<WebContentsView>();
  readonly #routeOwners = new Map<string, BrowserOwner>();
  readonly #layouts = new BrowserLayoutStore();
  readonly #cdp: BrowserCdpController;
  readonly #sessions: BrowserSessionStore;
  readonly #agentOperations = new Map<string, Set<AbortController>>();
  readonly #agentInputDispatches = new Map<string, Set<AgentInputDispatch>>();
  readonly #desiredVisibility = new Map<string, boolean>();
  readonly #captureVisibilityHolds = new Map<string, number>();
  readonly #consoleEmitTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #pendingPermissions = new Map<string, PendingPermission>();
  readonly #permissionGrants = new Map<string, number>();
  readonly #pendingDownloads = new Map<string, PendingDownload>();
  readonly #pendingFileChoosers = new Map<string, PendingFileChooser>();
  readonly #downloadGrants = new Map<string, { expiresAt: number; savePath: string }>();
  readonly #pendingSensitiveActions = new Map<string, PendingSensitiveAction>();
  readonly #lifecycleTransitions = new Map<string, Promise<void>>();
  readonly #sensitiveActions: BrowserSensitiveActionPolicy;

  constructor(
    cdp: BrowserCdpController = new BrowserCdpController(),
    options: {
      stateFilePath?: string;
      sensitiveActionPolicy?: BrowserSensitiveActionPolicy;
    } = {},
  ) {
    this.#cdp = cdp;
    this.#sessions = new BrowserSessionStore(options.stateFilePath);
    this.#sensitiveActions =
      options.sensitiveActionPolicy ?? new BrowserSensitiveActionPolicy();
  }

  async createTab(
    ownerWindow: BrowserWindow,
    windowGeneration: number,
    input: unknown,
  ): Promise<BrowserTabState> {
    const request = BrowserCreateTabInputSchema.parse(input);
    const record = this.#createRecord(
      ownerWindow,
      windowGeneration,
      request,
    );
    this.#routeOwners.set(
      routeOwnerKey(request),
      this.#owner(ownerWindow, windowGeneration),
    );

    try {
      if (request.url) {
        await record.view.webContents.loadURL(normalizeBrowserUrl(request.url));
      }
      this.#refreshState(record);
      record.pageLifecycle = record.crashed ? "crashed" : "live";
      this.#persistRecord(record);
      this.#emitTabsChanged(ownerWindow, record);
      return tabState(record);
    } catch (error) {
      this.#destroyRecord(record, ownerWindow);
      throw error;
    }
  }

  async listTabs(
    ownerWindow: BrowserWindow,
    windowGeneration: number,
    input: unknown,
  ): Promise<BrowserTabState[]> {
    const scope = BrowserRouteScopeSchema.parse(input);
    const owner = this.#owner(ownerWindow, windowGeneration);
    this.#routeOwners.set(routeOwnerKey(scope), owner);
    this.#adoptRoute(ownerWindow, owner, scope);
    if (this.#registry.listOwned(owner, scope).length === 0) {
      await this.#restoreRoute(ownerWindow, windowGeneration, scope);
    }
    return this.#registry
      .listOwned(owner, scope)
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

  async createTabForAgent(
    input: BrowserAgentCreateTabInput,
    signal: AbortSignal,
  ): Promise<BrowserTabState> {
    const request = BrowserRouteScopeSchema.parse(input);
    const turnId = input.turnId;
    throwIfAborted(signal);
    const owner = this.#routeOwners.get(routeOwnerKey(request));
    if (!owner) throw new Error("Browser route 尚未由 renderer 建立 owner lease");
    const ownerWindow = BrowserWindow.fromId(owner.windowId);
    if (
      !ownerWindow ||
      ownerWindow.isDestroyed() ||
      ownerWindow.webContents.isDestroyed() ||
      ownerWindow.webContents.id !== owner.webContentsId
    ) {
      throw new Error("Browser route owner window 已失效");
    }
    const tab = await this.createTab(ownerWindow, owner.windowGeneration, {
      threadId: request.threadId,
      routeKey: request.routeKey,
      ...(input.url ? { url: input.url } : {}),
    });
    const record = this.#registry.requireForRoute(
      request,
      tab.browserTabId,
      tab.viewGeneration,
    );
    try {
      throwIfAborted(signal);
      record.origin = "agent";
      record.createdByTurnId = turnId;
      this.#claimForAgent(record, turnId);
      return tabState(record);
    } catch (error) {
      if (this.#registry.all().includes(record)) {
        this.#destroyRecord(record, ownerWindow);
      }
      throw error;
    }
  }

  async navigateForAgent(
    input: BrowserAgentNavigateInput,
    signal: AbortSignal,
  ): Promise<BrowserTabState> {
    const request = BrowserNavigateInputSchema.parse(input);
    const record = this.#registry.requireForRoute(
      request,
      request.browserTabId,
      request.viewGeneration,
    );
    return this.#runAgentOperation(
      record,
      input.turnId,
      signal,
      async (operationSignal) => {
        const handleAbort = () => record.view.webContents.stop();
        operationSignal.addEventListener("abort", handleAbort, { once: true });
        try {
          if (operationSignal.aborted) {
            throw new Error("Browser Agent 导航已取消");
          }
          await record.view.webContents.loadURL(normalizeBrowserUrl(request.url));
          if (operationSignal.aborted) {
            throw new Error("Browser Agent 导航已取消");
          }
          this.#refreshState(record);
          this.#persistRecord(record);
          this.#emitTabsChangedForRecord(record);
          return tabState(record);
        } finally {
          operationSignal.removeEventListener("abort", handleAbort);
        }
      },
    );
  }

  async controlForAgent(input: BrowserAgentControlInput): Promise<BrowserTabState> {
    const request = BrowserControlInputSchema.parse(input);
    const record = this.#registry.requireForRoute(
      request,
      request.browserTabId,
      request.viewGeneration,
    );
    this.#claimForAgent(record, input.turnId);
    await this.#transitionPageLifecycle(record, "live");
    record.lastActiveAt = Date.now();
    this.#applyControl(record, request.action);
    this.#refreshState(record);
    this.#persistRecord(record);
    this.#emitTabsChangedForRecord(record);
    return tabState(record);
  }

  async snapshotForAgent(
    input: BrowserAgentTabInput,
    signal: AbortSignal,
  ) {
    const request = BrowserTabRequestSchema.parse(input);
    const record = this.#requireAgentRecord(request);
    return this.#runAgentOperation(record, input.turnId, signal, (operationSignal) =>
      this.#cdp.snapshot(this.#cdpTarget(record, input.turnId), operationSignal),
    );
  }

  async locateForAgent(input: BrowserLocatorInput, signal: AbortSignal) {
    const request = BrowserTabRequestSchema.parse(input);
    const record = this.#requireAgentRecord(request);
    return this.#runAgentOperation(record, input.turnId, signal, (operationSignal) =>
      this.#cdp.locate(
        this.#cdpTarget(record, input.turnId),
        {
          role: input.role,
          name: input.name,
          exact: input.exact,
          state: input.state,
          timeoutMs: input.timeoutMs,
        },
        operationSignal,
      ),
    );
  }

  async clickForAgent(
    input: BrowserSnapshotRefInput,
    signal: AbortSignal,
  ) {
    const request = BrowserTabRequestSchema.parse(input);
    const record = this.#requireAgentRecord(request);
    return this.#runAgentOperation(
      record,
      input.turnId,
      signal,
      async (operationSignal) => {
        const target = this.#cdpTarget(record, input.turnId);
        const locator = this.#cdp.describeRef(
          target,
          input.snapshotId,
          input.ref,
        );
        const policy = this.#sensitiveActions.evaluate(locator);
        if (policy.decision === "deny") {
          throw new Error(`企业策略禁止 Browser ${policy.category} 动作`);
        }
        if (policy.decision === "confirm") {
          await this.#requestSensitiveAction(
            record,
            input.turnId,
            policy.category,
            locator.name,
            operationSignal,
          );
        }
        throwIfAborted(operationSignal);
        return this.#runAgentInputDispatch(
          record,
          { mouseEchoes: 2 },
          () => this.#cdp.click(
            target,
            input.snapshotId,
            input.ref,
            operationSignal,
          ),
        );
      },
    );
  }

  async hoverForAgent(
    input: BrowserSnapshotRefInput,
    signal: AbortSignal,
  ) {
    const request = BrowserTabRequestSchema.parse(input);
    const record = this.#requireAgentRecord(request);
    return this.#runAgentOperation(
      record,
      input.turnId,
      signal,
      (operationSignal) =>
        this.#cdp.hover(
          this.#cdpTarget(record, input.turnId),
          input.snapshotId,
          input.ref,
          operationSignal,
        ),
    );
  }

  async typeTextForAgent(
    input: BrowserTypeTextInput,
    signal: AbortSignal,
  ) {
    const request = BrowserTabRequestSchema.parse(input);
    const record = this.#requireAgentRecord(request);
    return this.#runAgentOperation(
      record,
      input.turnId,
      signal,
      (operationSignal) =>
        this.#cdp.typeText(
          this.#cdpTarget(record, input.turnId),
          input.snapshotId,
          input.ref,
          input.text,
          operationSignal,
        ),
    );
  }

  async pressKeyForAgent(input: BrowserPressKeyInput, signal: AbortSignal) {
    const request = BrowserTabRequestSchema.parse(input);
    const record = this.#requireAgentRecord(request);
    return this.#runAgentOperation(
      record,
      input.turnId,
      signal,
      async (operationSignal) => {
        const policy = this.#sensitiveActions.evaluateKey(input.key);
        if (policy.decision === "deny") {
          throw new Error("企业策略禁止 Browser 键盘激活动作");
        }
        if (policy.decision === "confirm") {
          await this.#requestSensitiveAction(
            record,
            input.turnId,
            policy.category,
            `按键 ${input.key === " " ? "Space" : input.key}`,
            operationSignal,
          );
        }
        throwIfAborted(operationSignal);
        return this.#runAgentInputDispatch(
          record,
          { keyboardEchoes: 2 },
          () =>
            this.#cdp.pressKey(
              this.#cdpTarget(record, input.turnId),
              input.key,
              operationSignal,
            ),
        );
      },
    );
  }

  async scrollForAgent(input: BrowserScrollInput, signal: AbortSignal) {
    const request = BrowserTabRequestSchema.parse(input);
    const record = this.#requireAgentRecord(request);
    return this.#runAgentInputOperation(
      record,
      input.turnId,
      signal,
      { mouseEchoes: 1 },
      (operationSignal) =>
        this.#cdp.scroll(
          this.#cdpTarget(record, input.turnId),
          input.deltaX,
          input.deltaY,
          operationSignal,
        ),
    );
  }

  async screenshotForAgent(
    input: BrowserAgentScreenshotInput,
    signal: AbortSignal,
  ) {
    const request = BrowserTabRequestSchema.parse(input);
    const record = this.#requireAgentRecord(request);
    return this.#runAgentOperation(
      record,
      input.turnId,
      signal,
      async (operationSignal) => {
        const fullPage = input.fullPage === true;
        if (!fullPage) {
          return this.#cdp.screenshot(
            this.#cdpTarget(record, input.turnId),
            operationSignal,
          );
        }
        const captureGeneration = record.viewGeneration;
        this.#holdCaptureVisibility(record);
        record.view.setVisible(false);
        try {
          return await this.#cdp.screenshot(
            this.#cdpTarget(record, input.turnId),
            operationSignal,
            { fullPage: true },
          );
        } finally {
          const lastHoldReleased = this.#releaseCaptureVisibility(record.browserTabId);
          if (
            lastHoldReleased &&
            this.#registry.all().includes(record) &&
            !record.detached &&
            record.viewGeneration === captureGeneration &&
            !record.view.webContents.isDestroyed()
          ) {
            record.view.setVisible(
              this.#desiredVisibility.get(record.browserTabId) === true,
            );
          }
        }
      },
    );
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
    this.#takeControlRecord(record);
    await this.#transitionPageLifecycle(record, "live");
    record.lastActiveAt = Date.now();
    await record.view.webContents.loadURL(normalizeBrowserUrl(request.url));
    this.#refreshState(record);
    this.#persistRecord(record);
    this.#emitTabsChanged(ownerWindow, record);
    return tabState(record);
  }

  async control(
    ownerWindow: BrowserWindow,
    windowGeneration: number,
    input: unknown,
  ): Promise<BrowserTabState> {
    const request = BrowserControlInputSchema.parse(input);
    const record = this.#registry.requireOwned(
      this.#owner(ownerWindow, windowGeneration),
      request,
      request.browserTabId,
      request.viewGeneration,
    );
    this.#takeControlRecord(record);
    await this.#transitionPageLifecycle(record, "live");
    record.lastActiveAt = Date.now();
    this.#applyControl(record, request.action);
    this.#refreshState(record);
    this.#persistRecord(record);
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
    this.#takeControlRecord(record);
    const scope = { threadId: record.threadId, routeKey: record.routeKey };
    this.#destroyRecord(record, ownerWindow);
    this.#emitTabsChangedForScope(ownerWindow, record, scope);
    return { closed: true, browserTabId: request.browserTabId };
  }

  takeControl(
    ownerWindow: BrowserWindow,
    windowGeneration: number,
    input: unknown,
  ): BrowserTabState {
    const request = BrowserTakeControlInputSchema.parse(input);
    const record = this.#registry.requireOwned(
      this.#owner(ownerWindow, windowGeneration),
      request,
      request.browserTabId,
      request.viewGeneration,
    );
    this.#takeControlRecord(record);
    this.#refreshState(record);
    this.#emitTabsChanged(ownerWindow, record);
    return tabState(record);
  }

  respondPermission(
    ownerWindow: BrowserWindow,
    windowGeneration: number,
    input: unknown,
  ): BrowserTabState {
    const request = BrowserPermissionDecisionInputSchema.parse(input);
    const record = this.#registry.requireOwned(
      this.#owner(ownerWindow, windowGeneration),
      request,
      request.browserTabId,
      request.viewGeneration,
    );
    const pending = this.#pendingPermissions.get(request.requestId);
    if (
      !pending ||
      pending.browserTabId !== record.browserTabId ||
      pending.expiresAt <= Date.now() ||
      record.permissionRequest?.requestId !== request.requestId
    ) {
      throw new Error("Browser permission request 已失效");
    }
    clearTimeout(pending.timer);
    this.#pendingPermissions.delete(request.requestId);
    if (request.allow && record.permissionRequest) {
      this.#permissionGrants.set(
        permissionGrantKey(
          record.webContentsId,
          record.permissionRequest.permission,
          record.permissionRequest.origin,
        ),
        Date.now() + PERMISSION_REQUEST_TTL_MS,
      );
    }
    record.permissionRequest = null;
    pending.callback(request.allow);
    this.#emitTabsChanged(ownerWindow, record);
    return tabState(record);
  }

  async resolveDownload(
    ownerWindow: BrowserWindow,
    windowGeneration: number,
    input: unknown,
  ): Promise<BrowserTabState> {
    const request = BrowserDownloadDecisionInputSchema.parse(input);
    const record = this.#registry.requireOwned(
      this.#owner(ownerWindow, windowGeneration),
      request,
      request.browserTabId,
      request.viewGeneration,
    );
    const pending = this.#pendingDownloads.get(request.requestId);
    if (
      pending?.browserTabId === record.browserTabId &&
      pending.expiresAt <= Date.now()
    ) {
      this.#clearPendingDownload(record, request.requestId);
      this.#emitTabsChangedForRecord(record);
      throw new Error("Browser download request 已失效");
    }
    if (
      !pending ||
      pending.browserTabId !== record.browserTabId ||
      record.download?.requestId !== request.requestId
    ) {
      if (request.action === "cancel" && record.download?.requestId === request.requestId) {
        record.download = null;
        this.#emitTabsChanged(ownerWindow, record);
        return tabState(record);
      }
      throw new Error("Browser download request 已失效");
    }
    this.#clearPendingDownload(record, request.requestId);
    if (request.action === "cancel") {
      record.download = null;
      this.#emitTabsChangedForRecord(record);
      return tabState(record);
    }

    const selection = await dialog.showSaveDialog(ownerWindow, {
      defaultPath: pending.filename,
      title: "保存网页下载",
    });
    if (selection.canceled || !selection.filePath) {
      record.download = null;
      this.#emitTabsChanged(ownerWindow, record);
      return tabState(record);
    }
    this.#downloadGrants.set(downloadGrantKey(record.webContentsId, pending.url), {
      expiresAt: Date.now() + DOWNLOAD_GRANT_TTL_MS,
      savePath: selection.filePath,
    });
    record.view.webContents.downloadURL(pending.url);
    return tabState(record);
  }

  async respondDialog(
    ownerWindow: BrowserWindow,
    windowGeneration: number,
    input: unknown,
  ): Promise<BrowserTabState> {
    const request = BrowserDialogDecisionInputSchema.parse(input);
    const record = this.#registry.requireOwned(
      this.#owner(ownerWindow, windowGeneration),
      request,
      request.browserTabId,
      request.viewGeneration,
    );
    if (!record.dialog || record.dialog.requestId !== request.requestId) {
      throw new Error("Browser dialog request 已失效");
    }
    this.#takeControlRecord(record);
    await this.#cdp.handleJavaScriptDialog(
      record.webContentsId,
      request.accept,
      request.promptText,
    );
    record.dialog = null;
    this.#emitTabsChanged(ownerWindow, record);
    return tabState(record);
  }

  completeAgentTurn(scope: BrowserRouteScope, turnId: string): void {
    this.finalizeAgentTurn(scope, turnId, []);
  }

  async resolveFileChooser(
    ownerWindow: BrowserWindow,
    windowGeneration: number,
    input: unknown,
  ): Promise<BrowserTabState> {
    const request = BrowserFileChooserDecisionInputSchema.parse(input);
    const record = this.#registry.requireOwned(
      this.#owner(ownerWindow, windowGeneration),
      request,
      request.browserTabId,
      request.viewGeneration,
    );
    const pending = this.#pendingFileChoosers.get(request.requestId);
    if (
      !pending ||
      pending.browserTabId !== record.browserTabId ||
      pending.expiresAt <= Date.now() ||
      record.fileChooserRequest?.requestId !== request.requestId
    ) {
      throw new Error("Browser file chooser request 已失效");
    }
    clearTimeout(pending.timer);
    this.#pendingFileChoosers.delete(request.requestId);
    this.#takeControlRecord(record);
    await this.#transitionPageLifecycle(record, "live");
    record.lastActiveAt = Date.now();
    let files: string[] = [];
    if (request.action === "choose") {
      const selection = await dialog.showOpenDialog(ownerWindow, {
        title: "选择要提供给网页的文件",
        properties: [
          "openFile",
          ...(pending.mode === "selectMultiple" ? ["multiSelections" as const] : []),
        ],
      });
      if (!selection.canceled) files = selection.filePaths;
    }
    try {
      await this.#cdp.setFileInputFiles(
        record.webContentsId,
        pending.backendNodeId,
        files,
        pending.sessionId,
      );
    } finally {
      record.fileChooserRequest = null;
      this.#emitTabsChangedForRecord(record);
    }
    return tabState(record);
  }

  respondSensitiveAction(
    ownerWindow: BrowserWindow,
    windowGeneration: number,
    input: unknown,
  ): BrowserTabState {
    const request = BrowserSensitiveActionDecisionInputSchema.parse(input);
    const record = this.#registry.requireOwned(
      this.#owner(ownerWindow, windowGeneration),
      request,
      request.browserTabId,
      request.viewGeneration,
    );
    const pending = this.#pendingSensitiveActions.get(request.requestId);
    if (
      !pending ||
      pending.browserTabId !== record.browserTabId ||
      pending.threadId !== record.threadId ||
      pending.turnId !== record.agentTurnId ||
      pending.viewGeneration !== record.viewGeneration ||
      pending.origin !== safeOrigin(record.url) ||
      pending.expiresAt <= Date.now() ||
      record.sensitiveActionRequest?.requestId !== request.requestId
    ) {
      if (pending) {
        this.#settleSensitiveAction(
          request.requestId,
          false,
          "Browser 敏感动作确认已因页面、turn 或 generation 漂移失效",
        );
      }
      throw new Error("Browser 敏感动作确认已失效");
    }
    this.#settleSensitiveAction(
      request.requestId,
      request.allow,
      request.allow ? "" : "用户拒绝 Browser 敏感动作",
    );
    return tabState(record);
  }

  finalizeAgentTurn(
    scope: BrowserRouteScope,
    turnId: string,
    keep: readonly string[],
  ): BrowserTabState[] {
    const request = BrowserRouteScopeSchema.parse(scope);
    const keepIds = new Set(keep);
    const records = this.#registry.listForRoute(request);
    for (const record of records) {
      const belongsToTurn =
        record.agentTurnId === turnId ||
        record.blockedAgentTurnId === turnId ||
        record.createdByTurnId === turnId;
      if (!belongsToTurn) continue;
      if (keepIds.has(record.browserTabId)) {
        record.deliverable = true;
        record.handoff = true;
      }
      const shouldClose =
        record.origin === "agent" &&
        record.createdByTurnId === turnId &&
        !record.deliverable &&
        !record.handoff;
      this.#abortAgentOperations(record, "Browser Agent turn 已结束");
      this.#cdp.invalidateDocument(record.webContentsId);
      if (shouldClose) {
        const ownerWindow = this.#ownerWindowForRecord(record);
        if (ownerWindow) this.#destroyRecord(record, ownerWindow);
        continue;
      }
      record.controlOwner = "user";
      record.agentTurnId = null;
      record.blockedAgentTurnId = null;
      this.#persistRecord(record);
      this.#emitTabsChangedForRecord(record);
    }
    return this.#registry.listForRoute(request).map((record) => tabState(record));
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
      this.#desiredVisibility.set(record.browserTabId, false);
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
      const visible =
        layout.visible &&
          !layout.occluded &&
          update.activeTabId === record.browserTabId &&
          bounds.width > 0 &&
          bounds.height > 0;
      this.#desiredVisibility.set(record.browserTabId, visible);
      if (visible) record.lastActiveAt = Date.now();
      record.view.setVisible(
        visible && !this.#captureVisibilityHolds.has(record.browserTabId),
      );
    }
    this.#rebalanceWorkingSet(owner);
    return ack;
  }

  releaseWindow(ownerWindow: BrowserWindow, windowGeneration: number): void {
    const owner = this.#owner(ownerWindow, windowGeneration);
    for (const record of this.#registry.listOwned(owner)) {
      this.#clearPendingForRecord(record);
      this.#abortAgentOperations(record, "Browser owner window 已关闭");
      this.#cdp.disposeTarget(record.webContentsId);
      this.#desiredVisibility.set(record.browserTabId, false);
      record.view.setVisible(false);
      try {
        ownerWindow.contentView.removeChildView(record.view);
      } catch {
        // 窗口关闭期间 native view 可能已被 Electron 移除。
      }
      record.detached = true;
      record.pageLifecycle = "persisted";
      record.controlOwner = "user";
      record.agentTurnId = null;
      record.blockedAgentTurnId = null;
      this.#persistRecord(record);
      this.#registry.remove(record.browserTabId);
      this.#desiredVisibility.delete(record.browserTabId);
      this.#captureVisibilityHolds.delete(record.browserTabId);
      this.#lifecycleTransitions.delete(record.browserTabId);
      this.#clearConsoleEmitTimer(record.browserTabId);
      if (!record.view.webContents.isDestroyed()) {
        record.view.webContents.close();
      }
    }
    for (const [key, routeOwner] of this.#routeOwners) {
      if (
        routeOwner.windowId === owner.windowId &&
        routeOwner.windowGeneration === owner.windowGeneration
      ) {
        this.#routeOwners.delete(key);
      }
    }
    this.#layouts.remove(owner.webContentsId);
  }

  async prepareForSystemSuspend(): Promise<void> {
    const transitions: Promise<void>[] = [];
    for (const record of this.#registry.all()) {
      const activeTurnId = record.agentTurnId;
      this.#clearPendingForRecord(record, "系统即将睡眠，Browser 授权已失效");
      this.#abortAgentOperations(record, "系统即将睡眠");
      this.#cdp.invalidateDocument(record.webContentsId);
      if (activeTurnId) {
        record.handoff = true;
        record.blockedAgentTurnId = activeTurnId;
      }
      record.controlOwner = "user";
      record.agentTurnId = null;
      this.#persistRecord(record);
      this.#emitTabsChangedForRecord(record);
      if (!record.crashed && !record.view.webContents.isDestroyed()) {
        transitions.push(this.#transitionPageLifecycle(record, "suspended"));
      }
    }
    await Promise.all(transitions);
  }

  async resumeFromSystemSleep(): Promise<void> {
    const visibleTransitions: Promise<void>[] = [];
    const owners = new Map<string, BrowserOwner>();
    for (const record of this.#registry.all()) {
      const owner = {
        webContentsId: record.ownerWebContentsId,
        windowId: record.ownerWindowId,
        windowGeneration: record.ownerWindowGeneration,
      };
      owners.set(
        `${owner.webContentsId}:${owner.windowId}:${owner.windowGeneration}`,
        owner,
      );
      if (record.view.webContents.isDestroyed()) {
        record.crashed = true;
        record.pageLifecycle = "crashed";
        record.loading = false;
        this.#emitTabsChangedForRecord(record);
        continue;
      }
      this.#cdp.disposeTarget(record.webContentsId);
      record.debuggerStatus = "recovering";
      this.#observeCdp(record);
      if (record.crashed) {
        record.crashed = false;
        record.pageLifecycle = "live";
        record.error = null;
        record.view.webContents.reload();
      }
      if (this.#desiredVisibility.get(record.browserTabId) === true) {
        visibleTransitions.push(this.#transitionPageLifecycle(record, "live"));
      }
      this.#persistRecord(record);
      this.#emitTabsChangedForRecord(record);
    }
    await Promise.all(visibleTransitions);
    for (const owner of owners.values()) this.#rebalanceWorkingSet(owner);
  }

  dispose(): void {
    for (const record of this.#registry.all()) {
      this.#clearPendingForRecord(record);
      this.#abortAgentOperations(record, "Browser host 正在退出");
      this.#cdp.disposeTarget(record.webContentsId);
      this.#registry.remove(record.browserTabId);
      this.#desiredVisibility.delete(record.browserTabId);
      this.#captureVisibilityHolds.delete(record.browserTabId);
      this.#lifecycleTransitions.delete(record.browserTabId);
      this.#clearConsoleEmitTimer(record.browserTabId);
      if (!record.view.webContents.isDestroyed()) {
        record.view.webContents.close();
      }
    }
    this.#cdp.dispose();
    this.#desiredVisibility.clear();
    this.#captureVisibilityHolds.clear();
    this.#lifecycleTransitions.clear();
    for (const timer of this.#consoleEmitTimers.values()) clearTimeout(timer);
    this.#consoleEmitTimers.clear();
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

  #handlePermissionCheck(
    page: WebContents | null,
    permission: string,
    requestingOrigin: string,
  ): boolean {
    if (permission === "clipboard-sanitized-write") return true;
    if (!page || page.isDestroyed()) return false;
    const key = permissionGrantKey(page.id, permission, requestingOrigin);
    const expiresAt = this.#permissionGrants.get(key) ?? 0;
    if (expiresAt <= Date.now()) {
      this.#permissionGrants.delete(key);
      return false;
    }
    return true;
  }

  #handlePermissionRequest(
    page: WebContents | null,
    permission: string,
    callback: (granted: boolean) => void,
    requestingOrigin: string,
  ): void {
    if (permission === "clipboard-sanitized-write") {
      callback(true);
      return;
    }
    if (!page || page.isDestroyed() || !CONFIRMABLE_PERMISSIONS.has(permission)) {
      callback(false);
      return;
    }
    const record = this.#recordForWebContents(page.id);
    if (!record || record.detached) {
      callback(false);
      return;
    }
    if (record.permissionRequest) {
      this.#rejectPermission(record.permissionRequest.requestId);
    }
    const requestId = randomUUID();
    const origin = safeOrigin(requestingOrigin || record.url);
    const expiresAt = Date.now() + PERMISSION_REQUEST_TTL_MS;
    const timer = setTimeout(() => {
      this.#rejectPermission(requestId);
      this.#emitTabsChangedForRecord(record);
    }, PERMISSION_REQUEST_TTL_MS);
    timer.unref?.();
    this.#pendingPermissions.set(requestId, {
      browserTabId: record.browserTabId,
      callback,
      expiresAt,
      timer,
    });
    record.permissionRequest = { requestId, permission, origin };
    this.#emitTabsChangedForRecord(record);
  }

  #handleDownload(item: DownloadItem, page: WebContents | null): boolean {
    if (!page || page.isDestroyed()) return false;
    const record = this.#recordForWebContents(page.id);
    if (!record || record.detached) return false;
    const url = item.getURL();
    const grantKey = downloadGrantKey(record.webContentsId, url);
    const grant = this.#downloadGrants.get(grantKey);
    if (grant && grant.expiresAt > Date.now()) {
      this.#downloadGrants.delete(grantKey);
      const requestId = record.download?.requestId ?? randomUUID();
      item.setSavePath(grant.savePath);
      record.download = {
        requestId,
        status: "in-progress",
        filename: safeFilename(item.getFilename()),
        receivedBytes: 0,
        totalBytes: item.getTotalBytes(),
        error: null,
      };
      item.on("updated", () => {
        if (!record.download || record.download.requestId !== requestId) return;
        record.download = {
          ...record.download,
          receivedBytes: Math.max(0, item.getReceivedBytes()),
          totalBytes: item.getTotalBytes(),
        };
        this.#emitTabsChangedForRecord(record);
      });
      item.once("done", (_event, state) => {
        if (!record.download || record.download.requestId !== requestId) return;
        record.download = {
          ...record.download,
          status: state === "completed" ? "completed" : "failed",
          receivedBytes: Math.max(0, item.getReceivedBytes()),
          totalBytes: item.getTotalBytes(),
          error: state === "completed" ? null : `下载${state}`,
        };
        this.#emitTabsChangedForRecord(record);
      });
      this.#emitTabsChangedForRecord(record);
      return true;
    }
    this.#downloadGrants.delete(grantKey);
    if (!isDownloadUrlAllowed(url)) return false;
    if (record.download?.status === "pending") {
      this.#clearPendingDownload(record, record.download.requestId);
    }
    const requestId = randomUUID();
    const filename = safeFilename(item.getFilename());
    const timer = setTimeout(() => {
      this.#clearPendingDownload(record, requestId);
      this.#emitTabsChangedForRecord(record);
    }, DOWNLOAD_REQUEST_TTL_MS);
    timer.unref?.();
    this.#pendingDownloads.set(requestId, {
      browserTabId: record.browserTabId,
      expiresAt: Date.now() + DOWNLOAD_REQUEST_TTL_MS,
      filename,
      timer,
      url,
    });
    record.download = {
      requestId,
      status: "pending",
      filename,
      receivedBytes: 0,
      totalBytes: item.getTotalBytes(),
      error: null,
    };
    this.#emitTabsChangedForRecord(record);
    return false;
  }

  #recordForWebContents(webContentsId: number) {
    return this.#registry.all().find((record) => record.webContentsId === webContentsId);
  }

  #requestSensitiveAction(
    record: BrowserTabRecord<WebContentsView>,
    turnId: string,
    category: BrowserSensitiveActionCategory,
    label: string,
    signal: AbortSignal,
  ): Promise<void> {
    if (record.sensitiveActionRequest) {
      this.#settleSensitiveAction(
        record.sensitiveActionRequest.requestId,
        false,
        "Browser 敏感动作确认已被新请求替代",
      );
    }
    const requestId = randomUUID();
    const origin = safeOrigin(record.url);
    const expiresAt = Date.now() + SENSITIVE_ACTION_REQUEST_TTL_MS;
    return new Promise<void>((resolve, reject) => {
      const abortListener = () => {
        this.#settleSensitiveAction(
          requestId,
          false,
          errorMessage(signal.reason) || "Browser 敏感动作已取消",
        );
      };
      const timer = setTimeout(() => {
        this.#settleSensitiveAction(
          requestId,
          false,
          "Browser 敏感动作确认已超时",
        );
      }, SENSITIVE_ACTION_REQUEST_TTL_MS);
      timer.unref?.();
      this.#pendingSensitiveActions.set(requestId, {
        browserTabId: record.browserTabId,
        category,
        origin,
        threadId: record.threadId,
        turnId,
        viewGeneration: record.viewGeneration,
        expiresAt,
        timer,
        signal,
        abortListener,
        resolve,
        reject,
      });
      record.sensitiveActionRequest = {
        requestId,
        category,
        origin,
        label: truncateText(label, 1024) || category,
        expiresAt,
      };
      signal.addEventListener("abort", abortListener, { once: true });
      this.#emitTabsChangedForRecord(record);
      if (signal.aborted) abortListener();
    });
  }

  #settleSensitiveAction(
    requestId: string,
    allow: boolean,
    reason: string,
  ): void {
    const pending = this.#pendingSensitiveActions.get(requestId);
    if (!pending) return;
    this.#pendingSensitiveActions.delete(requestId);
    clearTimeout(pending.timer);
    pending.signal.removeEventListener("abort", pending.abortListener);
    const record = this.#registry
      .all()
      .find((candidate) => candidate.browserTabId === pending.browserTabId);
    if (record?.sensitiveActionRequest?.requestId === requestId) {
      record.sensitiveActionRequest = null;
      this.#emitTabsChangedForRecord(record);
    }
    if (allow) pending.resolve();
    else pending.reject(new Error(reason || "Browser 敏感动作未获授权"));
  }

  #rejectPermission(requestId: string): void {
    const pending = this.#pendingPermissions.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.#pendingPermissions.delete(requestId);
    const record = this.#registry
      .all()
      .find((candidate) => candidate.browserTabId === pending.browserTabId);
    if (record?.permissionRequest?.requestId === requestId) {
      record.permissionRequest = null;
    }
    pending.callback(false);
  }

  #clearPendingForRecord(
    record: BrowserTabRecord<WebContentsView>,
    reason = "Browser tab 已关闭或失去 owner",
  ): void {
    if (record.sensitiveActionRequest) {
      this.#settleSensitiveAction(
        record.sensitiveActionRequest.requestId,
        false,
        reason,
      );
    }
    if (record.permissionRequest) {
      this.#rejectPermission(record.permissionRequest.requestId);
    }
    if (record.download) {
      this.#clearPendingDownload(record, record.download.requestId);
      record.download = null;
    }
    if (record.fileChooserRequest) {
      const pending = this.#pendingFileChoosers.get(
        record.fileChooserRequest.requestId,
      );
      if (pending) clearTimeout(pending.timer);
      this.#pendingFileChoosers.delete(record.fileChooserRequest.requestId);
      record.fileChooserRequest = null;
    }
    for (const key of this.#permissionGrants.keys()) {
      if (key.startsWith(`${record.webContentsId}:`)) this.#permissionGrants.delete(key);
    }
    for (const key of this.#downloadGrants.keys()) {
      if (key.startsWith(`${record.webContentsId}:`)) this.#downloadGrants.delete(key);
    }
  }

  #installPagePolicy(record: BrowserTabRecord<WebContentsView>): void {
    const page = record.view.webContents;
    page.setWindowOpenHandler(({ url }) => {
      if (
        isAllowedPageNavigation(url) &&
        this.#ownerWindowForRecord(record) &&
        !record.detached
      ) {
        const ownerWindow = this.#ownerWindowForRecord(record);
        if (!ownerWindow) return { action: "deny" };
        void this.createTab(ownerWindow, record.ownerWindowGeneration, {
          threadId: record.threadId,
          routeKey: record.routeKey,
          url,
        })
          .then((tab) => {
            const popup = this.#registry.requireForRoute(
              record,
              tab.browserTabId,
              tab.viewGeneration,
            );
            popup.origin = "popup";
            this.#persistRecord(popup);
          })
          .catch((error) => {
            console.error("Browser popup 转换为受控 tab 失败", error);
          });
      }
      return { action: "deny" };
    });
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
      this.#observeCdp(record);
      this.#emitTabsChangedForRecord(record);
    });
    page.on("did-stop-loading", () => {
      this.#refreshState(record);
      this.#persistRecord(record);
      this.#emitTabsChangedForRecord(record);
    });
    page.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
      if (!isMainFrame || code === -3) {
        return;
      }
      record.error = { code, description, url };
      record.loading = false;
      this.#emitTabsChangedForRecord(record);
    });
    page.on("page-title-updated", () => {
      this.#refreshState(record);
      this.#persistRecord(record);
      this.#emitTabsChangedForRecord(record);
    });
    page.on("did-navigate", () => {
      record.error = null;
      this.#refreshState(record);
      this.#persistRecord(record);
      this.#emitTabsChangedForRecord(record);
    });
    page.on("did-navigate-in-page", () => {
      this.#refreshState(record);
      this.#persistRecord(record);
      this.#emitTabsChangedForRecord(record);
    });
    page.on("render-process-gone", () => {
      record.crashed = true;
      record.pageLifecycle = "crashed";
      record.loading = false;
      record.dialog = null;
      record.debuggerStatus = "recovering";
      this.#cdp.disposeTarget(record.webContentsId);
      this.#persistRecord(record);
      this.#emitTabsChangedForRecord(record);
    });
    page.on("before-input-event", () => {
      const consumed = this.#consumeAgentInputEcho(record, "keyboard");
      if (consumed) return;
      this.#takeControlRecord(record);
    });
    page.on("before-mouse-event", (_event, mouse) => {
      if (
        mouse.type === "mouseMove" ||
        mouse.type === "mouseEnter" ||
        mouse.type === "mouseLeave"
      ) {
        return;
      }
      const consumed = this.#consumeAgentInputEcho(record, "mouse");
      if (consumed) return;
      this.#takeControlRecord(record);
    });
    page.on("console-message", (details) => {
      record.consoleMessages = [
        ...record.consoleMessages,
        {
          id: randomUUID(),
          level: details.level,
          message: sanitizeConsoleMessage(details.message),
          source: sanitizeConsoleSource(details.sourceId),
          lineNumber: Math.max(0, details.lineNumber),
          timestamp: Date.now(),
        },
      ].slice(-MAX_CONSOLE_MESSAGES);
      this.#queueConsoleEmit(record);
    });
  }

  #createRecord(
    ownerWindow: BrowserWindow,
    windowGeneration: number,
    scope: BrowserRouteScope,
    restored?: StoredBrowserTab,
  ): BrowserTabRecord<WebContentsView> {
    const owner = this.#owner(ownerWindow, windowGeneration);
    this.#registry.assertCanAddForOwner(owner);
    const pageSession = electronSession.fromPartition(BROWSER_PARTITION, {
      cache: true,
    });
    secureBrowserSession(pageSession, {
      checkPermission: (page, permission, origin) =>
        this.#handlePermissionCheck(page, permission, origin),
      requestPermission: (page, permission, callback, origin) =>
        this.#handlePermissionRequest(page, permission, callback, origin),
      handleDownload: (item, page) => this.#handleDownload(item, page),
    });
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
      browserTabId: restored?.browserTabId ?? randomUUID(),
      viewGeneration: restored ? restored.viewGeneration + 1 : 1,
      documentGeneration: 1,
      threadId: scope.threadId,
      routeKey: scope.routeKey,
      url: restored?.url ?? "about:blank",
      title: restored?.title ?? "",
      loading: false,
      canGoBack: false,
      canGoForward: false,
      crashed: false,
      error: null,
      controlOwner: "user",
      agentTurnId: null,
      permissionRequest: null,
      sensitiveActionRequest: null,
      download: null,
      fileChooserRequest: null,
      dialog: null,
      consoleMessages: [],
      debuggerStatus: "recovering",
      pageLifecycle: restored ? "persisted" : "live",
      lastActiveAt: restored?.touchedAt ?? Date.now(),
      blockedAgentTurnId: null,
      createdByTurnId: null,
      detached: false,
      deliverable: restored?.deliverable ?? false,
      handoff: restored?.handoff ?? false,
      origin: restored?.origin ?? "user",
      ownerWebContentsId: owner.webContentsId,
      ownerWindowId: owner.windowId,
      ownerWindowGeneration: owner.windowGeneration,
      profileId: BROWSER_PARTITION,
      webContentsId: view.webContents.id,
      view,
    };
    this.#registry.add(record);
    this.#desiredVisibility.set(record.browserTabId, false);
    this.#installPagePolicy(record);
    this.#observeCdp(record);
    return record;
  }

  #adoptRoute(
    ownerWindow: BrowserWindow,
    owner: BrowserOwner,
    scope: BrowserRouteScope,
  ): void {
    for (const record of this.#registry.listForRoute(scope)) {
      if (
        !record.detached &&
        record.ownerWebContentsId === owner.webContentsId &&
        record.ownerWindowGeneration === owner.windowGeneration
      ) {
        continue;
      }
      if (
        record.ownerWebContentsId !== owner.webContentsId ||
        record.ownerWindowGeneration !== owner.windowGeneration
      ) {
        this.#registry.assertCanAddForOwner(owner);
      }
      const previousWindow = BrowserWindow.fromId(record.ownerWindowId);
      if (previousWindow && !previousWindow.isDestroyed()) {
        try {
          previousWindow.contentView.removeChildView(record.view);
        } catch {
          // view 可能已随旧 window 自动解除挂载。
        }
      }
      ownerWindow.contentView.addChildView(record.view);
      this.#desiredVisibility.set(record.browserTabId, false);
      record.view.setVisible(false);
      this.#abortAgentOperations(record, "Browser tab 正在切换窗口");
      this.#cdp.disposeTarget(record.webContentsId);
      record.ownerWebContentsId = owner.webContentsId;
      record.ownerWindowId = owner.windowId;
      record.ownerWindowGeneration = owner.windowGeneration;
      record.viewGeneration += 1;
      record.detached = false;
      record.controlOwner = "user";
      record.agentTurnId = null;
      record.blockedAgentTurnId = null;
      record.debuggerStatus = "recovering";
      this.#observeCdp(record);
      this.#routeOwners.set(routeOwnerKey(scope), owner);
      this.#persistRecord(record);
    }
  }

  async #restoreRoute(
    ownerWindow: BrowserWindow,
    windowGeneration: number,
    scope: BrowserRouteScope,
  ): Promise<void> {
    for (const stored of this.#sessions.list(scope)) {
      const record = this.#createRecord(
        ownerWindow,
        windowGeneration,
        scope,
        stored,
      );
      if (stored.url !== "about:blank") {
        try {
          await record.view.webContents.loadURL(normalizeBrowserUrl(stored.url));
        } catch (error) {
          record.error = {
            code: -2,
            description: error instanceof Error ? error.message : String(error),
            url: stored.url,
          };
        }
      }
      this.#refreshState(record);
      record.pageLifecycle = record.crashed ? "crashed" : "live";
      this.#persistRecord(record);
    }
  }

  #clearPendingDownload(
    record: BrowserTabRecord<WebContentsView>,
    requestId: string,
  ): void {
    const pending = this.#pendingDownloads.get(requestId);
    if (pending) clearTimeout(pending.timer);
    this.#pendingDownloads.delete(requestId);
    if (
      record.download?.requestId === requestId &&
      record.download.status === "pending"
    ) {
      record.download = null;
    }
  }

  #persistRecord(record: BrowserTabRecord<WebContentsView>): void {
    const navigation = record.view.webContents.navigationHistory;
    const activeEntryIndex = navigation.getActiveIndex();
    const storedNavigationEntries = navigation
      .getAllEntries()
      .map((entry, index) => ({ entry, index }))
      .filter(
        ({ entry }) =>
          isAllowedPageNavigation(entry.url) || entry.url === "about:blank",
      )
      .slice(-128)
      .map(({ entry, index }) => ({
        index,
        url: entry.url,
        title: truncateText(entry.title, 1024),
      }));
    const activeNavigationIndex = storedNavigationEntries.findIndex(
      (entry) => entry.index === activeEntryIndex,
    );
    const navigationEntries = storedNavigationEntries.map(({ url, title }) => ({
      url,
      title,
    }));
    this.#sessions.upsert({
      browserTabId: record.browserTabId,
      threadId: record.threadId,
      routeKey: record.routeKey,
      url: record.url,
      title: record.title,
      viewGeneration: record.viewGeneration,
      origin: record.origin ?? "user",
      claim: {
        controlOwner: record.controlOwner,
        turnId: record.agentTurnId,
      },
      handoff: record.handoff === true,
      deliverable: record.deliverable === true,
      navigationEntries,
      activeNavigationIndex,
      restorePolicy: "reload",
      profileId: record.profileId,
    });
  }

  #claimForAgent(
    record: BrowserTabRecord<WebContentsView>,
    turnId: string,
  ): void {
    if (record.blockedAgentTurnId === turnId) {
      throw new Error("用户已接管 Browser tab；当前 turn 不得继续输入");
    }
    if (record.agentTurnId && record.agentTurnId !== turnId) {
      throw new Error("Browser tab 仍由其他 Agent turn 控制");
    }
    if (record.blockedAgentTurnId !== turnId) {
      record.blockedAgentTurnId = null;
    }
    if (record.controlOwner === "agent" && record.agentTurnId === turnId) {
      return;
    }
    record.controlOwner = "agent";
    record.agentTurnId = turnId;
    this.#emitTabsChangedForRecord(record);
  }

  #takeControlRecord(record: BrowserTabRecord<WebContentsView>): void {
    if (record.controlOwner !== "agent" || !record.agentTurnId) {
      return;
    }
    record.blockedAgentTurnId = record.agentTurnId;
    record.handoff = true;
    record.controlOwner = "user";
    record.agentTurnId = null;
    this.#abortAgentOperations(record, "用户已接管 Browser tab");
    this.#cdp.invalidateDocument(record.webContentsId);
    this.#emitTabsChangedForRecord(record);
  }

  async #runAgentOperation<T>(
    record: BrowserTabRecord<WebContentsView>,
    turnId: string,
    requestSignal: AbortSignal,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    this.#claimForAgent(record, turnId);
    const controller = new AbortController();
    const handleRequestAbort = () => controller.abort(requestSignal.reason);
    requestSignal.addEventListener("abort", handleRequestAbort, { once: true });
    if (requestSignal.aborted) {
      controller.abort(requestSignal.reason);
    }
    const controllers = this.#agentOperations.get(record.browserTabId) ?? new Set();
    controllers.add(controller);
    this.#agentOperations.set(record.browserTabId, controllers);
    try {
      await this.#transitionPageLifecycle(record, "live");
      record.lastActiveAt = Date.now();
      return await operation(controller.signal);
    } finally {
      requestSignal.removeEventListener("abort", handleRequestAbort);
      controllers.delete(controller);
      if (controllers.size === 0) {
        this.#agentOperations.delete(record.browserTabId);
      }
      this.#rebalanceWorkingSet({
        webContentsId: record.ownerWebContentsId,
        windowId: record.ownerWindowId,
        windowGeneration: record.ownerWindowGeneration,
      });
    }
  }

  async #runAgentInputOperation<T>(
    record: BrowserTabRecord<WebContentsView>,
    turnId: string,
    requestSignal: AbortSignal,
    expectedEchoes: { keyboardEchoes?: number; mouseEchoes?: number },
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    return this.#runAgentOperation(
      record,
      turnId,
      requestSignal,
      (signal) =>
        this.#runAgentInputDispatch(record, expectedEchoes, () => operation(signal)),
    );
  }

  async #runAgentInputDispatch<T>(
    record: BrowserTabRecord<WebContentsView>,
    expectedEchoes: { keyboardEchoes?: number; mouseEchoes?: number },
    operation: () => Promise<T>,
  ): Promise<T> {
    const dispatch: AgentInputDispatch = {
      keyboardEchoes: expectedEchoes.keyboardEchoes ?? 0,
      mouseEchoes: expectedEchoes.mouseEchoes ?? 0,
    };
    const dispatches =
      this.#agentInputDispatches.get(record.browserTabId) ?? new Set();
    dispatches.add(dispatch);
    this.#agentInputDispatches.set(record.browserTabId, dispatches);
    try {
      return await operation();
    } finally {
      // If Electron never echoes the injected event, expire the marker instead
      // of letting it suppress a later physical input.
      const timer = setTimeout(() => {
        if (this.#agentInputDispatches.get(record.browserTabId) !== dispatches) return;
        dispatches.delete(dispatch);
        if (dispatches.size === 0) {
          this.#agentInputDispatches.delete(record.browserTabId);
        }
      }, AGENT_INPUT_ECHO_TIMEOUT_MS);
      timer.unref?.();
    }
  }

  #consumeAgentInputEcho(
    record: BrowserTabRecord<WebContentsView>,
    kind: "keyboard" | "mouse",
  ): boolean {
    const dispatches = this.#agentInputDispatches.get(record.browserTabId);
    if (!dispatches) return false;
    for (const dispatch of dispatches) {
      const key = kind === "keyboard" ? "keyboardEchoes" : "mouseEchoes";
      if (dispatch[key] <= 0) continue;
      dispatch[key] -= 1;
      if (dispatch.keyboardEchoes === 0 && dispatch.mouseEchoes === 0) {
        dispatches.delete(dispatch);
      }
      if (dispatches.size === 0) {
        this.#agentInputDispatches.delete(record.browserTabId);
      }
      return true;
    }
    return false;
  }

  #abortAgentOperations(
    record: BrowserTabRecord<WebContentsView>,
    reason: string,
  ): void {
    const controllers = this.#agentOperations.get(record.browserTabId);
    if (!controllers) return;
    for (const controller of controllers) {
      controller.abort(new Error(reason));
    }
    this.#agentOperations.delete(record.browserTabId);
    this.#agentInputDispatches.delete(record.browserTabId);
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
    if (record.detached) return;
    const ownerWindow = this.#ownerWindowForRecord(record);
    if (!ownerWindow) return;
    this.#emitTabsChanged(ownerWindow, record);
  }

  #ownerWindowForRecord(
    record: BrowserTabRecord<WebContentsView>,
  ): BrowserWindow | null {
    const ownerWindow = BrowserWindow.fromId(record.ownerWindowId);
    if (
      !ownerWindow ||
      ownerWindow.isDestroyed() ||
      ownerWindow.webContents.isDestroyed() ||
      ownerWindow.webContents.id !== record.ownerWebContentsId
    ) {
      return null;
    }
    return ownerWindow;
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
        record.crashed = false;
        record.pageLifecycle = "live";
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
      record.pageLifecycle = "crashed";
      record.loading = false;
      return;
    }
    record.url = page.getURL() || "about:blank";
    record.title = truncateText(page.getTitle(), 1024);
    record.loading = page.isLoading();
    record.canGoBack = page.navigationHistory.canGoBack();
    record.canGoForward = page.navigationHistory.canGoForward();
  }

  #rebalanceWorkingSet(owner: BrowserOwner): void {
    const records = this.#registry.listOwned(owner);
    const states = planBrowserWorkingSet(
      records.map((record) => ({
        browserTabId: record.browserTabId,
        crashed: record.crashed || record.view.webContents.isDestroyed(),
        lastActiveAt: record.lastActiveAt,
        protected:
          this.#desiredVisibility.get(record.browserTabId) === true ||
          (this.#agentOperations.get(record.browserTabId)?.size ?? 0) > 0,
      })),
    );
    for (const record of records) {
      const state = states.get(record.browserTabId);
      if (state === "crashed") {
        record.pageLifecycle = "crashed";
      } else if (state) {
        void this.#transitionPageLifecycle(record, state);
      }
    }
  }

  async #transitionPageLifecycle(
    record: BrowserTabRecord<WebContentsView>,
    state: "live" | "suspended",
  ): Promise<void> {
    const previous = this.#lifecycleTransitions.get(record.browserTabId);
    const transition = (previous ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        if (
          !this.#registry.all().includes(record) ||
          record.crashed ||
          record.view.webContents.isDestroyed() ||
          record.pageLifecycle === state
        ) {
          return;
        }
        await this.#cdp.setPageLifecycle(
          record.webContentsId,
          record.view.webContents.debugger,
          state === "live" ? "active" : "frozen",
        );
        if (!this.#registry.all().includes(record)) return;
        record.pageLifecycle = state;
        this.#emitTabsChangedForRecord(record);
      })
      .catch(() => {
        if (this.#registry.all().includes(record) && state === "suspended") {
          record.pageLifecycle = "live";
        }
      })
      .finally(() => {
        if (this.#lifecycleTransitions.get(record.browserTabId) === transition) {
          this.#lifecycleTransitions.delete(record.browserTabId);
        }
      });
    this.#lifecycleTransitions.set(record.browserTabId, transition);
    await transition;
  }

  #observeCdp(record: BrowserTabRecord<WebContentsView>): void {
    void this.#cdp
      .observeTarget(record.webContentsId, record.view.webContents.debugger, {
        isAlive: () =>
          this.#registry.all().includes(record) &&
          !record.detached &&
          !record.view.webContents.isDestroyed(),
        onDialogOpening: (dialog) => {
          record.dialog = {
            requestId: randomUUID(),
            type: dialog.type,
            message: truncateText(dialog.message, 2048),
            defaultPrompt: truncateText(dialog.defaultPrompt ?? "", 1024),
            origin: safeOrigin(dialog.url || record.url),
          };
          this.#emitTabsChangedForRecord(record);
        },
        onDialogClosed: () => {
          if (!record.dialog) return;
          record.dialog = null;
          this.#emitTabsChangedForRecord(record);
        },
        onFileChooserOpening: (chooser, sessionId) => {
          if (record.fileChooserRequest) {
            const previous = this.#pendingFileChoosers.get(
              record.fileChooserRequest.requestId,
            );
            if (previous) clearTimeout(previous.timer);
            this.#pendingFileChoosers.delete(record.fileChooserRequest.requestId);
          }
          const requestId = randomUUID();
          const timer = setTimeout(() => {
            const pending = this.#pendingFileChoosers.get(requestId);
            if (!pending) return;
            this.#pendingFileChoosers.delete(requestId);
            record.fileChooserRequest = null;
            void this.#cdp
              .setFileInputFiles(
                record.webContentsId,
                pending.backendNodeId,
                [],
                pending.sessionId,
              )
              .catch(() => undefined);
            this.#emitTabsChangedForRecord(record);
          }, FILE_CHOOSER_REQUEST_TTL_MS);
          timer.unref?.();
          this.#pendingFileChoosers.set(requestId, {
            browserTabId: record.browserTabId,
            backendNodeId: chooser.backendNodeId,
            expiresAt: Date.now() + FILE_CHOOSER_REQUEST_TTL_MS,
            mode: chooser.mode,
            sessionId,
            timer,
          });
          record.fileChooserRequest = {
            requestId,
            mode: chooser.mode,
            origin: safeOrigin(record.url),
          };
          this.#emitTabsChangedForRecord(record);
        },
        onDebuggerStatus: (status: BrowserDebuggerStatus) => {
          if (record.debuggerStatus === status) return;
          record.debuggerStatus = status;
          this.#emitTabsChangedForRecord(record);
        },
      })
      .catch((error) => {
        if (!record.view.webContents.isDestroyed()) {
          console.warn("Browser debugger observer 初始化失败", error);
        }
      });
  }

  #queueConsoleEmit(record: BrowserTabRecord<WebContentsView>): void {
    if (this.#consoleEmitTimers.has(record.browserTabId)) return;
    const timer = setTimeout(() => {
      this.#consoleEmitTimers.delete(record.browserTabId);
      if (this.#registry.all().includes(record)) {
        this.#emitTabsChangedForRecord(record);
      }
    }, CONSOLE_EVENT_COALESCE_MS);
    timer.unref?.();
    this.#consoleEmitTimers.set(record.browserTabId, timer);
  }

  #clearConsoleEmitTimer(browserTabId: string): void {
    const timer = this.#consoleEmitTimers.get(browserTabId);
    if (timer) clearTimeout(timer);
    this.#consoleEmitTimers.delete(browserTabId);
  }

  #holdCaptureVisibility(record: BrowserTabRecord<WebContentsView>): void {
    const holds = this.#captureVisibilityHolds.get(record.browserTabId) ?? 0;
    this.#captureVisibilityHolds.set(record.browserTabId, holds + 1);
  }

  #releaseCaptureVisibility(browserTabId: string): boolean {
    const holds = this.#captureVisibilityHolds.get(browserTabId) ?? 0;
    if (holds <= 1) {
      this.#captureVisibilityHolds.delete(browserTabId);
      return true;
    }
    this.#captureVisibilityHolds.set(browserTabId, holds - 1);
    return false;
  }

  #destroyRecord(
    record: BrowserTabRecord<WebContentsView>,
    ownerWindow: BrowserWindow,
  ): void {
    this.#clearPendingForRecord(record);
    this.#abortAgentOperations(record, "Browser tab 已关闭");
    this.#cdp.disposeTarget(record.webContentsId);
    this.#registry.remove(record.browserTabId);
    if (!this.#registry.listForRoute(record).some((item) => !item.detached)) {
      this.#routeOwners.delete(routeOwnerKey(record));
    }
    this.#desiredVisibility.delete(record.browserTabId);
    this.#captureVisibilityHolds.delete(record.browserTabId);
    this.#lifecycleTransitions.delete(record.browserTabId);
    this.#clearConsoleEmitTimer(record.browserTabId);
    this.#sessions.remove(record.browserTabId);
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

function routeOwnerKey(scope: Pick<BrowserRouteScope, "threadId" | "routeKey">): string {
  return `${scope.threadId}\u0000${scope.routeKey}`;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("Browser tool 已取消");
}

type BrowserSessionPolicy = {
  checkPermission(
    page: WebContents | null,
    permission: string,
    origin: string,
  ): boolean;
  requestPermission(
    page: WebContents | null,
    permission: string,
    callback: (granted: boolean) => void,
    origin: string,
  ): void;
  handleDownload(item: DownloadItem, page: WebContents | null): boolean;
};

function secureBrowserSession(
  pageSession: Session,
  policy: BrowserSessionPolicy,
): void {
  if (securedBrowserSessions.has(pageSession)) {
    return;
  }
  securedBrowserSessions.add(pageSession);
  pageSession.setPermissionCheckHandler(
    (page, permission, requestingOrigin) =>
      policy.checkPermission(page, permission, requestingOrigin),
  );
  pageSession.setPermissionRequestHandler((page, permission, callback, details) => {
    const requestingOrigin =
      "requestingOrigin" in details && typeof details.requestingOrigin === "string"
        ? details.requestingOrigin
        : page?.getURL() ?? "";
    policy.requestPermission(
      page,
      permission,
      callback,
      requestingOrigin,
    );
  });
  pageSession.setDevicePermissionHandler(() => false);
  pageSession.on("will-download", (event, item, page) => {
    if (!policy.handleDownload(item, page)) event.preventDefault();
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
    controlOwner: record.controlOwner,
    agentTurnId: record.agentTurnId,
    origin: record.origin ?? "user",
    handoff: record.handoff === true,
    deliverable: record.deliverable === true,
    permissionRequest: record.permissionRequest,
    sensitiveActionRequest: record.sensitiveActionRequest ?? null,
    download: record.download,
    fileChooserRequest: record.fileChooserRequest ?? null,
    dialog: record.dialog,
    consoleMessages: record.consoleMessages,
    debuggerStatus: record.debuggerStatus,
    pageLifecycle: record.pageLifecycle,
    lastActiveAt: record.lastActiveAt,
  };
}

function permissionGrantKey(
  webContentsId: number,
  permission: string,
  origin: string,
): string {
  return `${webContentsId}:${permission}:${safeOrigin(origin)}`;
}

function downloadGrantKey(webContentsId: number, url: string): string {
  return `${webContentsId}:${url}`;
}

function safeOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "null";
  }
}

function truncateText(value: string, maxLength: number): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 8 ||
      codePoint === 11 ||
      codePoint === 12 ||
      (codePoint >= 14 && codePoint <= 31) ||
      codePoint === 127
      ? ""
      : character;
  }).join("").slice(0, maxLength);
}

function sanitizeConsoleMessage(value: string): string {
  const text = truncateText(value, 1024);
  if (/\b(authorization|cookie|password|passwd|secret|api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token)\b/i.test(text)) {
    return "[已隐藏可能包含敏感信息的控制台消息]";
  }
  return text;
}

function sanitizeConsoleSource(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return truncateText(url.toString(), 4096);
  } catch {
    return truncateText(value.split(/[?#]/, 1)[0] ?? "", 4096);
  }
}

function safeFilename(value: string): string {
  const filename = path.basename(value.trim()).slice(0, 255);
  return filename || "download";
}

function isDownloadUrlAllowed(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}
