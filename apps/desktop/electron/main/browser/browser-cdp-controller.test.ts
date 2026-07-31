import { describe, expect, it, vi } from "vitest";
import {
  BrowserCdpController,
  type BrowserCdpTarget,
  type BrowserDebuggerTransport,
} from "./browser-cdp-controller";

class FakeDebugger implements BrowserDebuggerTransport {
  attached = false;
  attachCalls = 0;
  readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  readonly calls: Array<{
    method: string;
    params?: Record<string, unknown>;
    sessionId?: string;
  }> = [];
  axNodes: unknown[] = [
    {
      nodeId: "root",
      role: { value: "RootWebArea" },
      name: { value: "Example" },
      childIds: ["button", "input"],
    },
    {
      nodeId: "button",
      role: { value: "button" },
      name: { value: "提交" },
      backendDOMNodeId: 101,
    },
    {
      nodeId: "input",
      role: { value: "textbox" },
      name: { value: "邮箱" },
      backendDOMNodeId: 102,
    },
  ];
  screenshotData = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString(
    "base64",
  );
  onCommand?: (method: string) => void;
  targetInfos: Array<Record<string, unknown>> = [];
  oopifAxNodes: unknown[] = [];
  layoutSizes: Array<{ x: number; y: number; width: number; height: number }> = [
    { x: 0, y: 0, width: 1200, height: 2400 },
  ];
  layoutMetricCalls = 0;
  mutationRevision = 0;
  frameTree: Record<string, unknown> = {
    frame: { id: "main-frame", url: "https://example.com/" },
  };

  isAttached(): boolean {
    return this.attached;
  }

  attach(): void {
    this.attached = true;
    this.attachCalls += 1;
  }

  detach(): void {
    this.attached = false;
  }

  on(event: "message" | "detach", listener: (...args: unknown[]) => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: "message" | "detach", listener: (...args: unknown[]) => void) {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: "message" | "detach", ...args: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener({}, ...args);
    }
  }

  async sendCommand(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
  ): Promise<unknown> {
    this.calls.push({ method, params, ...(sessionId ? { sessionId } : {}) });
    this.onCommand?.(method);
    switch (method) {
      case "Accessibility.getFullAXTree":
        return { nodes: sessionId ? this.oopifAxNodes : this.axNodes };
      case "Target.getTargetInfo":
        return {
          targetInfo: {
            targetId: "page-1",
            type: "page",
            url: "https://example.com/",
          },
        };
      case "Target.getTargets":
        return { targetInfos: this.targetInfos };
      case "Page.getFrameTree":
        return { frameTree: this.frameTree };
      case "Page.createIsolatedWorld":
        return { executionContextId: sessionId ? 201 : 101 };
      case "Page.getLayoutMetrics": {
        const index = Math.min(
          this.layoutMetricCalls,
          this.layoutSizes.length - 1,
        );
        this.layoutMetricCalls += 1;
        return { cssContentSize: this.layoutSizes[index] };
      }
      case "Target.attachToTarget":
        return { sessionId: `session-${String(params?.targetId)}` };
      case "DOM.getBoxModel":
        return { model: { content: [0, 0, 100, 0, 100, 40, 0, 40] } };
      case "DOM.resolveNode":
        return { object: { objectId: "object-1" } };
      case "Page.captureScreenshot":
        return { data: this.screenshotData };
      case "Runtime.callFunctionOn":
        return { result: { value: true } };
      case "Runtime.evaluate":
        return { result: { value: this.mutationRevision } };
      default:
        return {};
    }
  }
}

function createTarget(pageDebugger: FakeDebugger) {
  const state = { documentGeneration: 1, url: "https://example.com/" };
  const target: BrowserCdpTarget = {
    browserTabId: "tab-1",
    turnId: "turn-1",
    viewGeneration: 1,
    documentGeneration: 1,
    webContentsId: 10,
    url: "https://example.com/",
    debugger: pageDebugger,
    readDocumentState: () => state,
  };
  return { state, target };
}

describe("BrowserCdpController", () => {
  it("通过 CDP 切换页面 active/frozen 生命周期", async () => {
    const pageDebugger = new FakeDebugger();
    const controller = new BrowserCdpController();

    await controller.setPageLifecycle(10, pageDebugger, "frozen");
    await controller.setPageLifecycle(10, pageDebugger, "active");

    expect(pageDebugger.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "Page.setWebLifecycleState",
          params: { state: "frozen" },
        }),
        expect.objectContaining({
          method: "Page.setWebLifecycleState",
          params: { state: "active" },
        }),
      ]),
    );
  });

  it("标准化 dialog 事件、响应命令并在意外 detach 后恢复 debugger", async () => {
    const pageDebugger = new FakeDebugger();
    const controller = new BrowserCdpController();
    const dialogs: unknown[] = [];
    const fileChoosers: unknown[] = [];
    const statuses: string[] = [];
    await controller.observeTarget(10, pageDebugger, {
        isAlive: () => true,
        onDialogOpening: (dialog) => dialogs.push(dialog),
        onDialogClosed: vi.fn(),
        onFileChooserOpening: (chooser, sessionId) =>
          fileChoosers.push({ chooser, sessionId }),
        onDebuggerStatus: (status) => statuses.push(status),
    });

    pageDebugger.emit("message", "Page.javascriptDialogOpening", {
        url: "https://example.com/",
        message: "继续吗？",
        type: "confirm",
    });
    expect(dialogs).toEqual([
        expect.objectContaining({ message: "继续吗？", type: "confirm" }),
    ]);
    pageDebugger.emit(
      "message",
      "Page.fileChooserOpened",
      { mode: "selectSingle", backendNodeId: 102, frameId: "main-frame" },
      "",
    );
    pageDebugger.emit(
      "message",
      "Page.fileChooserOpened",
      { mode: "selectMultiple", backendNodeId: 202, frameId: "child-frame" },
      "session-frame-1",
    );
    expect(fileChoosers).toEqual([
      {
        chooser: {
          mode: "selectSingle",
          backendNodeId: 102,
          frameId: "main-frame",
        },
        sessionId: undefined,
      },
      {
        chooser: {
          mode: "selectMultiple",
          backendNodeId: 202,
          frameId: "child-frame",
        },
        sessionId: "session-frame-1",
      },
    ]);
    await controller.handleJavaScriptDialog(10, true);
    expect(pageDebugger.calls).toContainEqual({
        method: "Page.handleJavaScriptDialog",
        params: { accept: true },
    });

    pageDebugger.attached = false;
    pageDebugger.emit("detach", "replaced_with_devtools");
    expect(statuses.at(-1)).toBe("recovering");
    await vi.waitFor(() => expect(pageDebugger.attachCalls).toBe(2), {
      timeout: 1_000,
    });
    expect(statuses.at(-1)).toBe("attached");
    expect(
      pageDebugger.calls.filter((call) => call.method === "Page.enable"),
    ).toHaveLength(2);
    controller.disposeTarget(10);
  });

  it("生成有界 accessibility 文本和短期可操作 ref", async () => {
    const pageDebugger = new FakeDebugger();
    pageDebugger.axNodes = [
      pageDebugger.axNodes[0],
      ...Array.from({ length: 600 }, (_, index) => ({
        nodeId: `button-${index}`,
        role: { value: "button" },
        name: { value: `操作 ${index}` },
        backendDOMNodeId: index + 1,
      })),
    ];
    const controller = new BrowserCdpController();
    const { target } = createTarget(pageDebugger);

    const snapshot = await controller.snapshot(target, new AbortController().signal);

    expect(snapshot.url).toBe("https://example.com/");
    expect(snapshot.text).toContain('[ref-1] button "操作 0"');
    expect(snapshot.text).toContain("[snapshot truncated]");
    expect(snapshot.text).not.toContain("[ref-500]");
    expect(Buffer.byteLength(snapshot.text, "utf8")).toBeLessThanOrEqual(64 * 1024);
    expect(pageDebugger.attached).toBe(true);
  });

  it("导航或 TTL 到期后拒绝旧 snapshot/ref", async () => {
    let now = 1_000;
    const pageDebugger = new FakeDebugger();
    const controller = new BrowserCdpController(() => now);
    const first = createTarget(pageDebugger);
    const snapshot = await controller.snapshot(
      first.target,
      new AbortController().signal,
    );

    first.state.documentGeneration += 1;
    await expect(
      controller.click(
        first.target,
        snapshot.snapshotId,
        "ref-1",
        new AbortController().signal,
      ),
    ).rejects.toThrow(/generation/);

    first.state.documentGeneration = 1;
    await expect(
      controller.click(
        { ...first.target, turnId: "turn-2" },
        snapshot.snapshotId,
        "ref-1",
        new AbortController().signal,
      ),
    ).rejects.toThrow(/过期/);

    const second = createTarget(new FakeDebugger());
    second.target.webContentsId = 11;
    const expiring = await controller.snapshot(
      second.target,
      new AbortController().signal,
    );
    now += 30_001;
    await expect(
      controller.click(
        second.target,
        expiring.snapshotId,
        "ref-1",
        new AbortController().signal,
      ),
    ).rejects.toThrow(/过期/);
  });

  it("只通过 box model 中心发送受限点击事件", async () => {
    const pageDebugger = new FakeDebugger();
    const controller = new BrowserCdpController();
    const { target } = createTarget(pageDebugger);
    const snapshot = await controller.snapshot(target, new AbortController().signal);
    pageDebugger.calls.length = 0;

    await controller.click(
      target,
      snapshot.snapshotId,
      "ref-1",
      new AbortController().signal,
    );

    expect(pageDebugger.calls.map((call) => call.method)).toEqual([
      "DOM.resolveNode",
      "Runtime.callFunctionOn",
      "Runtime.releaseObject",
      "DOM.scrollIntoViewIfNeeded",
      "DOM.getBoxModel",
      "Input.dispatchMouseEvent",
      "Input.dispatchMouseEvent",
    ]);
    expect(pageDebugger.calls.slice(-3)).toEqual([
      { method: "DOM.getBoxModel", params: { backendNodeId: 101 } },
      {
        method: "Input.dispatchMouseEvent",
        params: {
          type: "mousePressed",
          x: 50,
          y: 20,
          button: "left",
          clickCount: 1,
        },
      },
      {
        method: "Input.dispatchMouseEvent",
        params: {
          type: "mouseReleased",
          x: 50,
          y: 20,
          button: "left",
          clickCount: 1,
        },
      },
    ]);
  });

  it("允许最后一次点击事件自身触发页面导航", async () => {
    const pageDebugger = new FakeDebugger();
    const controller = new BrowserCdpController();
    const { state, target } = createTarget(pageDebugger);
    const snapshot = await controller.snapshot(target, new AbortController().signal);
    pageDebugger.onCommand = (method) => {
      if (method === "Input.dispatchMouseEvent" && pageDebugger.calls.length === 4) {
        state.documentGeneration += 1;
        state.url = "https://example.com/next";
      }
    };

    await expect(
      controller.click(
        target,
        snapshot.snapshotId,
        "ref-1",
        new AbortController().signal,
      ),
    ).resolves.toEqual(expect.objectContaining({ browserTabId: "tab-1" }));
  });

  it("聚焦可编辑 ref、选择现有内容并插入文本", async () => {
    const pageDebugger = new FakeDebugger();
    const controller = new BrowserCdpController();
    const { target } = createTarget(pageDebugger);
    const snapshot = await controller.snapshot(target, new AbortController().signal);
    pageDebugger.calls.length = 0;

    await controller.typeText(
      target,
      snapshot.snapshotId,
      "ref-2",
      "hello@example.com",
      new AbortController().signal,
    );

    expect(pageDebugger.calls.map((call) => call.method)).toEqual([
      "DOM.focus",
      "DOM.resolveNode",
      "Runtime.callFunctionOn",
      "Runtime.callFunctionOn",
      "Input.insertText",
      "Runtime.releaseObject",
    ]);
    expect(pageDebugger.calls[4]?.params).toEqual({ text: "hello@example.com" });
  });

  it("输入前使用同一远端 object token 重新确认焦点与目标", async () => {
    const pageDebugger = new FakeDebugger();
    const original = pageDebugger.sendCommand.bind(pageDebugger);
    pageDebugger.sendCommand = vi.fn(async (method, params, sessionId) => {
      if (
        method === "Runtime.callFunctionOn" &&
        String(params?.functionDeclaration).includes("activeElement")
      ) {
        return { result: { value: false } };
      }
      return original(method, params, sessionId);
    });
    const controller = new BrowserCdpController();
    const { target } = createTarget(pageDebugger);
    const snapshot = await controller.snapshot(target, new AbortController().signal);

    await expect(
      controller.typeText(
        target,
        snapshot.snapshotId,
        "ref-2",
        "不得写入",
        new AbortController().signal,
      ),
    ).rejects.toThrow(/input-target token/);
    expect(pageDebugger.calls.some((call) => call.method === "Input.insertText")).toBe(
      false,
    );
  });

  it("为 Enter 键发送可激活页面控件的完整 CDP 键盘事件", async () => {
    const pageDebugger = new FakeDebugger();
    const controller = new BrowserCdpController();
    const { target } = createTarget(pageDebugger);

    await controller.pressKey(target, "Enter", new AbortController().signal);

    expect(pageDebugger.calls.slice(-2)).toEqual([
      {
        method: "Input.dispatchKeyEvent",
        params: {
          type: "keyDown",
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
          nativeVirtualKeyCode: 13,
          text: "\r",
          unmodifiedText: "\r",
        },
      },
      {
        method: "Input.dispatchKeyEvent",
        params: {
          type: "keyUp",
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
          nativeVirtualKeyCode: 13,
        },
      },
    ]);
  });

  it("等待唯一 locator 出现并通过两帧 actionability 稳定检查", async () => {
    const pageDebugger = new FakeDebugger();
    const original = pageDebugger.sendCommand.bind(pageDebugger);
    let reads = 0;
    pageDebugger.sendCommand = vi.fn(async (method, params, sessionId) => {
      if (method === "Accessibility.getFullAXTree" && !sessionId) {
        reads += 1;
        if (reads === 2) {
          pageDebugger.axNodes = [
            ...pageDebugger.axNodes,
            {
              nodeId: "delayed-button",
              role: { value: "button" },
              name: { value: "延迟操作" },
              backendDOMNodeId: 103,
            },
          ];
        }
      }
      return original(method, params, sessionId);
    });
    const controller = new BrowserCdpController();
    const { target } = createTarget(pageDebugger);

    await expect(
      controller.locate(
        target,
        { role: "button", name: "延迟操作", exact: true, timeoutMs: 500 },
        new AbortController().signal,
      ),
    ).resolves.toEqual(
      expect.objectContaining({ role: "button", name: "延迟操作" }),
    );
    expect(reads).toBe(2);
    expect(pageDebugger.calls).toContainEqual(
      expect.objectContaining({
        method: "Runtime.callFunctionOn",
        params: expect.objectContaining({
          arguments: [{ value: "actionable" }],
          awaitPromise: true,
        }),
      }),
    );
  });

  it("合并增量 ARIA 更新，locator 轮询不重复读取完整 AX tree", async () => {
    const pageDebugger = new FakeDebugger();
    const controller = new BrowserCdpController();
    const { target } = createTarget(pageDebugger);
    await controller.observeTarget(target.webContentsId, pageDebugger, {
      isAlive: () => true,
      onDialogOpening: vi.fn(),
      onDialogClosed: vi.fn(),
      onDebuggerStatus: vi.fn(),
    });

    await controller.snapshot(target, new AbortController().signal);
    pageDebugger.emit("message", "Accessibility.nodesUpdated", {
      nodes: [
        {
          nodeId: "incremental-button",
          role: { value: "button" },
          name: { value: "增量操作" },
          backendDOMNodeId: 104,
        },
      ],
    });

    await expect(
      controller.locate(
        target,
        { role: "button", name: "增量操作", exact: true, timeoutMs: 0 },
        new AbortController().signal,
      ),
    ).resolves.toEqual(expect.objectContaining({ name: "增量操作" }));
    expect(
      pageDebugger.calls.filter(
        (call) => call.method === "Accessibility.getFullAXTree",
      ),
    ).toHaveLength(1);
  });

  it("isolated selector runtime 发现语义 DOM 变化后刷新 AX tree", async () => {
    const pageDebugger = new FakeDebugger();
    const controller = new BrowserCdpController();
    const { target } = createTarget(pageDebugger);
    await controller.observeTarget(target.webContentsId, pageDebugger, {
      isAlive: () => true,
      onDialogOpening: vi.fn(),
      onDialogClosed: vi.fn(),
      onDebuggerStatus: vi.fn(),
    });

    await controller.snapshot(target, new AbortController().signal);
    pageDebugger.axNodes = [
      ...pageDebugger.axNodes,
      {
        nodeId: "mutation-button",
        role: { value: "button" },
        name: { value: "DOM 变化" },
        backendDOMNodeId: 105,
      },
    ];
    pageDebugger.mutationRevision = 1;
    const changed = await controller.snapshot(
      target,
      new AbortController().signal,
    );

    expect(changed.text).toContain('button "DOM 变化"');
    expect(
      pageDebugger.calls.filter(
        (call) => call.method === "Accessibility.getFullAXTree",
      ),
    ).toHaveLength(2);
    expect(pageDebugger.calls).toContainEqual(
      expect.objectContaining({
        method: "Page.createIsolatedWorld",
        params: expect.objectContaining({
          worldName: "blackrain-browser-runtime",
          grantUniveralAccess: false,
        }),
      }),
    );
  });

  it("区分 attached 与 actionable，并为不可操作元素返回有界超时", async () => {
    const pageDebugger = new FakeDebugger();
    const original = pageDebugger.sendCommand.bind(pageDebugger);
    pageDebugger.sendCommand = vi.fn(async (method, params, sessionId) => {
      if (
        method === "Runtime.callFunctionOn" &&
        String(params?.functionDeclaration).includes("requestAnimationFrame")
      ) {
        return { result: { value: false } };
      }
      return original(method, params, sessionId);
    });
    const controller = new BrowserCdpController();
    const { target } = createTarget(pageDebugger);

    await expect(
      controller.locate(
        target,
        { role: "button", name: "提交", exact: true, state: "attached", timeoutMs: 0 },
        new AbortController().signal,
      ),
    ).resolves.toEqual(expect.objectContaining({ name: "提交" }));
    await expect(
      controller.locate(
        target,
        { role: "button", name: "提交", exact: true, timeoutMs: 0 },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/等待超时.*state=actionable.*尚未达到 actionable/);
  });

  it("locator 匹配不唯一时立即返回明确失败", async () => {
    const pageDebugger = new FakeDebugger();
    pageDebugger.axNodes = [
      ...pageDebugger.axNodes,
      {
        nodeId: "duplicate-button",
        role: { value: "button" },
        name: { value: "提交" },
        backendDOMNodeId: 103,
      },
    ];
    const controller = new BrowserCdpController();
    const { target } = createTarget(pageDebugger);

    await expect(
      controller.locate(
        target,
        { role: "button", name: "提交", exact: true, timeoutMs: 500 },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/匹配到 2 个元素/);
  });

  it("OOPIF locator 轮询复用同一 child session", async () => {
    const pageDebugger = new FakeDebugger();
    pageDebugger.targetInfos = [
      {
        targetId: "frame-1",
        type: "iframe",
        url: "https://cross-origin.example/frame",
        parentFrameId: "page-1",
      },
    ];
    pageDebugger.frameTree = {
      frame: { id: "main-frame", url: "https://example.com/" },
      childFrames: [
        { frame: { id: "frame-1", url: "https://cross-origin.example/frame" } },
      ],
    };
    const original = pageDebugger.sendCommand.bind(pageDebugger);
    let frameReads = 0;
    pageDebugger.sendCommand = vi.fn(async (method, params, sessionId) => {
      if (method === "Accessibility.getFullAXTree" && sessionId) {
        frameReads += 1;
        pageDebugger.oopifAxNodes =
          frameReads === 1
            ? []
            : [
                {
                  nodeId: "frame-button",
                  role: { value: "button" },
                  name: { value: "跨域延迟操作" },
                  backendDOMNodeId: 201,
                },
              ];
      }
      return original(method, params, sessionId);
    });
    const controller = new BrowserCdpController();
    const { target } = createTarget(pageDebugger);

    await expect(
      controller.locate(
        target,
        { role: "button", name: "跨域延迟操作", exact: true, timeoutMs: 500 },
        new AbortController().signal,
      ),
    ).resolves.toEqual(expect.objectContaining({ name: "跨域延迟操作" }));
    expect(frameReads).toBe(2);
    expect(
      pageDebugger.calls.filter((call) => call.method === "Target.attachToTarget"),
    ).toHaveLength(1);
  });

  it("只附着当前 page 派生的 OOPIF，并用对应 session 执行 ref", async () => {
    const pageDebugger = new FakeDebugger();
    pageDebugger.targetInfos = [
      {
        targetId: "frame-1",
        type: "iframe",
        url: "https://cross-origin.example/frame",
        parentFrameId: "page-1",
      },
      {
        targetId: "foreign-frame",
        type: "iframe",
        url: "https://foreign.example/",
        openerId: "other-page",
      },
    ];
    pageDebugger.frameTree = {
      frame: { id: "main-frame", url: "https://example.com/" },
      childFrames: [
        {
          frame: {
            id: "frame-1",
            url: "https://cross-origin.example/frame",
          },
        },
      ],
    };
    pageDebugger.oopifAxNodes = [
      {
        nodeId: "frame-root",
        role: { value: "RootWebArea" },
        name: { value: "Frame" },
        childIds: ["frame-button"],
      },
      {
        nodeId: "frame-button",
        role: { value: "button" },
        name: { value: "跨域提交" },
        backendDOMNodeId: 201,
      },
    ];
    const controller = new BrowserCdpController();
    const { target } = createTarget(pageDebugger);
    const snapshot = await controller.snapshot(target, new AbortController().signal);

    expect(snapshot.text).toContain("[frame https://cross-origin.example/frame]");
    expect(snapshot.text).toContain('[ref-3] button "跨域提交"');
    expect(
      pageDebugger.calls.some(
        (call) =>
          call.method === "Target.attachToTarget" &&
          call.params?.targetId === "foreign-frame",
      ),
    ).toBe(false);

    pageDebugger.calls.length = 0;
    await controller.click(
      target,
      snapshot.snapshotId,
      "ref-3",
      new AbortController().signal,
    );
    expect(pageDebugger.calls).toContainEqual({
      method: "DOM.getBoxModel",
      params: { backendNodeId: 201 },
      sessionId: "session-frame-1",
    });
    expect(
      pageDebugger.calls
        .filter((call) => call.method === "Input.dispatchMouseEvent")
        .every((call) => call.sessionId === "session-frame-1"),
    ).toBe(true);
  });

  it("OOPIF attach 后读取 AX 失败也会释放 child session", async () => {
    const pageDebugger = new FakeDebugger();
    pageDebugger.targetInfos = [
      {
        targetId: "frame-1",
        type: "iframe",
        url: "https://cross-origin.example/frame",
        parentFrameId: "page-1",
      },
    ];
    const original = pageDebugger.sendCommand.bind(pageDebugger);
    pageDebugger.sendCommand = vi.fn(async (method, params, sessionId) => {
      if (method === "Accessibility.getFullAXTree" && sessionId) {
        throw new Error("frame crashed");
      }
      return original(method, params, sessionId);
    });
    const controller = new BrowserCdpController();
    const { target } = createTarget(pageDebugger);

    await expect(
      controller.snapshot(target, new AbortController().signal),
    ).rejects.toThrow(/OOPIF snapshot/);
    await vi.waitFor(() =>
      expect(pageDebugger.calls).toContainEqual({
        method: "Target.detachFromTarget",
        params: { sessionId: "session-frame-1" },
      }),
    );
  });

  it("失效 snapshot 不主动 detach child session，后续 snapshot 仍可读取 OOPIF", async () => {
    const pageDebugger = new FakeDebugger();
    pageDebugger.targetInfos = [
      {
        targetId: "frame-1",
        type: "iframe",
        url: "https://cross-origin.example/frame",
        parentFrameId: "page-1",
      },
    ];
    pageDebugger.frameTree = {
      frame: { id: "main-frame", url: "https://example.com/" },
      childFrames: [{ frame: { id: "frame-1", url: "https://cross-origin.example/frame" } }],
    };
    pageDebugger.oopifAxNodes = [
      {
        nodeId: "frame-root",
        role: { value: "RootWebArea" },
        name: { value: "Frame" },
        childIds: [],
      },
    ];
    const controller = new BrowserCdpController();
    const { target } = createTarget(pageDebugger);

    await controller.snapshot(target, new AbortController().signal);
    pageDebugger.calls.length = 0;
    controller.invalidateDocument(target.webContentsId);
    expect(
      pageDebugger.calls.some((call) => call.method === "Target.detachFromTarget"),
    ).toBe(false);

    const next = await controller.snapshot(target, new AbortController().signal);
    expect(next.text).toContain("Frame");
    expect(
      pageDebugger.calls.some((call) => call.method === "Target.detachFromTarget"),
    ).toBe(false);
  });

  it("只返回当前 viewport 的有界 PNG data URL", async () => {
    const pageDebugger = new FakeDebugger();
    const controller = new BrowserCdpController();
    const { target } = createTarget(pageDebugger);

    await expect(
      controller.screenshot(target, new AbortController().signal),
    ).resolves.toEqual(
      expect.objectContaining({
        mimeType: "image/png",
        imageUrl: expect.stringMatching(/^data:image\/png;base64,/),
      }),
    );
    expect(pageDebugger.calls.at(-1)).toEqual({
      method: "Page.captureScreenshot",
      params: {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false,
      },
    });

    pageDebugger.screenshotData = Buffer.from("not a png").toString("base64");
    await expect(
      controller.screenshot(target, new AbortController().signal),
    ).rejects.toThrow(/PNG/);

    pageDebugger.screenshotData = "A".repeat(
      Math.ceil(((5 * 1024 * 1024) * 4) / 3) + 5,
    );
    await expect(
      controller.screenshot(target, new AbortController().signal),
    ).rejects.toThrow(/5 MiB/);
  });

  it("等待稳定 layout metrics 后截取有界 full-page PNG", async () => {
    const pageDebugger = new FakeDebugger();
    const controller = new BrowserCdpController();
    const { target } = createTarget(pageDebugger);

    await expect(
      controller.screenshot(target, new AbortController().signal, {
        fullPage: true,
      }),
    ).resolves.toEqual(expect.objectContaining({ mimeType: "image/png" }));
    expect(pageDebugger.calls.map((call) => call.method)).toContain(
      "Runtime.evaluate",
    );
    expect(pageDebugger.calls.at(-1)).toEqual({
      method: "Page.captureScreenshot",
      params: {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: 1200, height: 2400, scale: 1 },
      },
    });
  });

  it("拒绝不稳定或超过预算的 full-page layout", async () => {
    const unstableDebugger = new FakeDebugger();
    unstableDebugger.layoutSizes = [
      { x: 0, y: 0, width: 1000, height: 2000 },
      { x: 0, y: 0, width: 1000, height: 2100 },
      { x: 0, y: 0, width: 1000, height: 2200 },
      { x: 0, y: 0, width: 1000, height: 2300 },
    ];
    const controller = new BrowserCdpController();
    await expect(
      controller.screenshot(
        createTarget(unstableDebugger).target,
        new AbortController().signal,
        { fullPage: true },
      ),
    ).rejects.toThrow(/未稳定/);

    const oversizedDebugger = new FakeDebugger();
    oversizedDebugger.layoutSizes = [
      { x: 0, y: 0, width: 17_000, height: 100 },
    ];
    const oversizedController = new BrowserCdpController();
    await expect(
      oversizedController.screenshot(
        createTarget(oversizedDebugger).target,
        new AbortController().signal,
        { fullPage: true },
      ),
    ).rejects.toThrow(/16384 px/);
  });

  it("销毁 target 时清理 snapshot 并断开 debugger", async () => {
    const pageDebugger = new FakeDebugger();
    const detach = vi.spyOn(pageDebugger, "detach");
    const controller = new BrowserCdpController();
    const { target } = createTarget(pageDebugger);
    const snapshot = await controller.snapshot(target, new AbortController().signal);

    controller.disposeTarget(target.webContentsId);

    expect(detach).toHaveBeenCalledOnce();
    await expect(
      controller.click(
        target,
        snapshot.snapshotId,
        "ref-1",
        new AbortController().signal,
      ),
    ).rejects.toThrow(/过期/);
  });
});
