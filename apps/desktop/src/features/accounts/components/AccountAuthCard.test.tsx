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
    expect(screen.getByRole("button", { name: "登录" })).toBeTruthy();
    fireEvent.click(screen.getByText("没有账号？去注册"));
    expect(screen.getByRole("button", { name: "注册" })).toBeTruthy();
    expect(screen.getByText("已有账号？去登录")).toBeTruthy();
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

  it("密码显隐切换", () => {
    render(
      <AccountAuthCard configured onSignIn={vi.fn()} onSignUp={vi.fn()} />,
    );
    const pwd = screen.getByLabelText("密码") as HTMLInputElement;
    expect(pwd.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "显示密码" }));
    expect(pwd.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "隐藏密码" }));
    expect(pwd.type).toBe("password");
  });

  it("注册：两次密码不一致时不调用 onSignUp", async () => {
    const onSignUp = vi.fn().mockResolvedValue(undefined);
    render(
      <AccountAuthCard configured onSignIn={vi.fn()} onSignUp={onSignUp} />,
    );
    fireEvent.click(screen.getByText("没有账号？去注册"));
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "secret123" },
    });
    fireEvent.change(screen.getByLabelText("确认密码"), {
      target: { value: "secret999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "注册" }));
    await waitFor(() => {
      expect(screen.getByText("两次输入的密码不一致。")).toBeTruthy();
    });
    expect(onSignUp).not.toHaveBeenCalled();
  });

  it("注册：两次密码一致时调用 onSignUp", async () => {
    const onSignUp = vi.fn().mockResolvedValue(undefined);
    render(
      <AccountAuthCard configured onSignIn={vi.fn()} onSignUp={onSignUp} />,
    );
    fireEvent.click(screen.getByText("没有账号？去注册"));
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "secret123" },
    });
    fireEvent.change(screen.getByLabelText("确认密码"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "注册" }));
    await waitFor(() => {
      expect(onSignUp).toHaveBeenCalledWith("user@example.com", "secret123");
    });
  });

  it("登录模式不显示确认密码字段", () => {
    render(
      <AccountAuthCard configured onSignIn={vi.fn()} onSignUp={vi.fn()} />,
    );
    expect(screen.queryByLabelText("确认密码")).toBeNull();
  });

  it("注册成功后进入验证码步骤（传了 onVerifyOtp）", async () => {
    const onSignUp = vi.fn().mockResolvedValue(undefined);
    const onVerifyOtp = vi.fn().mockResolvedValue(undefined);
    render(
      <AccountAuthCard
        configured
        onSignIn={vi.fn()}
        onSignUp={onSignUp}
        onVerifyOtp={onVerifyOtp}
      />,
    );
    fireEvent.click(screen.getByText("没有账号？去注册"));
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "secret123" },
    });
    fireEvent.change(screen.getByLabelText("确认密码"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "注册" }));
    // 进验证码步骤：出现验证码字段，密码字段消失
    await waitFor(() => {
      expect(screen.getByLabelText("验证码")).toBeTruthy();
    });
    expect(screen.queryByLabelText("密码")).toBeNull();
  });

  it("验证码足 6 位时调用 onVerifyOtp", async () => {
    const onVerifyOtp = vi.fn().mockResolvedValue(undefined);
    render(
      <AccountAuthCard
        configured
        onSignIn={vi.fn()}
        onSignUp={vi.fn().mockResolvedValue(undefined)}
        onVerifyOtp={onVerifyOtp}
      />,
    );
    fireEvent.click(screen.getByText("没有账号？去注册"));
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "secret123" },
    });
    fireEvent.change(screen.getByLabelText("确认密码"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "注册" }));
    await waitFor(() => screen.getByLabelText("验证码"));
    fireEvent.change(screen.getByLabelText("验证码"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "验证并登录" }));
    await waitFor(() => {
      expect(onVerifyOtp).toHaveBeenCalledWith("user@example.com", "123456");
    });
  });
});
