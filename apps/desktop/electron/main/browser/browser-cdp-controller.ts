import { randomUUID } from "node:crypto";
import { z } from "zod";

const CDP_PROTOCOL_VERSION = "1.3";
const SNAPSHOT_TTL_MS = 30_000;
const MAX_SNAPSHOT_NODES = 500;
const MAX_SNAPSHOT_TEXT_BYTES = 64 * 1024;
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const MAX_FULL_PAGE_DIMENSION = 16_384;
const MAX_FULL_PAGE_PIXELS = 64 * 1024 * 1024;
const MAX_OOPIF_TARGETS = 16;
const MAX_LOCATOR_TIMEOUT_MS = 10_000;
const LOCATOR_POLL_INTERVAL_MS = 100;
const DEBUGGER_RECOVERY_DELAYS_MS = [0, 250, 2_000] as const;

const AxValueSchema = z.object({ value: z.unknown() }).passthrough();
const AxNodeSchema = z
  .object({
    nodeId: z.string(),
    ignored: z.boolean().optional(),
    role: AxValueSchema.optional(),
    name: AxValueSchema.optional(),
    childIds: z.array(z.string()).optional(),
    backendDOMNodeId: z.number().int().positive().optional(),
    properties: z
      .array(
        z
          .object({
            name: z.string(),
            value: AxValueSchema,
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();
const AxTreeSchema = z.object({ nodes: z.array(AxNodeSchema).max(100_000) }).passthrough();
const AxNodesUpdatedSchema = z
  .object({ nodes: z.array(AxNodeSchema).max(100_000) })
  .passthrough();
const BoxModelSchema = z
  .object({
    model: z
      .object({
        content: z.array(z.number()).length(8).optional(),
        border: z.array(z.number()).length(8).optional(),
      })
      .passthrough(),
  })
  .passthrough();
const ResolvedNodeSchema = z
  .object({ object: z.object({ objectId: z.string().min(1) }).passthrough() })
  .passthrough();
const CallFunctionResultSchema = z
  .object({
    exceptionDetails: z.unknown().optional(),
    result: z.object({ value: z.unknown().optional() }).passthrough().optional(),
  })
  .passthrough();
const ScreenshotSchema = z.object({ data: z.string().min(1) }).passthrough();
const DialogOpeningSchema = z
  .object({
    url: z.string().max(4096),
    message: z.string().max(64 * 1024),
    type: z.enum(["alert", "confirm", "prompt", "beforeunload"]),
    defaultPrompt: z.string().max(64 * 1024).optional(),
  })
  .passthrough();
const FileChooserOpeningSchema = z
  .object({
    mode: z.enum(["selectSingle", "selectMultiple"]),
    backendNodeId: z.number().int().positive(),
    frameId: z.string().min(1),
  })
  .passthrough();
const IsolatedWorldSchema = z
  .object({ executionContextId: z.number().int().positive() })
  .passthrough();
const LayoutMetricsSchema = z
  .object({
    cssContentSize: z
      .object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      })
      .optional(),
    contentSize: z
      .object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      })
      .optional(),
  })
  .passthrough();
const TargetInfoSchema = z
  .object({
    targetId: z.string().min(1),
    type: z.string(),
    url: z.string(),
    openerId: z.string().optional(),
    openerFrameId: z.string().optional(),
    parentFrameId: z.string().optional(),
  })
  .passthrough();
const TargetInfoResultSchema = z.object({ targetInfo: TargetInfoSchema }).passthrough();
const TargetListSchema = z.object({ targetInfos: z.array(TargetInfoSchema) }).passthrough();
const AttachTargetSchema = z.object({ sessionId: z.string().min(1) }).passthrough();
type FrameTree = {
  frame: { id: string; url: string };
  childFrames?: FrameTree[];
};
const FrameTreeSchema: z.ZodType<FrameTree> = z.lazy(() =>
  z.object({
    frame: z.object({ id: z.string().min(1), url: z.string() }).passthrough(),
    childFrames: z.array(FrameTreeSchema).optional(),
  }).passthrough(),
);
const PageFrameTreeSchema = z.object({ frameTree: FrameTreeSchema }).passthrough();

const ACTIONABLE_ROLES = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "menuitem",
  "option",
  "radio",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "treeitem",
]);

const SELECT_EDITABLE_CONTENT = `function () {
  if (this instanceof HTMLInputElement || this instanceof HTMLTextAreaElement) {
    this.focus();
    this.select();
    return;
  }
  if (this.isContentEditable) {
    this.focus();
    const selection = this.ownerDocument.getSelection();
    const range = this.ownerDocument.createRange();
    range.selectNodeContents(this);
    selection.removeAllRanges();
    selection.addRange(range);
    return;
  }
  throw new Error("目标不是可编辑元素");
}`;

const VALIDATE_INPUT_TARGET = `function () {
  if (!this.isConnected || this.ownerDocument.activeElement !== this) return false;
  if (this instanceof HTMLInputElement || this instanceof HTMLTextAreaElement) {
    return !this.disabled && !this.readOnly;
  }
  return this.isContentEditable;
}`;

const VALIDATE_STABLE_TARGET = `async function (state) {
  const sample = () => {
    if (!this.isConnected) return null;
    const style = this.ownerDocument.defaultView.getComputedStyle(this);
    if (style.visibility === 'hidden' || style.display === 'none') return null;
    const rect = this.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    if (state === 'actionable') {
      if (this.matches?.(':disabled,[aria-disabled="true"]')) return null;
      if (style.pointerEvents === 'none') return null;
    }
    return [rect.x, rect.y, rect.width, rect.height];
  };
  const first = sample();
  if (!first) return false;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const second = sample();
  return Boolean(second && first.every((value, index) => Math.abs(value - second[index]) < 1));
}`;

const READ_SEMANTIC_DOM_REVISION = `(() => {
  const key = Symbol.for("blackrain.browser.semantic-dom-revision.v1");
  let state = globalThis[key];
  if (!state) {
    state = { revision: 0 };
    const observer = new MutationObserver(() => { state.revision += 1; });
    observer.observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "role", "aria-label", "aria-labelledby", "aria-describedby",
        "aria-hidden", "aria-disabled", "aria-checked", "aria-expanded",
        "aria-pressed", "aria-selected", "alt", "title", "placeholder",
        "value", "disabled", "hidden", "inert", "tabindex", "contenteditable"
      ]
    });
    Object.defineProperty(globalThis, key, { value: state });
  }
  return state.revision;
})()`;

export interface BrowserDebuggerTransport {
  isAttached(): boolean;
  attach(protocolVersion?: string): void;
  detach(): void;
  sendCommand(
    method: string,
    commandParams?: Record<string, unknown>,
    sessionId?: string,
  ): Promise<unknown>;
  on?(
    event: "message" | "detach",
    listener: (...args: unknown[]) => void,
  ): unknown;
  off?(
    event: "message" | "detach",
    listener: (...args: unknown[]) => void,
  ): unknown;
}

export type BrowserDebuggerStatus = "attached" | "recovering" | "unavailable";

export type BrowserCdpObserver = {
  isAlive(): boolean;
  onDialogOpening(dialog: z.infer<typeof DialogOpeningSchema>): void;
  onDialogClosed(): void;
  onFileChooserOpening?(
    chooser: z.infer<typeof FileChooserOpeningSchema>,
    sessionId?: string,
  ): void;
  onDebuggerStatus(status: BrowserDebuggerStatus): void;
};

export type BrowserCdpTarget = {
  browserTabId: string;
  turnId: string;
  viewGeneration: number;
  documentGeneration: number;
  webContentsId: number;
  url: string;
  debugger: BrowserDebuggerTransport;
  readDocumentState: () => { documentGeneration: number; url: string };
};

export type BrowserSnapshotResult = {
  snapshotId: string;
  url: string;
  text: string;
};

export type BrowserLocatorResult = {
  snapshotId: string;
  ref: string;
  role: string;
  name: string;
  url: string;
};

export type BrowserLocatorState = "attached" | "visible" | "actionable";

export type BrowserActionResult = {
  browserTabId: string;
  viewGeneration: number;
  url: string;
};

export type BrowserScreenshotResult = BrowserActionResult & {
  mimeType: "image/png";
  imageUrl: string;
};

type SnapshotRef = {
  backendDOMNodeId: number;
  role: string;
  name: string;
  sessionId?: string;
};

type SnapshotRecord = {
  browserTabId: string;
  turnId: string;
  viewGeneration: number;
  documentGeneration: number;
  webContentsId: number;
  url: string;
  expiresAt: number;
  refs: Map<string, SnapshotRef>;
  childSessions: Set<string>;
};

type ObserverRecord = {
  debugger: BrowserDebuggerTransport;
  observer: BrowserCdpObserver;
  messageListener: (...args: unknown[]) => void;
  detachListener: (...args: unknown[]) => void;
  recoveryTimer?: ReturnType<typeof setTimeout>;
};

type AxTreeCache = {
  documentGeneration: number;
  executionContextId: number;
  mutationRevision: number;
  url: string;
  nodes: Map<string, z.infer<typeof AxNodeSchema>>;
};

export class BrowserCdpController {
  readonly #snapshots = new Map<string, SnapshotRecord>();
  readonly #debuggers = new Map<number, BrowserDebuggerTransport>();
  readonly #observers = new Map<number, ObserverRecord>();
  readonly #orphanedChildSessions = new Map<number, Set<string>>();
  readonly #oopifSessions = new Map<number, Map<string, string>>();
  readonly #axTrees = new Map<string, AxTreeCache>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  async observeTarget(
    webContentsId: number,
    pageDebugger: BrowserDebuggerTransport,
    observer: BrowserCdpObserver,
  ): Promise<void> {
    const existing = this.#observers.get(webContentsId);
    if (existing) {
      if (existing.debugger !== pageDebugger) {
        throw new Error("Browser debugger observer target 映射已失效");
      }
      existing.observer = observer;
      return;
    }
    if (!pageDebugger.on || !pageDebugger.off) {
      throw new Error("Browser debugger transport 不支持事件监听");
    }
    const messageListener = (...args: unknown[]) => {
      const method = typeof args[1] === "string" ? args[1] : "";
      const params = args[2];
      const sessionId =
        typeof args[3] === "string" && args[3].length > 0
          ? args[3]
          : undefined;
      const activeObserver =
        this.#observers.get(webContentsId)?.observer ?? observer;
      if (method === "Page.javascriptDialogOpening") {
        const parsed = DialogOpeningSchema.safeParse(params);
        if (parsed.success) activeObserver.onDialogOpening(parsed.data);
      } else if (method === "Page.javascriptDialogClosed") {
        activeObserver.onDialogClosed();
      } else if (method === "Page.fileChooserOpened") {
        const parsed = FileChooserOpeningSchema.safeParse(params);
        if (parsed.success) {
          activeObserver.onFileChooserOpening?.(parsed.data, sessionId);
        }
      } else if (method === "Accessibility.nodesUpdated") {
        const parsed = AxNodesUpdatedSchema.safeParse(params);
        if (parsed.success) {
          this.#mergeAxNodes(webContentsId, sessionId, parsed.data.nodes);
        }
      } else if (method === "Accessibility.loadComplete") {
        this.#axTrees.delete(axTreeKey(webContentsId, sessionId));
      }
    };
    const detachListener = () => {
      if (this.#debuggers.get(webContentsId) === pageDebugger) {
        this.#debuggers.delete(webContentsId);
      }
      this.invalidateDocument(webContentsId);
      this.#oopifSessions.delete(webContentsId);
      if (!observer.isAlive()) return;
      observer.onDebuggerStatus("recovering");
      this.#scheduleObserverRecovery(webContentsId, 0);
    };
    pageDebugger.on("message", messageListener);
    pageDebugger.on("detach", detachListener);
    this.#observers.set(webContentsId, {
      debugger: pageDebugger,
      observer,
      messageListener,
      detachListener,
    });
    try {
      await this.#enableObservedTarget(webContentsId);
      observer.onDebuggerStatus("attached");
    } catch (error) {
      observer.onDebuggerStatus("recovering");
      this.#scheduleObserverRecovery(webContentsId, 0);
      throw error;
    }
  }

  async handleJavaScriptDialog(
    webContentsId: number,
    accept: boolean,
    promptText?: string,
  ): Promise<void> {
    const pageDebugger = this.#debuggers.get(webContentsId);
    if (!pageDebugger?.isAttached()) {
      throw new Error("Browser debugger 当前不可用，无法响应页面对话框");
    }
    await pageDebugger.sendCommand("Page.handleJavaScriptDialog", {
      accept,
      ...(promptText !== undefined ? { promptText } : {}),
    });
  }

  async snapshot(
    target: BrowserCdpTarget,
    signal: AbortSignal,
  ): Promise<BrowserSnapshotResult> {
    this.#assertTarget(target);
    this.#attach(target);
    this.#flushOrphanedChildSessions(target.webContentsId);
    const tree = AxTreeSchema.parse(
      await this.#readAxTree(target, signal),
    );
    const snapshotId = randomUUID();
    const refs = new Map<string, SnapshotRef>();
    this.#deleteSnapshots(target.webContentsId);
    const childFrames = await this.#snapshotOopifTargets(target, signal);
    let remainingNodes = MAX_SNAPSHOT_NODES;
    const segments: string[] = [];
    const topNodes = tree.nodes.slice(0, remainingNodes);
    remainingNodes -= topNodes.length;
    segments.push(formatSnapshot(topNodes, refs));
    for (const frame of childFrames) {
      if (remainingNodes <= 0) break;
      const nodes = frame.nodes.slice(0, remainingNodes);
      remainingNodes -= nodes.length;
      segments.push(
        `[frame ${sanitizeAxText(frame.url, 512)}]\n${formatSnapshot(
          nodes,
          refs,
          frame.sessionId,
        )}`,
      );
    }
    if (tree.nodes.length + childFrames.reduce((sum, frame) => sum + frame.nodes.length, 0) > MAX_SNAPSHOT_NODES) {
      segments.push("[snapshot truncated]");
    }
    const text = truncateUtf8(segments.filter(Boolean).join("\n"), MAX_SNAPSHOT_TEXT_BYTES);
    this.#snapshots.set(snapshotId, {
      browserTabId: target.browserTabId,
      turnId: target.turnId,
      viewGeneration: target.viewGeneration,
      documentGeneration: target.documentGeneration,
      webContentsId: target.webContentsId,
      url: target.url,
      expiresAt: this.#now() + SNAPSHOT_TTL_MS,
      refs,
      childSessions: new Set(childFrames.map((frame) => frame.sessionId)),
    });
    this.#removeExpiredSnapshots();
    return { snapshotId, url: target.url, text };
  }

  async click(
    target: BrowserCdpTarget,
    snapshotId: string,
    ref: string,
    signal: AbortSignal,
  ): Promise<BrowserActionResult> {
    const node = this.#requireRef(target, snapshotId, ref);
    this.#attach(target);
    await this.#validateActionable(target, node, signal);
    await this.#command(
      target,
      signal,
      "DOM.scrollIntoViewIfNeeded",
      { backendNodeId: node.backendDOMNodeId },
      false,
      node.sessionId,
    );
    let model: z.infer<typeof BoxModelSchema>;
    try {
      model = BoxModelSchema.parse(
        await this.#command(target, signal, "DOM.getBoxModel", {
          backendNodeId: node.backendDOMNodeId,
        }, false, node.sessionId),
      );
    } catch (error) {
      throw new Error(
        `Browser ref 无法定位；当前切片不支持跨进程 iframe/OOPIF: ${errorMessage(error)}`,
      );
    }
    const [x, y] = quadCenter(model.model.content ?? model.model.border);
    await this.#command(target, signal, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
    }, false, node.sessionId);
    await this.#command(target, signal, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1,
    }, true, node.sessionId);
    return actionResult(target);
  }

  async setPageLifecycle(
    webContentsId: number,
    pageDebugger: BrowserDebuggerTransport,
    state: "active" | "frozen",
  ): Promise<void> {
    this.#attachTransport(webContentsId, pageDebugger);
    await pageDebugger.sendCommand("Page.setWebLifecycleState", { state });
    if (state === "frozen") this.invalidateDocument(webContentsId);
  }

  describeRef(
    target: BrowserCdpTarget,
    snapshotId: string,
    ref: string,
  ): BrowserLocatorResult {
    const node = this.#requireRef(target, snapshotId, ref);
    return {
      snapshotId,
      ref,
      role: node.role,
      name: node.name,
      url: target.url,
    };
  }

  async setFileInputFiles(
    webContentsId: number,
    backendNodeId: number,
    files: readonly string[],
    sessionId?: string,
  ): Promise<void> {
    const pageDebugger = this.#debuggers.get(webContentsId);
    if (!pageDebugger?.isAttached()) {
      throw new Error("Browser debugger 当前不可用，无法响应文件选择器");
    }
    await pageDebugger.sendCommand(
      "DOM.setFileInputFiles",
      { backendNodeId, files: [...files] },
      sessionId,
    );
  }

  async locate(
    target: BrowserCdpTarget,
    query: {
      role?: string;
      name: string;
      exact?: boolean;
      state?: BrowserLocatorState;
      timeoutMs?: number;
    },
    signal: AbortSignal,
  ): Promise<BrowserLocatorResult> {
    const expectedName = query.name.trim();
    const expectedRole = query.role?.trim().toLocaleLowerCase();
    const state = query.state ?? "actionable";
    const timeoutMs = Math.min(
      MAX_LOCATOR_TIMEOUT_MS,
      Math.max(0, Math.trunc(query.timeoutMs ?? 5_000)),
    );
    const deadline = Date.now() + timeoutMs;
    let lastFailure = "未找到匹配元素";
    for (;;) {
      const snapshot = await this.snapshot(target, signal);
      const record = this.#snapshots.get(snapshot.snapshotId);
      if (!record) throw new Error("Browser locator snapshot 已失效");
      const matches = [...record.refs.entries()].filter(([, candidate]) => {
        if (expectedRole && candidate.role.toLocaleLowerCase() !== expectedRole) {
          return false;
        }
        return query.exact
          ? candidate.name === expectedName
          : candidate.name
              .toLocaleLowerCase()
              .includes(expectedName.toLocaleLowerCase());
      });
      if (matches.length > 1) {
        throw new Error(
          `Browser locator 匹配到 ${matches.length} 个元素，请提供更精确的 role/name`,
        );
      }
      if (matches.length === 1) {
        const [ref, candidate] = matches[0];
        if (
          state === "attached" ||
          (await this.#isStableTarget(target, candidate, state, signal))
        ) {
          return {
            snapshotId: snapshot.snapshotId,
            ref,
            role: candidate.role,
            name: candidate.name,
            url: snapshot.url,
          };
        }
        lastFailure = `匹配元素尚未达到 ${state} 状态`;
      } else {
        lastFailure = "未找到匹配元素";
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(
          `Browser locator 等待超时 (${timeoutMs}ms): role=${query.role ?? "*"}, name=${JSON.stringify(expectedName)}, state=${state}; ${lastFailure}`,
        );
      }
      await waitForLocatorPoll(
        signal,
        Math.min(LOCATOR_POLL_INTERVAL_MS, remaining),
      );
    }
  }

  async hover(
    target: BrowserCdpTarget,
    snapshotId: string,
    ref: string,
    signal: AbortSignal,
  ): Promise<BrowserActionResult> {
    const node = this.#requireRef(target, snapshotId, ref);
    this.#attach(target);
    await this.#validateActionable(target, node, signal);
    await this.#command(
      target,
      signal,
      "DOM.scrollIntoViewIfNeeded",
      { backendNodeId: node.backendDOMNodeId },
      false,
      node.sessionId,
    );
    const box = BoxModelSchema.parse(
      await this.#command(
        target,
        signal,
        "DOM.getBoxModel",
        { backendNodeId: node.backendDOMNodeId },
        false,
        node.sessionId,
      ),
    );
    const [x, y] = quadCenter(box.model.border ?? box.model.content);
    await this.#command(
      target,
      signal,
      "Input.dispatchMouseEvent",
      { type: "mouseMoved", x, y },
      false,
      node.sessionId,
    );
    return actionResult(target);
  }

  async pressKey(
    target: BrowserCdpTarget,
    key: string,
    signal: AbortSignal,
  ): Promise<BrowserActionResult> {
    this.#assertTarget(target);
    this.#attach(target);
    const { text, ...keyEvent } = cdpKeyEvent(key);
    await this.#command(target, signal, "Input.dispatchKeyEvent", {
      type: text === undefined ? "rawKeyDown" : "keyDown",
      ...keyEvent,
      ...(text === undefined ? {} : { text, unmodifiedText: text }),
    });
    await this.#command(
      target,
      signal,
      "Input.dispatchKeyEvent",
      { type: "keyUp", ...keyEvent },
      true,
    );
    return actionResult(target);
  }

  async scroll(
    target: BrowserCdpTarget,
    deltaX: number,
    deltaY: number,
    signal: AbortSignal,
  ): Promise<BrowserActionResult> {
    this.#assertTarget(target);
    this.#attach(target);
    await this.#command(target, signal, "Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: 1,
      y: 1,
      deltaX,
      deltaY,
    });
    return actionResult(target);
  }

  async typeText(
    target: BrowserCdpTarget,
    snapshotId: string,
    ref: string,
    text: string,
    signal: AbortSignal,
  ): Promise<BrowserActionResult> {
    const node = this.#requireRef(target, snapshotId, ref);
    this.#attach(target);
    await this.#command(target, signal, "DOM.focus", {
      backendNodeId: node.backendDOMNodeId,
    }, false, node.sessionId);
    const resolved = ResolvedNodeSchema.parse(
      await this.#command(target, signal, "DOM.resolveNode", {
        backendNodeId: node.backendDOMNodeId,
      }, false, node.sessionId),
    );
    const objectId = resolved.object.objectId;
    try {
      const selection = CallFunctionResultSchema.parse(
        await this.#command(target, signal, "Runtime.callFunctionOn", {
          objectId,
          functionDeclaration: SELECT_EDITABLE_CONTENT,
          awaitPromise: false,
          returnByValue: true,
        }, false, node.sessionId),
      );
      if (selection.exceptionDetails !== undefined) {
        throw new Error("Browser ref 不是可编辑元素");
      }
      const validation = CallFunctionResultSchema.parse(
        await this.#command(target, signal, "Runtime.callFunctionOn", {
          objectId,
          functionDeclaration: VALIDATE_INPUT_TARGET,
          awaitPromise: false,
          returnByValue: true,
        }, false, node.sessionId),
      );
      if (
        validation.exceptionDetails !== undefined ||
        validation.result?.value !== true
      ) {
        throw new Error("Browser input-target token 已失效，焦点或目标发生漂移");
      }
      await this.#command(
        target,
        signal,
        "Input.insertText",
        { text },
        true,
        node.sessionId,
      );
    } finally {
      try {
        await target.debugger.sendCommand(
          "Runtime.releaseObject",
          { objectId },
          node.sessionId,
        );
      } catch {
        // 页面在输入后导航或崩溃时，远端 object 会自行释放。
      }
    }
    return actionResult(target);
  }

  async screenshot(
    target: BrowserCdpTarget,
    signal: AbortSignal,
    options: { fullPage?: boolean } = {},
  ): Promise<BrowserScreenshotResult> {
    this.#assertTarget(target);
    this.#attach(target);
    const fullPage = options.fullPage === true;
    const clip = fullPage
      ? await this.#stableFullPageClip(target, signal)
      : undefined;
    const response = ScreenshotSchema.parse(
      await this.#command(target, signal, "Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: fullPage,
        ...(clip ? { clip } : {}),
      }),
    );
    if (response.data.length > Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3) + 4) {
      throw new Error(`Browser ${fullPage ? "full-page" : "viewport"} screenshot 超过 5 MiB 上限`);
    }
    const bytes = Buffer.from(response.data, "base64");
    if (
      bytes.byteLength > MAX_SCREENSHOT_BYTES ||
      bytes.byteLength < 8 ||
      !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      throw new Error(`Browser ${fullPage ? "full-page" : "viewport"} screenshot 不是有效且有界的 PNG`);
    }
    return {
      ...actionResult(target),
      mimeType: "image/png",
      imageUrl: `data:image/png;base64,${response.data}`,
    };
  }

  invalidateDocument(webContentsId: number): void {
    this.#deleteSnapshots(webContentsId);
    this.#oopifSessions.delete(webContentsId);
    this.#deleteAxTrees(webContentsId);
  }

  #deleteSnapshots(webContentsId: number): void {
    for (const [snapshotId, snapshot] of this.#snapshots) {
      if (snapshot.webContentsId === webContentsId) {
        this.#deleteSnapshot(snapshotId, snapshot);
      }
    }
  }

  disposeTarget(webContentsId: number): void {
    this.invalidateDocument(webContentsId);
    this.#orphanedChildSessions.delete(webContentsId);
    this.#oopifSessions.delete(webContentsId);
    const observed = this.#observers.get(webContentsId);
    this.#observers.delete(webContentsId);
    if (observed) {
      if (observed.recoveryTimer) clearTimeout(observed.recoveryTimer);
      observed.debugger.off?.("message", observed.messageListener);
      observed.debugger.off?.("detach", observed.detachListener);
    }
    const pageDebugger = this.#debuggers.get(webContentsId);
    this.#debuggers.delete(webContentsId);
    if (pageDebugger?.isAttached()) {
      try {
        pageDebugger.detach();
      } catch {
        // WebContents teardown 期间 debugger 可能已经自动断开。
      }
    }
  }

  dispose(): void {
    for (const webContentsId of new Set([
      ...this.#debuggers.keys(),
      ...this.#observers.keys(),
    ])) {
      this.disposeTarget(webContentsId);
    }
    this.#snapshots.clear();
    this.#axTrees.clear();
  }

  #attach(target: BrowserCdpTarget): void {
    this.#assertTarget(target);
    this.#attachTransport(target.webContentsId, target.debugger);
  }

  #attachTransport(
    webContentsId: number,
    pageDebugger: BrowserDebuggerTransport,
  ): void {
    const known = this.#debuggers.get(webContentsId);
    if (known && known !== pageDebugger) {
      throw new Error("Browser debugger target 映射已失效");
    }
    if (!known && pageDebugger.isAttached()) {
      throw new Error("Browser debugger 已被其他控制方占用");
    }
    if (!pageDebugger.isAttached()) {
      pageDebugger.attach(CDP_PROTOCOL_VERSION);
    }
    this.#debuggers.set(webContentsId, pageDebugger);
  }

  async #enableObservedTarget(webContentsId: number): Promise<void> {
    const observed = this.#observers.get(webContentsId);
    if (!observed || !observed.observer.isAlive()) return;
    this.#attachTransport(webContentsId, observed.debugger);
    await observed.debugger.sendCommand("Page.enable");
    await observed.debugger.sendCommand("Accessibility.enable");
    await observed.debugger.sendCommand("Page.setInterceptFileChooserDialog", {
      enabled: true,
    });
  }

  #scheduleObserverRecovery(webContentsId: number, attempt: number): void {
    const observed = this.#observers.get(webContentsId);
    if (!observed || observed.recoveryTimer || !observed.observer.isAlive()) return;
    const delay = DEBUGGER_RECOVERY_DELAYS_MS[attempt];
    if (delay === undefined) {
      observed.observer.onDebuggerStatus("unavailable");
      return;
    }
    observed.recoveryTimer = setTimeout(() => {
      observed.recoveryTimer = undefined;
      void this.#enableObservedTarget(webContentsId)
        .then(() => observed.observer.onDebuggerStatus("attached"))
        .catch(() => this.#scheduleObserverRecovery(webContentsId, attempt + 1));
    }, delay);
    observed.recoveryTimer.unref?.();
  }

  async #command(
    target: BrowserCdpTarget,
    signal: AbortSignal,
    method: string,
    params?: Record<string, unknown>,
    allowDocumentChangeAfter = false,
    sessionId?: string,
  ): Promise<unknown> {
    this.#assertCurrent(target);
    throwIfAborted(signal);
    const result = await target.debugger.sendCommand(method, params, sessionId);
    throwIfAborted(signal);
    if (!allowDocumentChangeAfter) this.#assertCurrent(target);
    return result;
  }

  #requireRef(target: BrowserCdpTarget, snapshotId: string, ref: string): SnapshotRef {
    this.#assertTarget(target);
    this.#removeExpiredSnapshots();
    const snapshot = this.#snapshots.get(snapshotId);
    if (
      !snapshot ||
      snapshot.browserTabId !== target.browserTabId ||
      snapshot.turnId !== target.turnId ||
      snapshot.viewGeneration !== target.viewGeneration ||
      snapshot.documentGeneration !== target.documentGeneration ||
      snapshot.webContentsId !== target.webContentsId ||
      snapshot.url !== target.url
    ) {
      throw new Error("Browser snapshot 已过期或不属于当前页面 generation");
    }
    const node = snapshot.refs.get(ref);
    if (!node) {
      throw new Error("Browser ref 不存在或不可操作");
    }
    return node;
  }

  async #validateActionable(
    target: BrowserCdpTarget,
    node: SnapshotRef,
    signal: AbortSignal,
  ): Promise<void> {
    const resolved = ResolvedNodeSchema.parse(
      await this.#command(
        target,
        signal,
        "DOM.resolveNode",
        { backendNodeId: node.backendDOMNodeId },
        false,
        node.sessionId,
      ),
    );
    const objectId = resolved.object.objectId;
    try {
      if (!(await this.#callStableTarget(target, node, objectId, "actionable", signal))) {
        throw new Error(
          "Browser ref 当前不可操作：元素已断开、隐藏、禁用或不接收指针事件",
        );
      }
    } finally {
      try {
        await target.debugger.sendCommand(
          "Runtime.releaseObject",
          { objectId },
          node.sessionId,
        );
      } catch {
        // 导航或 frame teardown 会自动释放远端 object。
      }
    }
  }

  async #isStableTarget(
    target: BrowserCdpTarget,
    node: SnapshotRef,
    state: Exclude<BrowserLocatorState, "attached">,
    signal: AbortSignal,
  ): Promise<boolean> {
    const resolved = ResolvedNodeSchema.parse(
      await this.#command(
        target,
        signal,
        "DOM.resolveNode",
        { backendNodeId: node.backendDOMNodeId },
        false,
        node.sessionId,
      ),
    );
    const objectId = resolved.object.objectId;
    try {
      return await this.#callStableTarget(target, node, objectId, state, signal);
    } finally {
      await target.debugger
        .sendCommand("Runtime.releaseObject", { objectId }, node.sessionId)
        .catch(() => undefined);
    }
  }

  async #callStableTarget(
    target: BrowserCdpTarget,
    node: SnapshotRef,
    objectId: string,
    state: Exclude<BrowserLocatorState, "attached">,
    signal: AbortSignal,
  ): Promise<boolean> {
    const validation = CallFunctionResultSchema.parse(
      await this.#command(
        target,
        signal,
        "Runtime.callFunctionOn",
        {
          objectId,
          functionDeclaration: VALIDATE_STABLE_TARGET,
          arguments: [{ value: state }],
          awaitPromise: true,
          returnByValue: true,
        },
        false,
        node.sessionId,
      ),
    );
    return (
      validation.exceptionDetails === undefined &&
      validation.result?.value === true
    );
  }

  #assertTarget(target: BrowserCdpTarget): void {
    if (!target.url.startsWith("http://") && !target.url.startsWith("https://")) {
      throw new Error("Browser CDP 只允许控制 http/https 页面");
    }
    this.#assertCurrent(target);
  }

  #assertCurrent(target: BrowserCdpTarget): void {
    const current = target.readDocumentState();
    if (
      current.documentGeneration !== target.documentGeneration ||
      current.url !== target.url
    ) {
      throw new Error("Browser 页面在操作期间发生导航，document generation 已失效");
    }
  }

  #removeExpiredSnapshots(): void {
    const now = this.#now();
    for (const [snapshotId, snapshot] of this.#snapshots) {
      if (snapshot.expiresAt <= now) {
        this.#deleteSnapshot(snapshotId, snapshot);
      }
    }
  }

  async #stableFullPageClip(
    target: BrowserCdpTarget,
    signal: AbortSignal,
  ): Promise<{ x: number; y: number; width: number; height: number; scale: number }> {
    let previous = await this.#readContentSize(target, signal);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.#command(target, signal, "Runtime.evaluate", {
        expression:
          "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
        awaitPromise: true,
        returnByValue: true,
      });
      const current = await this.#readContentSize(target, signal);
      if (sameContentSize(previous, current)) {
        return validateFullPageClip(current);
      }
      previous = current;
    }
    throw new Error("Browser full-page capture 的 layout metrics 未稳定");
  }

  async #readContentSize(target: BrowserCdpTarget, signal: AbortSignal) {
    const metrics = LayoutMetricsSchema.parse(
      await this.#command(target, signal, "Page.getLayoutMetrics"),
    );
    const size = metrics.cssContentSize ?? metrics.contentSize;
    if (!size) throw new Error("Browser full-page capture 缺少 layout metrics");
    return size;
  }

  async #snapshotOopifTargets(
    target: BrowserCdpTarget,
    signal: AbortSignal,
  ): Promise<Array<{ sessionId: string; url: string; nodes: z.infer<typeof AxNodeSchema>[] }>> {
    const currentTarget = TargetInfoResultSchema.parse(
      await this.#command(target, signal, "Target.getTargetInfo"),
    ).targetInfo;
    const targets = TargetListSchema.parse(
      await this.#command(target, signal, "Target.getTargets"),
    ).targetInfos;
    const frameTree = PageFrameTreeSchema.parse(
      await this.#command(target, signal, "Page.getFrameTree"),
    ).frameTree;
    const routeFrameIds = new Set<string>();
    collectFrameIds(frameTree, routeFrameIds);
    const routeTargetIds = new Set([currentTarget.targetId]);
    const selectedTargetIds = new Set<string>();
    const pending = targets.filter((candidate) => candidate.type === "iframe");
    const selected: typeof pending = [];
    let changed = true;
    while (changed && selected.length < MAX_OOPIF_TARGETS) {
      changed = false;
      for (const candidate of pending) {
        if (selectedTargetIds.has(candidate.targetId)) continue;
        if (
          routeFrameIds.has(candidate.targetId) ||
          (candidate.parentFrameId && routeTargetIds.has(candidate.parentFrameId)) ||
          (candidate.openerId && routeTargetIds.has(candidate.openerId)) ||
          (candidate.openerFrameId && routeTargetIds.has(candidate.openerFrameId))
        ) {
          routeTargetIds.add(candidate.targetId);
          selectedTargetIds.add(candidate.targetId);
          selected.push(candidate);
          changed = true;
          if (selected.length >= MAX_OOPIF_TARGETS) break;
        }
      }
    }

    const frames: Array<{
      sessionId: string;
      url: string;
      nodes: z.infer<typeof AxNodeSchema>[];
    }> = [];
    const sessions = this.#oopifSessions.get(target.webContentsId) ?? new Map();
    this.#oopifSessions.set(target.webContentsId, sessions);
    const selectedIds = new Set(selected.map((frame) => frame.targetId));
    for (const targetId of sessions.keys()) {
      if (!selectedIds.has(targetId)) sessions.delete(targetId);
    }
    const attachedSessions: Array<{ targetId: string; sessionId: string }> = [];
    try {
      for (const frame of selected) {
        let sessionId = sessions.get(frame.targetId);
        if (!sessionId) {
          const attached = AttachTargetSchema.parse(
            await this.#command(target, signal, "Target.attachToTarget", {
              targetId: frame.targetId,
              flatten: true,
            }),
          );
          sessionId = attached.sessionId;
          sessions.set(frame.targetId, sessionId);
          attachedSessions.push({ targetId: frame.targetId, sessionId });
          await this.#command(
            target,
            signal,
            "Accessibility.enable",
            undefined,
            false,
            sessionId,
          );
        }
        const tree = AxTreeSchema.parse(
          await this.#readAxTree(target, signal, sessionId),
        );
        frames.push({
          sessionId,
          url: frame.url,
          nodes: tree.nodes,
        });
      }
      return frames;
    } catch (error) {
      for (const attached of attachedSessions) {
        if (sessions.get(attached.targetId) === attached.sessionId) {
          sessions.delete(attached.targetId);
        }
        void target.debugger
          .sendCommand("Target.detachFromTarget", { sessionId: attached.sessionId })
          .catch(() => undefined);
      }
      throw new Error(`Browser OOPIF snapshot 失败: ${errorMessage(error)}`);
    }
  }

  #deleteSnapshot(snapshotId: string, snapshot: SnapshotRecord): void {
    this.#snapshots.delete(snapshotId);
    if (snapshot.childSessions.size === 0) return;
    const pending =
      this.#orphanedChildSessions.get(snapshot.webContentsId) ?? new Set<string>();
    for (const sessionId of snapshot.childSessions) pending.add(sessionId);
    this.#orphanedChildSessions.set(snapshot.webContentsId, pending);
  }

  #flushOrphanedChildSessions(webContentsId: number): void {
    const pending = this.#orphanedChildSessions.get(webContentsId);
    if (!pending) return;
    this.#orphanedChildSessions.delete(webContentsId);
    // Electron 42 的 WebContentsDebugger 在主动 detach child session 时
    // 可能把 page target 一并关闭。page/tab teardown 会回收这些 session，
    // 因此这里只丢弃旧引用，不向 page debugger 发送 detach 命令。
    void pending;
  }

  async #readAxTree(
    target: BrowserCdpTarget,
    signal: AbortSignal,
    sessionId?: string,
  ): Promise<z.infer<typeof AxTreeSchema>> {
    const key = axTreeKey(target.webContentsId, sessionId);
    let cached = this.#axTrees.get(key);
    let runtime:
      | { executionContextId: number; mutationRevision: number }
      | undefined;
    if (this.#observers.has(target.webContentsId)) {
      try {
        runtime = await this.#readSemanticDomRevision(
          target,
          signal,
          cached?.executionContextId,
          sessionId,
        );
      } catch {
        this.#axTrees.delete(key);
        cached = undefined;
        runtime = await this.#readSemanticDomRevision(
          target,
          signal,
          undefined,
          sessionId,
        );
      }
    }
    if (
      cached &&
      cached.documentGeneration === target.documentGeneration &&
      cached.url === target.url &&
      runtime?.mutationRevision === cached.mutationRevision
    ) {
      return { nodes: [...cached.nodes.values()] };
    }
    const tree = AxTreeSchema.parse(
      await this.#command(
        target,
        signal,
        "Accessibility.getFullAXTree",
        undefined,
        false,
        sessionId,
      ),
    );
    if (runtime) {
      this.#axTrees.set(key, {
        documentGeneration: target.documentGeneration,
        executionContextId: runtime.executionContextId,
        mutationRevision: runtime.mutationRevision,
        url: target.url,
        nodes: new Map(tree.nodes.map((node) => [node.nodeId, node])),
      });
    }
    return tree;
  }

  async #readSemanticDomRevision(
    target: BrowserCdpTarget,
    signal: AbortSignal,
    existingExecutionContextId?: number,
    sessionId?: string,
  ): Promise<{ executionContextId: number; mutationRevision: number }> {
    let executionContextId = existingExecutionContextId;
    if (!executionContextId) {
      const frameTree = PageFrameTreeSchema.parse(
        await this.#command(
          target,
          signal,
          "Page.getFrameTree",
          undefined,
          false,
          sessionId,
        ),
      ).frameTree;
      executionContextId = IsolatedWorldSchema.parse(
        await this.#command(
          target,
          signal,
          "Page.createIsolatedWorld",
          {
            frameId: frameTree.frame.id,
            worldName: "blackrain-browser-runtime",
            grantUniveralAccess: false,
          },
          false,
          sessionId,
        ),
      ).executionContextId;
    }
    const evaluation = CallFunctionResultSchema.parse(
      await this.#command(
        target,
        signal,
        "Runtime.evaluate",
        {
          contextId: executionContextId,
          expression: READ_SEMANTIC_DOM_REVISION,
          returnByValue: true,
        },
        false,
        sessionId,
      ),
    );
    const revision = evaluation.result?.value;
    if (
      evaluation.exceptionDetails !== undefined ||
      typeof revision !== "number" ||
      !Number.isSafeInteger(revision) ||
      revision < 0
    ) {
      throw new Error("Browser selector runtime 未返回有效 DOM revision");
    }
    return { executionContextId, mutationRevision: revision };
  }

  #mergeAxNodes(
    webContentsId: number,
    sessionId: string | undefined,
    nodes: z.infer<typeof AxNodeSchema>[],
  ): void {
    const cached = this.#axTrees.get(axTreeKey(webContentsId, sessionId));
    if (!cached) return;
    for (const node of nodes) cached.nodes.set(node.nodeId, node);
  }

  #deleteAxTrees(webContentsId: number): void {
    const prefix = `${webContentsId}\u0000`;
    for (const key of this.#axTrees.keys()) {
      if (key.startsWith(prefix)) this.#axTrees.delete(key);
    }
  }
}

function axTreeKey(webContentsId: number, sessionId?: string): string {
  return `${webContentsId}\u0000${sessionId ?? ""}`;
}

function formatSnapshot(
  nodes: z.infer<typeof AxNodeSchema>[],
  refs: Map<string, SnapshotRef>,
  sessionId?: string,
): string {
  const parents = new Map<string, string>();
  for (const node of nodes) {
    for (const childId of node.childIds ?? []) {
      if (!parents.has(childId)) parents.set(childId, node.nodeId);
    }
  }

  const lines: string[] = [];
  let bytes = 0;
  let visited = 0;
  let truncated = false;
  for (const node of nodes) {
    if (visited >= MAX_SNAPSHOT_NODES) {
      truncated = true;
      break;
    }
    visited += 1;
    if (node.ignored) continue;
    const role = axString(node.role) || "node";
    const name = sanitizeAxText(axString(node.name), 512);
    const focusable = node.properties?.some(
      (property) => property.name === "focusable" && property.value.value === true,
    );
    const actionable =
      node.backendDOMNodeId !== undefined &&
      (ACTIONABLE_ROLES.has(role) || focusable === true);
    if (!name && !actionable && role !== "RootWebArea") continue;

    const ref = actionable ? `ref-${refs.size + 1}` : undefined;
    const depth = nodeDepth(node.nodeId, parents);
    const state = formatAxState(node.properties ?? []);
    const line = `${"  ".repeat(depth)}${ref ? `[${ref}] ` : ""}${role}${
      name ? ` "${name}"` : ""
    }${state ? ` ${state}` : ""}`;
    const lineBytes = Buffer.byteLength(`${line}\n`, "utf8");
    if (bytes + lineBytes > MAX_SNAPSHOT_TEXT_BYTES) {
      truncated = true;
      break;
    }
    lines.push(line);
    bytes += lineBytes;
    if (ref && node.backendDOMNodeId !== undefined) {
      refs.set(ref, {
        backendDOMNodeId: node.backendDOMNodeId,
        role,
        name,
        sessionId,
      });
    }
  }
  if (truncated || visited < nodes.length) {
    const marker = "[snapshot truncated]";
    if (bytes + Buffer.byteLength(marker, "utf8") <= MAX_SNAPSHOT_TEXT_BYTES) {
      lines.push(marker);
    }
  }
  return lines.join("\n");
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let end = Math.min(value.length, maxBytes);
  while (end > 0 && Buffer.byteLength(value.slice(0, end), "utf8") > maxBytes) {
    end -= 1;
  }
  return value.slice(0, end);
}

function collectFrameIds(frameTree: FrameTree, target: Set<string>): void {
  target.add(frameTree.frame.id);
  for (const child of frameTree.childFrames ?? []) {
    collectFrameIds(child, target);
  }
}

function sameContentSize(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    Math.abs(left.x - right.x) < 1 &&
    Math.abs(left.y - right.y) < 1 &&
    Math.abs(left.width - right.width) < 1 &&
    Math.abs(left.height - right.height) < 1
  );
}

function validateFullPageClip(size: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const x = Math.max(0, Math.floor(size.x));
  const y = Math.max(0, Math.floor(size.y));
  const width = Math.ceil(size.width);
  const height = Math.ceil(size.height);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_FULL_PAGE_DIMENSION ||
    height > MAX_FULL_PAGE_DIMENSION ||
    width * height > MAX_FULL_PAGE_PIXELS
  ) {
    throw new Error("Browser full-page capture 尺寸超过 16384 px / 64 MiP 上限");
  }
  return { x, y, width, height, scale: 1 };
}

function waitForLocatorPoll(signal: AbortSignal, timeoutMs: number): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Browser locator 已取消"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, timeoutMs);
    timer.unref?.();
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function formatAxState(
  properties: Array<{ name: string; value: { value: unknown } }>,
): string {
  const states: string[] = [];
  for (const property of properties) {
    if (
      ["checked", "disabled", "expanded", "pressed", "selected"].includes(
        property.name,
      ) &&
      (typeof property.value.value === "boolean" ||
        typeof property.value.value === "string")
    ) {
      states.push(`${property.name}=${String(property.value.value)}`);
    }
  }
  return states.join(" ");
}

function nodeDepth(nodeId: string, parents: Map<string, string>): number {
  let depth = 0;
  let current = nodeId;
  const seen = new Set<string>();
  while (depth < 12) {
    const parent = parents.get(current);
    if (!parent || seen.has(parent)) break;
    seen.add(parent);
    current = parent;
    depth += 1;
  }
  return depth;
}

function axString(value: { value: unknown } | undefined): string {
  return typeof value?.value === "string" ? value.value : "";
}

function sanitizeAxText(value: string, maxLength: number): string {
  return value
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .replaceAll('"', '\\"');
}

function quadCenter(quad: number[] | undefined): readonly [number, number] {
  if (!quad || quad.some((value) => !Number.isFinite(value))) {
    throw new Error("Browser ref 没有可点击的 box model");
  }
  const xs = [quad[0], quad[2], quad[4], quad[6]];
  const ys = [quad[1], quad[3], quad[5], quad[7]];
  if (Math.max(...xs) - Math.min(...xs) <= 0 || Math.max(...ys) - Math.min(...ys) <= 0) {
    throw new Error("Browser ref 的 box model 不可见或尺寸为零");
  }
  return [
    (quad[0] + quad[2] + quad[4] + quad[6]) / 4,
    (quad[1] + quad[3] + quad[5] + quad[7]) / 4,
  ];
}

function actionResult(target: BrowserCdpTarget): BrowserActionResult {
  return {
    browserTabId: target.browserTabId,
    viewGeneration: target.viewGeneration,
    url: target.url,
  };
}

function cdpKeyEvent(key: string): Record<string, unknown> & { text?: string } {
  const normalized = key.toLocaleLowerCase();
  if (normalized === "enter") {
    return {
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
      text: "\r",
    };
  }
  if (normalized === "numpadenter") {
    return {
      key: "Enter",
      code: "NumpadEnter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
      location: 3,
      isKeypad: true,
      text: "\r",
    };
  }
  if (key === " " || normalized === "space" || normalized === "spacebar") {
    return {
      key: " ",
      code: "Space",
      windowsVirtualKeyCode: 32,
      nativeVirtualKeyCode: 32,
      text: " ",
    };
  }
  return { key };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("Browser CDP 操作已取消");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
