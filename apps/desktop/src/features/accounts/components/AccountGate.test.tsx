// @vitest-environment jsdom
// AccountGate 门禁专项：验证登录开屏的四种状态分支。
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let mockState: {
  status: string;
  online: boolean;
};

vi.mock("../context/AccountProvider", () => ({
  useAccount: () => ({
    ...mockState,
    session: null,
    profile: null,
    error: null,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));

import { AccountGate } from "./AccountGate";

afterEach(() => {
  cleanup();
});

function renderGate() {
  return render(
    <AccountGate>
      <div data-testid="app-content">进入 App</div>
    </AccountGate>,
  );
}

describe("AccountGate 登录门禁", () => {
  it("signed-out → 显示登录开屏，不渲染 App", () => {
    mockState = { status: "signed-out", online: false };
    renderGate();
    expect(screen.getByText("BlackRain")).toBeTruthy();
    expect(screen.queryByTestId("app-content")).toBeNull();
  });

  it("loading → 显示恢复会话占位，不渲染 App", () => {
    mockState = { status: "loading", online: false };
    renderGate();
    expect(screen.getByText("正在恢复会话…")).toBeTruthy();
    expect(screen.queryByTestId("app-content")).toBeNull();
  });

  it("signed-in → 放进 App", () => {
    mockState = { status: "signed-in", online: true };
    renderGate();
    expect(screen.getByTestId("app-content")).toBeTruthy();
  });

  it("unconfigured（无后端）→ 放进 App（保本地可用）", () => {
    mockState = { status: "unconfigured", online: false };
    renderGate();
    expect(screen.getByTestId("app-content")).toBeTruthy();
  });
});
