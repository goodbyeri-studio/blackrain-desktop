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
      agent: {
        getStatus: vi.fn().mockResolvedValue({ state: "idle" }),
        startThread: vi.fn(),
        resumeThread: vi.fn(),
        startTurn: vi.fn(),
        interruptTurn: vi.fn(),
      },
      browser: {
        createTab,
        listTabs: vi.fn().mockResolvedValue([]),
        navigate,
        control,
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
});
