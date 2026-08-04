import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { BrowserAgentBackend } from "../browser/browser-dynamic-tool-adapter";
import { AppServerRuntime } from "./app-server-runtime";

describe("AppServerRuntime", () => {
  it("拒绝不完整 Browser MCP 配置和双路由配置", () => {
    const baseOptions = {
      resolveExecutablePath: () => process.execPath,
      cwd: process.cwd(),
      clientVersion: "0.7.68",
      browserBackend: createBrowserBackend(),
    };
    expect(
      () =>
        new AppServerRuntime({
          ...baseOptions,
          resolveBrowserClientPath: () => "browser-client.mjs",
        }),
    ).toThrow(/MCP 配置不完整/);
    expect(
      () =>
        new AppServerRuntime({
          ...baseOptions,
          resolveBrowserClientPath: () => "browser-client.mjs",
          resolveBrowserMcpAdapterPath: () => "browser-mcp-server.mjs",
          resolveBrowserMcpNodePath: () => "node.exe",
          enableBrowserDynamicToolsBootstrap: true,
        }),
    ).toThrow(/不能同时启用/);
  });

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
    let resolveDynamicTools!: (value: unknown) => void;
    const dynamicTools = new Promise<unknown>((resolve) => {
      resolveDynamicTools = resolve;
    });
    let resolveReviewParams!: (value: unknown) => void;
    const reviewParams = new Promise<unknown>((resolve) => {
      resolveReviewParams = resolve;
    });
    let resolveFeatureListParams!: (value: unknown) => void;
    const featureListParams = new Promise<unknown>((resolve) => {
      resolveFeatureListParams = resolve;
    });
    let resolveFeatureSetParams!: (value: unknown) => void;
    const featureSetParams = new Promise<unknown>((resolve) => {
      resolveFeatureSetParams = resolve;
    });
    let resolveRollbackParams!: (value: unknown) => void;
    const rollbackParams = new Promise<unknown>((resolve) => {
      resolveRollbackParams = resolve;
    });
    const runtime = new AppServerRuntime({
      resolveExecutablePath: () => process.execPath,
      cwd: process.cwd(),
      clientVersion: "0.7.68",
      browserBackend: browser,
      resolveBrowserClientPath: () =>
        fileURLToPath(
          new URL("../../../resources/browser-client/browser-client.mjs", import.meta.url),
        ),
      enableBrowserDynamicToolsBootstrap: true,
      launchArguments: [fixturePath],
      onNotification: (method, params) => {
        if (method === "test/browser-tool-result") resolveToolResult(params);
        if (method === "turn/completed") resolveTurnCompleted();
        if (method === "test/turn-start-params") resolveTurnParams(params);
        if (method === "test/turn-steer-params") resolveSteerParams(params);
        if (method === "test/thread-list-params") resolveListParams(params);
        if (method === "test/dynamic-tools") resolveDynamicTools(params);
        if (method === "test/review-start-params") resolveReviewParams(params);
        if (method === "test/experimental-feature-list-params") resolveFeatureListParams(params);
        if (method === "test/experimental-feature-set-params") resolveFeatureSetParams(params);
        if (method === "test/thread-rollback-params") resolveRollbackParams(params);
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
    await expect(dynamicTools).resolves.toMatchObject({
      dynamicTools: expect.arrayContaining([
        expect.objectContaining({
          name: "blackrain_browser",
          tools: expect.arrayContaining([
            expect.objectContaining({ name: "list_tabs" }),
          ]),
        }),
      ]),
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
    await expect(runtime.startReview({
      workspaceId: "workspace-1",
      threadId: "thread-browser-1",
      target: { type: "uncommittedChanges" },
      delivery: "inline",
    })).resolves.toEqual({
      turn: { id: "turn-review-1" },
      reviewThreadId: "thread-browser-1",
    });
    await expect(reviewParams).resolves.toEqual({
      threadId: "thread-browser-1",
      target: { type: "uncommittedChanges" },
      delivery: "inline",
    });
    await expect(runtime.listExperimentalFeatures({
      workspaceId: "workspace-1",
      cursor: "feature-page",
      limit: 20,
    })).resolves.toEqual({ data: [], nextCursor: null });
    await expect(featureListParams).resolves.toEqual({
      cursor: "feature-page",
      limit: 20,
      threadId: null,
    });
    await expect(runtime.setExperimentalFeature({
      workspaceId: "workspace-1",
      featureKey: "test_feature",
      enabled: true,
    })).resolves.toEqual({ enablement: { test_feature: true } });
    await expect(featureSetParams).resolves.toEqual({
      enablement: { test_feature: true },
    });
    await expect(runtime.forkThread({
      workspaceId: "workspace-1",
      threadId: "thread-browser-1",
    })).resolves.toEqual({
      threadId: "thread-fork-1",
      thread: { id: "thread-fork-1" },
    });
    await expect(runtime.compactThread({
      workspaceId: "workspace-1",
      threadId: "thread-browser-1",
    })).resolves.toEqual({});
    await expect(runtime.rollbackThread({
      workspaceId: "workspace-1",
      threadId: "thread-browser-1",
      turnId: "turn-target",
    })).resolves.toEqual({
      thread: { id: "thread-browser-1", turns: [{ id: "turn-old" }] },
    });
    await expect(rollbackParams).resolves.toEqual({
      threadId: "thread-browser-1",
      numTurns: 2,
    });
    await expect(runtime.listMcpServerStatus({
      workspaceId: "workspace-1",
      threadId: "thread-browser-1",
    })).resolves.toEqual({ data: [], nextCursor: null });
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
          method: "item/started",
          params: expect.objectContaining({
            threadId: "thread-browser-1",
            item: expect.objectContaining({ id: "item-browser-1" }),
          }),
        }),
        expect.objectContaining({
          workspaceId: "workspace-1",
          method: "item/agentMessage/delta",
          params: expect.objectContaining({
            itemId: "item-browser-1",
            delta: "fixture delta",
          }),
        }),
        expect.objectContaining({
          workspaceId: "workspace-1",
          method: "item/completed",
          params: expect.objectContaining({
            item: expect.objectContaining({ id: "item-browser-1" }),
          }),
        }),
        expect.objectContaining({
          workspaceId: "workspace-1",
          method: "thread/started",
          params: { thread: { id: "thread-child-1", cwd: process.cwd() } },
        }),
      ]),
    );
    await expect(
      runtime.unsubscribeThread({ threadId: "thread-browser-1" }),
    ).resolves.toEqual({
      threadId: "thread-browser-1",
      status: "unsubscribed",
    });
    await runtime.stop();
    expect(runtime.status().state).toBe("stopped");
  });

  it("app-server 在活跃 turn 崩溃后释放 Browser 控制并允许重新启动", async () => {
    const fixturePath = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const browser = createBrowserBackend();
    let resolveDynamicTools!: (value: unknown) => void;
    const dynamicTools = new Promise<unknown>((resolve) => {
      resolveDynamicTools = resolve;
    });
    const runtime = new AppServerRuntime({
      resolveExecutablePath: () => process.execPath,
      cwd: process.cwd(),
      clientVersion: "0.7.68",
      browserBackend: browser,
      launchArguments: [fixturePath],
      environment: { BLACKRAIN_FAKE_EXIT_AFTER_TURN_STARTED: "1" },
      onNotification: (method, params) => {
        if (method === "test/dynamic-tools") resolveDynamicTools(params);
      },
    });

    const thread = await runtime.startThread({ cwd: process.cwd() });
    await expect(dynamicTools).resolves.toEqual({});
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

  it("将审批 server request 绑定 workspace 转发并只接受一次响应", async () => {
    const fixturePath = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    let resolveApprovalResult!: (value: unknown) => void;
    const approvalResult = new Promise<unknown>((resolve) => {
      resolveApprovalResult = resolve;
    });
    const runtime = new AppServerRuntime({
      resolveExecutablePath: () => process.execPath,
      cwd: process.cwd(),
      clientVersion: "0.7.68",
      browserBackend: createBrowserBackend(),
      launchArguments: [fixturePath],
      environment: { BLACKRAIN_FAKE_APPROVAL_AFTER_TURN_START: "1" },
      onNotification: (method, params) => {
        if (method === "test/approval-result") resolveApprovalResult(params);
      },
    });

    const approvalEvent = new Promise<ReturnType<typeof runtime.getEvents>["events"][number]>(
      (resolve) => {
        const unsubscribe = runtime.subscribeEvents((event) => {
          if (event.method !== "item/commandExecution/requestApproval") return;
          unsubscribe();
          resolve(event);
        });
      },
    );
    const thread = await runtime.startThread({
      cwd: process.cwd(),
      workspaceId: "workspace-approval",
    });
    await runtime.startTurn({
      threadId: thread.threadId,
      prompt: "触发审批",
    });
    await expect(approvalEvent).resolves.toMatchObject({
      workspaceId: "workspace-approval",
      requestId: "approval-after-turn-start",
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: thread.threadId,
        turnId: "turn-browser-1",
        command: "git status",
      },
    });
    expect(() => runtime.respondToServerRequest({
      workspaceId: "workspace-other",
      requestId: "approval-after-turn-start",
      result: { decision: "accept" },
    })).toThrow(/workspace/);
    expect(runtime.respondToServerRequest({
      workspaceId: "workspace-approval",
      requestId: "approval-after-turn-start",
      result: { decision: "accept" },
    })).toEqual({ ok: true });
    await expect(approvalResult).resolves.toEqual({ decision: "accept" });
    expect(() => runtime.respondToServerRequest({
      workspaceId: "workspace-approval",
      requestId: "approval-after-turn-start",
      result: { decision: "decline" },
    })).toThrow(/失效/);
    await runtime.stop();
  });

  it("通过同一 app-server 管理账户登录、取消和退出", async () => {
    const fixturePath = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    let resolveCancelParams!: (value: unknown) => void;
    const cancelParams = new Promise<unknown>((resolve) => {
      resolveCancelParams = resolve;
    });
    const runtime = new AppServerRuntime({
      resolveExecutablePath: () => process.execPath,
      cwd: process.cwd(),
      clientVersion: "0.7.68",
      browserBackend: createBrowserBackend(),
      launchArguments: [fixturePath],
      onNotification: (method, params) => {
        if (method === "test/account-login-cancel-params") resolveCancelParams(params);
      },
    });

    await expect(runtime.cancelAccountLogin({ workspaceId: "workspace-login" }))
      .resolves.toEqual({ canceled: false });
    await expect(runtime.startAccountLogin({ workspaceId: "workspace-login" }))
      .resolves.toEqual({
        loginId: "login-test-1",
        authUrl: "https://auth.example.test/login",
      });
    await expect(runtime.cancelAccountLogin({ workspaceId: "workspace-login" }))
      .resolves.toEqual({ canceled: true, status: "canceled" });
    await expect(cancelParams).resolves.toEqual({ loginId: "login-test-1" });
    await expect(runtime.logoutAccount({ workspaceId: "workspace-login" }))
      .resolves.toEqual({ ok: true });
    await runtime.stop();
  });

  it("恢复 thread、取消审批 request，并在 interrupt 后释放 Browser 控制", async () => {
    const fixturePath = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const browser = createBrowserBackend();
    const notifications = new Map<string, (value: unknown) => void>();
    const waitForNotification = (method: string) =>
      new Promise<unknown>((resolve) => notifications.set(method, resolve));
    const resumeParams = waitForNotification("test/thread-resume-params");
    const interruptParams = waitForNotification("test/turn-interrupt-params");
    const cancelledApproval = waitForNotification("test/approval-result");
    const runtime = new AppServerRuntime({
      resolveExecutablePath: () => process.execPath,
      cwd: process.cwd(),
      clientVersion: "0.7.68",
      browserBackend: browser,
      launchArguments: [fixturePath],
      environment: {
        BLACKRAIN_FAKE_CANCEL_APPROVAL_AFTER_TURN_START: "1",
        BLACKRAIN_FAKE_HOLD_TURN_OPEN: "1",
      },
      onNotification: (method, params) => notifications.get(method)?.(params),
    });

    const thread = await runtime.resumeThread({
      threadId: "thread-resumed-1",
      cwd: process.cwd(),
      workspaceId: "workspace-resume",
    });
    expect(thread).toEqual({
      threadId: "thread-resumed-1",
      thread: { id: "thread-resumed-1", cwd: process.cwd() },
    });
    await expect(resumeParams).resolves.toEqual({
      threadId: "thread-resumed-1",
      cwd: process.cwd(),
      runtimeWorkspaceRoots: [process.cwd()],
    });

    const approvalEvent = new Promise<
      ReturnType<typeof runtime.getEvents>["events"][number]
    >((resolve) => {
      const unsubscribe = runtime.subscribeEvents((event) => {
        if (event.method !== "item/commandExecution/requestApproval") return;
        unsubscribe();
        resolve(event);
      });
    });
    const turn = await runtime.startTurn({
      threadId: thread.threadId,
      prompt: "保持活跃并等待取消",
    });
    await expect(approvalEvent).resolves.toMatchObject({
      workspaceId: "workspace-resume",
      requestId: "approval-after-turn-start",
      params: {
        threadId: "thread-resumed-1",
        turnId: turn.turnId,
      },
    });
    await expect(cancelledApproval).resolves.toEqual({
      code: -32603,
      message: "处理 App Server request 失败",
    });
    expect(() =>
      runtime.respondToServerRequest({
        workspaceId: "workspace-resume",
        requestId: "approval-after-turn-start",
        result: { decision: "accept" },
      }),
    ).toThrow(/失效/);

    await expect(
      runtime.interruptTurn({
        threadId: thread.threadId,
        turnId: turn.turnId,
      }),
    ).resolves.toEqual({
      threadId: thread.threadId,
      turnId: turn.turnId,
    });
    await expect(interruptParams).resolves.toEqual({
      threadId: thread.threadId,
      turnId: turn.turnId,
    });
    await vi.waitFor(() =>
      expect(browser.completeAgentTurn).toHaveBeenCalledWith(
        { threadId: thread.threadId, routeKey: "browser-sidebar" },
        turn.turnId,
      ),
    );
    await runtime.stop();
  });

  it("睡眠前停止 App Server 与 Browser transport，唤醒后恢复此前运行的 runtime", async () => {
    const fixturePath = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const runtime = new AppServerRuntime({
      resolveExecutablePath: () => process.execPath,
      cwd: process.cwd(),
      clientVersion: "0.7.68",
      browserBackend: createBrowserBackend(),
      launchArguments: [fixturePath],
    });

    const thread = await runtime.startThread({
      cwd: process.cwd(),
      workspaceId: "workspace-power",
    });
    expect(runtime.status()).toEqual({ state: "ready" });

    await runtime.prepareForSystemSuspend();
    expect(runtime.status()).toEqual({ state: "stopped" });

    await runtime.resumeFromSystemSleep();
    expect(runtime.status()).toEqual({ state: "ready" });
    await expect(runtime.startTurn({
      threadId: thread.threadId,
      prompt: "唤醒后继续原 thread",
    })).resolves.toEqual({
      threadId: thread.threadId,
      turnId: "turn-browser-1",
    });
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
