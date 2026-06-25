// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountAuthCard } from "./AccountAuthCard";

afterEach(() => {
  cleanup();
});

describe("AccountAuthCard", () => {
  it("默认登录模式，可切到注册", () => {
    render(
      <AccountAuthCard
        configured
        onSignIn={vi.fn()}
        onSignUp={vi.fn()}
      />,
    );
    expect(screen.getByText("登录 BlackRain")).toBeTruthy();
    fireEvent.click(screen.getByText("没有账号？去注册"));
    expect(screen.getByText("注册 BlackRain 账号")).toBeTruthy();
  });

  it("邮箱非法时不调用 onSignIn", async () => {
    const onSignIn = vi.fn().mockResolvedValue(undefined);
    render(
      <AccountAuthCard configured onSignIn={onSignIn} onSignUp={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "not-an-email" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() => {
      expect(screen.getByText("请输入有效邮箱。")).toBeTruthy();
    });
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it("合法输入时调用 onSignIn", async () => {
    const onSignIn = vi.fn().mockResolvedValue(undefined);
    render(
      <AccountAuthCard configured onSignIn={onSignIn} onSignUp={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() => {
      expect(onSignIn).toHaveBeenCalledWith("user@example.com", "secret123");
    });
  });

  it("后端未配置时禁用提交并提示", () => {
    render(
      <AccountAuthCard
        configured={false}
        onSignIn={vi.fn()}
        onSignUp={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/账号后端未配置：缺 VITE_SUPABASE_URL/),
    ).toBeTruthy();
    const submit = screen.getByRole("button", { name: "登录" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });
});
