import { describe, expect, it, vi } from "vitest";
import {
  BrowserCdpController,
  type BrowserCdpTarget,
  type BrowserDebuggerTransport,
} from "./browser-cdp-controller";

class FakeDebugger implements BrowserDebuggerTransport {
  attached = false;
  readonly calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
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

  isAttached(): boolean {
    return this.attached;
  }

  attach(): void {
    this.attached = true;
  }

  detach(): void {
    this.attached = false;
  }

  async sendCommand(method: string, params?: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ method, params });
    this.onCommand?.(method);
    switch (method) {
      case "Accessibility.getFullAXTree":
        return { nodes: this.axNodes };
      case "DOM.getBoxModel":
        return { model: { content: [0, 0, 100, 0, 100, 40, 0, 40] } };
      case "DOM.resolveNode":
        return { object: { objectId: "object-1" } };
      case "Page.captureScreenshot":
        return { data: this.screenshotData };
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

    expect(pageDebugger.calls).toEqual([
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
      "Input.insertText",
      "Runtime.releaseObject",
    ]);
    expect(pageDebugger.calls[3]?.params).toEqual({ text: "hello@example.com" });
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
