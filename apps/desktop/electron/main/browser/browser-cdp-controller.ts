import { randomUUID } from "node:crypto";
import { z } from "zod";

const CDP_PROTOCOL_VERSION = "1.3";
const SNAPSHOT_TTL_MS = 30_000;
const MAX_SNAPSHOT_NODES = 500;
const MAX_SNAPSHOT_TEXT_BYTES = 64 * 1024;
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

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
  .object({ exceptionDetails: z.unknown().optional() })
  .passthrough();
const ScreenshotSchema = z.object({ data: z.string().min(1) }).passthrough();

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

export interface BrowserDebuggerTransport {
  isAttached(): boolean;
  attach(protocolVersion?: string): void;
  detach(): void;
  sendCommand(
    method: string,
    commandParams?: Record<string, unknown>,
    sessionId?: string,
  ): Promise<unknown>;
}

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
};

export class BrowserCdpController {
  readonly #snapshots = new Map<string, SnapshotRecord>();
  readonly #debuggers = new Map<number, BrowserDebuggerTransport>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  async snapshot(
    target: BrowserCdpTarget,
    signal: AbortSignal,
  ): Promise<BrowserSnapshotResult> {
    this.#assertTarget(target);
    this.#attach(target);
    const tree = AxTreeSchema.parse(
      await this.#command(target, signal, "Accessibility.getFullAXTree"),
    );
    const snapshotId = randomUUID();
    const refs = new Map<string, SnapshotRef>();
    const text = formatSnapshot(tree.nodes, refs);
    this.invalidateDocument(target.webContentsId);
    this.#snapshots.set(snapshotId, {
      browserTabId: target.browserTabId,
      turnId: target.turnId,
      viewGeneration: target.viewGeneration,
      documentGeneration: target.documentGeneration,
      webContentsId: target.webContentsId,
      url: target.url,
      expiresAt: this.#now() + SNAPSHOT_TTL_MS,
      refs,
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
    let model: z.infer<typeof BoxModelSchema>;
    try {
      model = BoxModelSchema.parse(
        await this.#command(target, signal, "DOM.getBoxModel", {
          backendNodeId: node.backendDOMNodeId,
        }),
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
    });
    await this.#command(target, signal, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1,
    }, true);
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
    });
    const resolved = ResolvedNodeSchema.parse(
      await this.#command(target, signal, "DOM.resolveNode", {
        backendNodeId: node.backendDOMNodeId,
      }),
    );
    const objectId = resolved.object.objectId;
    try {
      const selection = CallFunctionResultSchema.parse(
        await this.#command(target, signal, "Runtime.callFunctionOn", {
          objectId,
          functionDeclaration: SELECT_EDITABLE_CONTENT,
          awaitPromise: false,
          returnByValue: true,
        }),
      );
      if (selection.exceptionDetails !== undefined) {
        throw new Error("Browser ref 不是可编辑元素");
      }
      await this.#command(target, signal, "Input.insertText", { text }, true);
    } finally {
      try {
        await target.debugger.sendCommand("Runtime.releaseObject", { objectId });
      } catch {
        // 页面在输入后导航或崩溃时，远端 object 会自行释放。
      }
    }
    return actionResult(target);
  }

  async screenshot(
    target: BrowserCdpTarget,
    signal: AbortSignal,
  ): Promise<BrowserScreenshotResult> {
    this.#assertTarget(target);
    this.#attach(target);
    const response = ScreenshotSchema.parse(
      await this.#command(target, signal, "Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false,
      }),
    );
    if (response.data.length > Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3) + 4) {
      throw new Error("Browser viewport screenshot 超过 5 MiB 上限");
    }
    const bytes = Buffer.from(response.data, "base64");
    if (
      bytes.byteLength > MAX_SCREENSHOT_BYTES ||
      bytes.byteLength < 8 ||
      !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      throw new Error("Browser viewport screenshot 不是有效且有界的 PNG");
    }
    return {
      ...actionResult(target),
      mimeType: "image/png",
      imageUrl: `data:image/png;base64,${response.data}`,
    };
  }

  invalidateDocument(webContentsId: number): void {
    for (const [snapshotId, snapshot] of this.#snapshots) {
      if (snapshot.webContentsId === webContentsId) {
        this.#snapshots.delete(snapshotId);
      }
    }
  }

  disposeTarget(webContentsId: number): void {
    this.invalidateDocument(webContentsId);
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
    for (const webContentsId of [...this.#debuggers.keys()]) {
      this.disposeTarget(webContentsId);
    }
    this.#snapshots.clear();
  }

  #attach(target: BrowserCdpTarget): void {
    this.#assertTarget(target);
    const known = this.#debuggers.get(target.webContentsId);
    if (known && known !== target.debugger) {
      throw new Error("Browser debugger target 映射已失效");
    }
    if (!known && target.debugger.isAttached()) {
      throw new Error("Browser debugger 已被其他控制方占用");
    }
    if (!target.debugger.isAttached()) {
      target.debugger.attach(CDP_PROTOCOL_VERSION);
    }
    this.#debuggers.set(target.webContentsId, target.debugger);
  }

  async #command(
    target: BrowserCdpTarget,
    signal: AbortSignal,
    method: string,
    params?: Record<string, unknown>,
    allowDocumentChangeAfter = false,
  ): Promise<unknown> {
    this.#assertCurrent(target);
    throwIfAborted(signal);
    const result = await target.debugger.sendCommand(method, params);
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
        this.#snapshots.delete(snapshotId);
      }
    }
  }
}

function formatSnapshot(
  nodes: z.infer<typeof AxNodeSchema>[],
  refs: Map<string, SnapshotRef>,
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
      refs.set(ref, { backendDOMNodeId: node.backendDOMNodeId, role });
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

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("Browser CDP 操作已取消");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
