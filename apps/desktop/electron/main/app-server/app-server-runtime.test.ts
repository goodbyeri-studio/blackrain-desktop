import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { BrowserAgentBackend } from "../browser/browser-dynamic-tool-adapter";
import { AppServerRuntime } from "./app-server-runtime";

describe("AppServerRuntime", () => {
  it("跑通 thread/turn/dynamic tool 到唯一 Browser backend", async () => {
    const fixturePath = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const browser: BrowserAgentBackend = {
      listTabsForAgent: vi.fn(() => []),
      createTabForAgent: vi.fn(async () => { throw new Error("not used"); }),
      navigateForAgent: vi.fn(async () => {
        throw new Error("not used");
      }),
      controlForAgent: vi.fn(() => {
        throw new Error("not used");
      }),
      snapshotForAgent: vi.fn(async () => {
        throw new Error("not used");
      }),
      clickForAgent: vi.fn(async () => {
        throw new Error("not used");
      }),
      typeTextForAgent: vi.fn(async () => {
        throw new Error("not used");
      }),
      screenshotForAgent: vi.fn(async () => {
        throw new Error("not used");
      }),
      completeAgentTurn: vi.fn(),
    };
    let resolveToolResult!: (value: unknown) => void;
    const toolResult = new Promise<unknown>((resolve) => {
      resolveToolResult = resolve;
    });
    let resolveTurnCompleted!: () => void;
    const turnCompleted = new Promise<void>((resolve) => {
      resolveTurnCompleted = resolve;
    });
    let resolveTurnParams!: (value: unknown) => void;
    const turnParams = new Promise<unknown>((resolve) => {
      resolveTurnParams = resolve;
    });
    let resolveSteerParams!: (value: unknown) => void;
    const steerParams = new Promise<unknown>((resolve) => {
      resolveSteerParams = resolve;
    });
    let resolveListParams!: (value: unknown) => void;
    const listParams = new Promise<unknown>((resolve) => {
      resolveListParams = resolve;
    });
    const runtime = new AppServerRuntime({
      resolveExecutablePath: () => process.execPath,
      cwd: process.cwd(),
      clientVersion: "0.7.68",
      browserBackend: browser,
      launchArguments: [fixturePath],
      onNotification: (method, params) => {
        if (method === "test/browser-tool-result") resolveToolResult(params);
        if (method === "turn/completed") resolveTurnCompleted();
        if (method === "test/turn-start-params") resolveTurnParams(params);
        if (method === "test/turn-steer-params") resolveSteerParams(params);
        if (method === "test/thread-list-params") resolveListParams(params);
      },
    });

    await expect(runtime.listThreads({
      workspaceId: "workspace-1",
      cursor: "cursor-1",
      limit: 25,
      sortKey: "updated_at",
    })).resolves.toEqual({
      data: [{ id: "thread-1", cwd: process.cwd() }],
      nextCursor: "next-page",
    });
    await expect(listParams).resolves.toEqual({
      cursor: "cursor-1",
      limit: 25,
      sortKey: "updated_at",
      sourceKinds: [
        "cli",
        "vscode",
        "appServer",
        "subAgentReview",
        "subAgentCompact",
        "subAgentThreadSpawn",
        "unknown",
      ],
    });

    await expect(
      runtime.startTurn({ threadId: "thread-other", prompt: "不允许" }),
    ).rejects.toThrow(/未由当前/);
    await expect(runtime.startThread({
      cwd: process.cwd(),
      workspaceId: "workspace-1",
    })).resolves.toEqual({
      threadId: "thread-browser-1",
      thread: { id: "thread-browser-1" },
    });
    await expect(
      runtime.startTurn({
        threadId: "thread-browser-1",
        prompt: "列出浏览器标签页",
        model: "gpt-test",
        effort: "high",
        serviceTier: "fast",
        accessMode: "current",
        images: ["https://example.test/image.png"],
        appMentions: [{ name: "calendar", path: "app://calendar" }],
      }),
    ).resolves.toEqual({
      threadId: "thread-browser-1",
      turnId: "turn-browser-1",
    });
    await expect(toolResult).resolves.toEqual({
      contentItems: [{ type: "inputText", text: "[]" }],
      success: true,
    });
    await expect(turnParams).resolves.toEqual(expect.objectContaining({
      cwd: process.cwd(),
      model: "gpt-test",
      effort: "high",
      serviceTier: "fast",
      approvalPolicy: "on-request",
      sandboxPolicy: expect.objectContaining({
        type: "workspaceWrite",
        writableRoots: [process.cwd()],
      }),
      input: [
        { type: "text", text: "列出浏览器标签页", text_elements: [] },
        { type: "image", url: "https://example.test/image.png" },
        { type: "mention", name: "calendar", path: "app://calendar" },
      ],
    }));
    await turnCompleted;
    await expect(runtime.steerTurn({
      threadId: "thread-browser-1",
      turnId: "turn-browser-1",
      prompt: "继续",
    })).resolves.toEqual({
      threadId: "thread-browser-1",
      turnId: "turn-browser-1",
    });
    await expect(steerParams).resolves.toEqual({
      threadId: "thread-browser-1",
      expectedTurnId: "turn-browser-1",
      input: [{ type: "text", text: "继续", text_elements: [] }],
    });
    expect(browser.listTabsForAgent).toHaveBeenCalledWith({
      threadId: "thread-browser-1",
      routeKey: "browser-sidebar",
    });
    expect(browser.completeAgentTurn).toHaveBeenCalledWith(
      { threadId: "thread-browser-1", routeKey: "browser-sidebar" },
      "turn-browser-1",
    );
    const events = runtime.getEvents({ afterSequence: 0 });
    expect(events.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspaceId: "workspace-1",
          method: "turn/started",
        }),
        expect.objectContaining({
          workspaceId: "workspace-1",
          method: "turn/completed",
        }),
        expect.objectContaining({
          workspaceId: "workspace-1",
          method: "thread/started",
          params: { thread: { id: "thread-child-1", cwd: process.cwd() } },
        }),
      ]),
    );
    await runtime.stop();
    expect(runtime.status().state).toBe("stopped");
  });

  it("app-server 在活跃 turn 崩溃后释放 Browser 控制并允许重新启动", async () => {
    const fixturePath = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const browser = createBrowserBackend();
    const runtime = new AppServerRuntime({
      resolveExecutablePath: () => process.execPath,
      cwd: process.cwd(),
      clientVersion: "0.7.68",
      browserBackend: browser,
      launchArguments: [fixturePath],
      environment: { BLACKRAIN_FAKE_EXIT_AFTER_TURN_STARTED: "1" },
    });

    const thread = await runtime.startThread({ cwd: process.cwd() });
    const turn = await runtime.startTurn({
      threadId: thread.threadId,
      prompt: "触发 fixture 崩溃",
    });
    await vi.waitFor(() => expect(runtime.status().state).toBe("failed"));
    expect(browser.completeAgentTurn).toHaveBeenCalledWith(
      { threadId: thread.threadId, routeKey: "browser-sidebar" },
      turn.turnId,
    );
    await expect(
      runtime.startTurn({ threadId: thread.threadId, prompt: "旧 thread 不得复用" }),
    ).rejects.toThrow(/未由当前/);

    await expect(runtime.startThread({ cwd: process.cwd() })).resolves.toEqual({
      threadId: "thread-browser-1",
      thread: { id: "thread-browser-1" },
    });
    expect(runtime.status().state).toBe("ready");
    await runtime.stop();
  });
});

function createBrowserBackend(): BrowserAgentBackend {
  return {
    listTabsForAgent: vi.fn(() => []),
    createTabForAgent: vi.fn(async () => { throw new Error("not used"); }),
    navigateForAgent: vi.fn(async () => {
      throw new Error("not used");
    }),
    controlForAgent: vi.fn(() => {
      throw new Error("not used");
    }),
    snapshotForAgent: vi.fn(async () => {
      throw new Error("not used");
    }),
    clickForAgent: vi.fn(async () => {
      throw new Error("not used");
    }),
    typeTextForAgent: vi.fn(async () => {
      throw new Error("not used");
    }),
    screenshotForAgent: vi.fn(async () => {
      throw new Error("not used");
    }),
    completeAgentTurn: vi.fn(),
  };
}
