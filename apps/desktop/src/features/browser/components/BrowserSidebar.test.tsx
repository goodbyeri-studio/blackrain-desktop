// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlackRainHostApi } from "../../../../electron/shared/host-api";
import type { BrowserTabState } from "../../../../electron/shared/browser-tabs";
import { BrowserSidebar } from "./BrowserSidebar";

const scope = { threadId: "thread-1", routeKey: "browser-sidebar" };
const blankTab: BrowserTabState = {
  ...scope,
  browserTabId: "tab-1",
  viewGeneration: 1,
  url: "about:blank",
  title: "",
  loading: false,
  canGoBack: false,
  canGoForward: false,
  crashed: false,
  error: null,
  controlOwner: "user",
  agentTurnId: null,
  permissionRequest: null,
  download: null,
  dialog: null,
  consoleMessages: [],
  debuggerStatus: "attached",
};

afterEach(() => {
  cleanup();
  delete window.blackrain;
});

describe("BrowserSidebar", () => {
  it("按当前 thread 创建、导航、刷新和关闭同一个宿主 tab", async () => {
    const createTab = vi.fn().mockResolvedValue(blankTab);
    const navigatedTab = {
      ...blankTab,
      url: "example.com",
      title: "Example",
    };
    const navigate = vi.fn().mockResolvedValue(navigatedTab);
    const control = vi.fn().mockResolvedValue(navigatedTab);
    const closeTab = vi.fn().mockResolvedValue({ closed: true, browserTabId: "tab-1" });
    const setLayout = vi.fn().mockResolvedValue({ accepted: true, layoutRevision: 1 });
    const host: BlackRainHostApi = {
      app: {
        getBootstrap: vi.fn().mockResolvedValue({
          version: "0.7.68",
          platform: "win32",
          windowGeneration: 1,
        }),
      },
    shell: {
      openExternal: vi.fn(),
      revealPath: vi.fn(),
    },
    dialog: {
      confirm: vi.fn(),
      message: vi.fn(),
    },
      settings: {
        get: vi.fn(),
        update: vi.fn(),
      },
      files: {
        pick: vi.fn(),
        saveText: vi.fn(),
        readImage: vi.fn(),
        listWorkspace: vi.fn(),
        readWorkspace: vi.fn(),
      },
      accountSession: {
        get: vi.fn(),
        set: vi.fn(),
        clear: vi.fn(),
      },
      workspace: {
        list: vi.fn(),
        add: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        connect: vi.fn(),
        isDirectory: vi.fn(),
        pick: vi.fn(),
      },
      agent: {
        getStatus: vi.fn().mockResolvedValue({ state: "idle" }),
        getEvents: vi.fn().mockResolvedValue({
          events: [],
          latestSequence: 0,
          resetRequired: false,
        }),
        onEvent: vi.fn().mockReturnValue(() => undefined),
        listThreads: vi.fn(),
        startThread: vi.fn(),
        resumeThread: vi.fn(),
        startTurn: vi.fn(),
        steerTurn: vi.fn(),
        interruptTurn: vi.fn(),
        respondToServerRequest: vi.fn(),
        listModels: vi.fn(),
        readConfig: vi.fn(),
        listCollaborationModes: vi.fn(),
        listSkills: vi.fn(),
        listApps: vi.fn(),
        readAccount: vi.fn(),
        readAccountRateLimits: vi.fn(),
        readThread: vi.fn(),
        archiveThread: vi.fn(),
        setThreadName: vi.fn(),
      },
      browser: {
        createTab,
        listTabs: vi.fn().mockResolvedValue([]),
        navigate,
        control,
        takeControl: vi.fn().mockResolvedValue(blankTab),
        respondPermission: vi.fn(),
        respondSensitiveAction: vi.fn(),
        resolveDownload: vi.fn(),
        respondDialog: vi.fn(),
        resolveFileChooser: vi.fn(),
        closeTab,
        setLayout,
        onTabsChanged: vi.fn().mockReturnValue(() => undefined),
      },
    };
    window.blackrain = host;

    render(<BrowserSidebar threadId="thread-1" />);

    expect(await screen.findByText("还没有打开网页")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "新建标签页" })[0]);
    const address = await screen.findByRole("textbox", { name: "浏览器地址" });
    fireEvent.change(address, { target: { value: "example.com" } });
    fireEvent.submit(address.closest("form") as HTMLFormElement);

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({
        ...scope,
        browserTabId: "tab-1",
        viewGeneration: 1,
        url: "example.com",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    await waitFor(() => expect(control).toHaveBeenCalledWith({
      ...scope,
      browserTabId: "tab-1",
      viewGeneration: 1,
      action: "reload",
    }));

    fireEvent.click(screen.getByRole("button", { name: "关闭 Example" }));
    await waitFor(() => expect(closeTab).toHaveBeenCalled());
    expect(createTab).toHaveBeenCalledWith(scope);
    expect(setLayout).toHaveBeenCalled();
  });

  it("展示 Agent 控制状态并允许用户主动接管同一 tab", async () => {
    const agentTab: BrowserTabState = {
      ...blankTab,
      url: "https://example.com/",
      title: "Example",
      controlOwner: "agent",
      agentTurnId: "turn-1",
      dialog: {
        requestId: "dialog-1",
        type: "confirm",
        message: "继续测试？",
        defaultPrompt: "",
        origin: "https://example.com",
      },
      sensitiveActionRequest: {
        requestId: "sensitive-1",
        category: "purchase",
        origin: "https://example.com",
        label: "Pay now",
        expiresAt: Date.now() + 25_000,
      },
    };
    const takeControl = vi.fn().mockResolvedValue({
      ...agentTab,
      controlOwner: "user",
      agentTurnId: null,
    });
    const respondDialog = vi.fn().mockResolvedValue({
      ...agentTab,
      dialog: null,
    });
    const respondSensitiveAction = vi.fn().mockResolvedValue({
      ...agentTab,
      sensitiveActionRequest: null,
    });
    window.blackrain = {
      app: {
        getBootstrap: vi.fn().mockResolvedValue({
          version: "0.7.68",
          platform: "win32",
          windowGeneration: 1,
        }),
      },
    shell: {
      openExternal: vi.fn(),
      revealPath: vi.fn(),
    },
    dialog: {
      confirm: vi.fn(),
      message: vi.fn(),
    },
      settings: {
        get: vi.fn(),
        update: vi.fn(),
      },
      files: {
        pick: vi.fn(),
        saveText: vi.fn(),
        readImage: vi.fn(),
        listWorkspace: vi.fn(),
        readWorkspace: vi.fn(),
      },
      accountSession: {
        get: vi.fn(),
        set: vi.fn(),
        clear: vi.fn(),
      },
      workspace: {
        list: vi.fn(),
        add: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        connect: vi.fn(),
        isDirectory: vi.fn(),
        pick: vi.fn(),
      },
      agent: {
        getStatus: vi.fn().mockResolvedValue({ state: "ready" }),
        getEvents: vi.fn().mockResolvedValue({
          events: [],
          latestSequence: 0,
          resetRequired: false,
        }),
        onEvent: vi.fn().mockReturnValue(() => undefined),
        listThreads: vi.fn(),
        startThread: vi.fn(),
        resumeThread: vi.fn(),
        startTurn: vi.fn(),
        steerTurn: vi.fn(),
        interruptTurn: vi.fn(),
        respondToServerRequest: vi.fn(),
        listModels: vi.fn(),
        readConfig: vi.fn(),
        listCollaborationModes: vi.fn(),
        listSkills: vi.fn(),
        listApps: vi.fn(),
        readAccount: vi.fn(),
        readAccountRateLimits: vi.fn(),
        readThread: vi.fn(),
        archiveThread: vi.fn(),
        setThreadName: vi.fn(),
      },
      browser: {
        createTab: vi.fn(),
        listTabs: vi.fn().mockResolvedValue([agentTab]),
        navigate: vi.fn(),
        control: vi.fn(),
        takeControl,
        respondPermission: vi.fn(),
        respondSensitiveAction,
        resolveDownload: vi.fn(),
        respondDialog,
        resolveFileChooser: vi.fn(),
        closeTab: vi.fn(),
        setLayout: vi.fn().mockResolvedValue({
          accepted: true,
          layoutRevision: 1,
        }),
        onTabsChanged: vi.fn().mockReturnValue(() => undefined),
      },
    };

    render(<BrowserSidebar threadId="thread-1" />);

    expect(await screen.findByText("继续测试？")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "继续" }));
    await waitFor(() =>
      expect(respondDialog).toHaveBeenCalledWith({
        ...scope,
        browserTabId: "tab-1",
        viewGeneration: 1,
        requestId: "dialog-1",
        accept: true,
      }),
    );

    expect(screen.getByText(/Agent 请求购买或支付/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认一次" }));
    await waitFor(() =>
      expect(respondSensitiveAction).toHaveBeenCalledWith({
        ...scope,
        browserTabId: "tab-1",
        viewGeneration: 1,
        requestId: "sensitive-1",
        allow: true,
      }),
    );

    const takeover = await screen.findByRole("button", {
      name: "接管浏览器",
    });
    fireEvent.click(takeover);
    await waitFor(() =>
      expect(takeControl).toHaveBeenCalledWith({
        ...scope,
        browserTabId: "tab-1",
        viewGeneration: 1,
      }),
    );
    expect(await screen.findByLabelText("用户控制浏览器")).toBeTruthy();
  });
});
