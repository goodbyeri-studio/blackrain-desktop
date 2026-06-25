import { AccountAuthCard } from "./AccountAuthCard";
import { useAccount } from "../context/AccountProvider";

// 002-accounts-credits：登录开屏。未登录时全屏展示，复用 AccountAuthCard。
// 不传 onClose → 不可关闭，强制先登录（门禁场景）。
export function LoginScreen() {
  const account = useAccount();
  return (
    <div className="account-login-screen">
      <div className="account-login-brand">
        <h1 className="account-login-title">BlackRain</h1>
        <p className="account-login-subtitle">新一代 working Agent，氛围十足</p>
      </div>
      <AccountAuthCard
        configured={account.status !== "unconfigured"}
        onSignIn={account.signIn}
        onSignUp={account.signUp}
      />
    </div>
  );
}
