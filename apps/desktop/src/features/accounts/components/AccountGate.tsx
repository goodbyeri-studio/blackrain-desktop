import type { ReactNode } from "react";
import { useAccount } from "../context/AccountProvider";
import { LoginScreen } from "./LoginScreen";

// 登录门禁：决定是否允许用户进入 App。
// - unconfigured（无 Supabase env，dev/本地）→ 直接进，不拦（保本地可用）。
// - loading（恢复会话中）→ 开屏占位。
// - signed-out（无缓存会话 / 显式登出）→ 登录页。
// - signed-in（含离线缓存会话，profile 可能为空）→ 进 App。
//   会话优先 + 离线只放 BYOK/本地：缓存会话恢复即 signed-in，后端连不上也放进，
//   credit 功能由各处按 online 降级。见 decisions。
export function AccountGate({ children }: { children: ReactNode }) {
  const account = useAccount();

  if (account.status === "loading") {
    return (
      <div className="account-gate-splash">
        <div className="account-gate-spinner" aria-hidden />
        <p className="account-gate-hint">正在恢复会话…</p>
      </div>
    );
  }

  if (account.status === "signed-out") {
    return <LoginScreen />;
  }

  // signed-in / unconfigured → 进 App。
  return <>{children}</>;
}
