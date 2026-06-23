// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Home } from "./Home";
import type { ModelOption, WorkspaceInfo } from "../../../types";

afterEach(() => {
  cleanup();
});

const model: ModelOption = {
  id: "deepseek-v4-flash",
  model: "deepseek-v4-flash",
  displayName: "DeepSeek V4 Flash",
  description: "",
  supportedReasoningEfforts: [],
  defaultReasoningEffort: null,
  isDefault: true,
};

const workspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "2049-agent",
  path: "/tmp/2049-agent",
  connected: true,
  settings: {} as WorkspaceInfo["settings"],
};

const baseProps = {
  workspaces: [workspace],
  onEnterWorkspaceFromHome: vi.fn(),
  models: [model],
  selectedModelId: model.id,
  onSelectModel: vi.fn(),
  accessMode: "full-access" as const,
  onSelectAccessMode: vi.fn(),
  reasoningOptions: [],
  selectedEffort: null,
  onSelectEffort: vi.fn(),
  reasoningSupported: false,
  onAddWorkspace: vi.fn(),
  // 仪表盘旧 props(首页不再渲染,仅维持类型兼容)
  onAddWorkspaceFromUrl: vi.fn(),
  latestAgentRuns: [],
  isLoadingLatestAgents: false,
  localUsageSnapshot: null,
  isLoadingLocalUsage: false,
  localUsageError: null,
  onRefreshLocalUsage: vi.fn(),
  usageMetric: "tokens" as const,
  onUsageMetricChange: vi.fn(),
  usageWorkspaceId: null,
  usageWorkspaceOptions: [],
  onUsageWorkspaceChange: vi.fn(),
  accountRateLimits: null,
  usageShowRemaining: false,
  accountInfo: null,
  onSelectThread: vi.fn(),
};

describe("Home (codex replica)", () => {
  it("renders the centered greeting, prompt card and project picker", () => {
    render(<Home {...baseProps} />);

    expect(screen.getByText("What should we do?")).toBeTruthy();
    expect(screen.getByPlaceholderText("Type anything")).toBeTruthy();
    expect(screen.getByLabelText("Enter project work")).toBeTruthy();
    expect(screen.getByLabelText("Model")).toBeTruthy();
    expect(screen.getByLabelText("Agent access")).toBeTruthy();
  });

  it("enters the selected workspace with the typed draft on send", () => {
    const onEnterWorkspaceFromHome = vi.fn();
    render(
      <Home
        {...baseProps}
        onEnterWorkspaceFromHome={onEnterWorkspaceFromHome}
      />,
    );

    const textarea = screen.getByPlaceholderText("Type anything");
    fireEvent.change(textarea, { target: { value: "做一个网站" } });
    fireEvent.click(screen.getByLabelText("Send"));

    expect(onEnterWorkspaceFromHome).toHaveBeenCalledWith("workspace-1", "做一个网站");
  });

  it("sends on Enter (without shift)", () => {
    const onEnterWorkspaceFromHome = vi.fn();
    render(
      <Home
        {...baseProps}
        onEnterWorkspaceFromHome={onEnterWorkspaceFromHome}
      />,
    );

    const textarea = screen.getByPlaceholderText("Type anything");
    fireEvent.change(textarea, { target: { value: "hi" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(onEnterWorkspaceFromHome).toHaveBeenCalledWith("workspace-1", "hi");
  });

  it("keeps send disabled when the draft is empty", () => {
    render(<Home {...baseProps} />);
    const send = screen.getByLabelText("Send") as HTMLButtonElement;
    expect(send.disabled).toBe(true);
  });

  it("falls back to an add-project button when there are no workspaces", () => {
    const onAddWorkspace = vi.fn();
    render(
      <Home {...baseProps} workspaces={[]} onAddWorkspace={onAddWorkspace} />,
    );

    const addButton = screen.getByText("Enter project work");
    fireEvent.click(addButton);
    expect(onAddWorkspace).toHaveBeenCalled();
  });
});
