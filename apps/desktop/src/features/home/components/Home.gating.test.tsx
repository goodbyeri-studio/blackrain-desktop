// @vitest-environment jsdom
// 门禁专项：mock useAccount 为 signed-out，验证未登录时发送被拦截、弹登录卡片。
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const signIn = vi.fn();
const signUp = vi.fn();

vi.mock("@/features/accounts/hooks/useAccount", () => ({
  useAccount: () => ({
    status: "signed-out",
    session: null,
    profile: null,
    error: null,
    signIn,
    signUp,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));

import { Home } from "./Home";
import type { ModelOption, WorkspaceInfo } from "../../../types";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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

function makeProps(onEnter: () => void) {
  return {
    workspaces: [workspace],
    onEnterWorkspaceFromHome: onEnter,
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
}

describe("Home 未登录门禁", () => {
  it("signed-out 时点发送：不进工作区，弹登录卡片", () => {
    const onEnter = vi.fn();
    render(<Home {...makeProps(onEnter)} />);
    fireEvent.change(screen.getByPlaceholderText("Type anything"), {
      target: { value: "做一个网站" },
    });
    fireEvent.click(screen.getByLabelText("Send"));
    expect(onEnter).not.toHaveBeenCalled();
    expect(screen.getByText("登录 BlackRain")).toBeTruthy();
  });

  it("signed-out 时顶部显示登录入口", () => {
    render(<Home {...makeProps(vi.fn())} />);
    // 顶部徽标位 + 卡片触发后均有登录入口；这里验证顶部入口存在。
    expect(screen.getAllByText("登录 / 注册").length).toBeGreaterThan(0);
  });
});
