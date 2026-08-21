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
  name: "blackrain-project",
  path: "/tmp/blackrain-project",
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
  onAddWorkspaceFromUrl: vi.fn(),
  // 仪表盘旧 props(首页不再渲染,仅维持类型兼容)
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

describe("Home (codex 1:1 replica)", () => {
  it("renders greeting, prompt card and the three menu triggers", () => {
    render(<Home {...baseProps} />);

    expect(screen.getByText("What should we do?")).toBeTruthy();
    expect(screen.getByPlaceholderText("Type anything")).toBeTruthy();
    expect(screen.getByLabelText("Agent access")).toBeTruthy();
    expect(screen.getByLabelText("Model")).toBeTruthy();
    expect(screen.getByLabelText("Enter project work")).toBeTruthy();
  });

  it("shows the full-access pill label and opens the rich access menu", () => {
    render(<Home {...baseProps} />);
    const trigger = screen.getByLabelText("Agent access");
    expect(trigger.textContent).toContain("Full access");
    fireEvent.click(trigger);
    expect(screen.getByText("How should Codex approvals work?")).toBeTruthy();
    expect(
      screen.getByText("Unrestricted access to the internet and any file on your computer"),
    ).toBeTruthy();
  });

  it("switches access mode from the rich menu", () => {
    const onSelectAccessMode = vi.fn();
    render(<Home {...baseProps} onSelectAccessMode={onSelectAccessMode} />);
    fireEvent.click(screen.getByLabelText("Agent access"));
    fireEvent.click(screen.getByText("Read only"));
    expect(onSelectAccessMode).toHaveBeenCalledWith("read-only");
  });

  it("opens the model menu and selects a model", () => {
    const onSelectModel = vi.fn();
    render(<Home {...baseProps} onSelectModel={onSelectModel} />);
    fireEvent.click(screen.getByLabelText("Model"));
    fireEvent.click(
      screen.getByRole("menuitemradio", { name: /deepseek-v4-flash/ }),
    );
    expect(onSelectModel).toHaveBeenCalledWith("deepseek-v4-flash");
  });

  it("opens reasoning efforts first, then the model submenu", () => {
    const onSelectEffort = vi.fn();
    render(
      <Home
        {...baseProps}
        models={[
          {
            ...model,
            supportedReasoningEfforts: [
              { reasoningEffort: "high", description: "" },
              { reasoningEffort: "max", description: "" },
            ],
            defaultReasoningEffort: "high",
          },
          {
            ...model,
            id: "deepseek-v4-pro",
            model: "deepseek-v4-pro",
            displayName: "DeepSeek V4 Pro",
          },
        ]}
        reasoningOptions={["high", "max"]}
        selectedEffort="high"
        reasoningSupported
        onSelectEffort={onSelectEffort}
      />,
    );

    fireEvent.click(screen.getByLabelText("Model"));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "max" }));
    expect(onSelectEffort).toHaveBeenCalledWith("max");

    const modelRowButton = screen.getByText("deepseek-v4-flash").closest("button");
    expect(modelRowButton).toBeTruthy();
    fireEvent.mouseEnter(modelRowButton!);
    expect(screen.getByRole("menuitemradio", { name: /deepseek-v4-pro/ })).toBeTruthy();
  });

  it("enters the workspace with the typed draft on send", () => {
    const onEnterWorkspaceFromHome = vi.fn();
    render(
      <Home {...baseProps} onEnterWorkspaceFromHome={onEnterWorkspaceFromHome} />,
    );
    const textarea = screen.getByPlaceholderText("Type anything");
    fireEvent.change(textarea, { target: { value: "做一个网站" } });
    fireEvent.click(screen.getByLabelText("Send"));
    expect(onEnterWorkspaceFromHome).toHaveBeenCalledWith("workspace-1", "做一个网站");
  });

  it("sends on Enter (without shift)", () => {
    const onEnterWorkspaceFromHome = vi.fn();
    render(
      <Home {...baseProps} onEnterWorkspaceFromHome={onEnterWorkspaceFromHome} />,
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

  it("lists projects, searches, and enters one from the project menu", () => {
    const onEnterWorkspaceFromHome = vi.fn();
    const second: WorkspaceInfo = { ...workspace, id: "workspace-2", name: "office-Agent" };
    render(
      <Home
        {...baseProps}
        workspaces={[workspace, second]}
        onEnterWorkspaceFromHome={onEnterWorkspaceFromHome}
      />,
    );
    fireEvent.click(screen.getByLabelText("Enter project work"));
    expect(screen.getByPlaceholderText("Search projects")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Search projects"), {
      target: { value: "office" },
    });
    expect(screen.queryByText("blackrain-project")).toBeNull();
    fireEvent.click(screen.getByText("office-Agent"));
    expect(onEnterWorkspaceFromHome).toHaveBeenCalledWith("workspace-2", "");
  });

  it("exposes add-new-project submenu actions", () => {
    const onAddWorkspace = vi.fn();
    render(<Home {...baseProps} onAddWorkspace={onAddWorkspace} />);
    fireEvent.click(screen.getByLabelText("Enter project work"));
    fireEvent.click(screen.getByText("Add new project"));
    fireEvent.click(screen.getByText("Use existing folder"));
    expect(onAddWorkspace).toHaveBeenCalled();
  });
});
