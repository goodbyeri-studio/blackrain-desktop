import { AccountAuthCard } from "./AccountAuthCard";
import { RainBackground } from "./RainBackground";
import { useAccount } from "../context/AccountProvider";

// 登录开屏：未登录时全屏展示，复用 AccountAuthCard。
// 不传 onClose → 不可关闭，强制先登录（门禁场景）。
// 美术：BlackRain 霓虹雨夜——品红与冰蓝紫，靛紫雾，下雨，半透明毛玻璃透出桌面。
export function LoginScreen() {
  const account = useAccount();
  return (
    <div className="account-login-screen">
      {/* 仅顶部一条拖动条生效（对齐 macOS Overlay 标题栏），其余区域不可拖 */}
      <div className="account-login-dragbar" data-electron-drag-region />
      <RainBackground />
      <div className="account-login-glow" aria-hidden="true" />
      <div className="account-login-inner">
        <div className="account-login-brand">
          <h1 className="account-login-title">BlackRain</h1>
          <p className="account-login-subtitle">新一代 working Agent，氛围十足</p>
        </div>
        <AccountAuthCard
          configured={account.status !== "unconfigured"}
          onSignIn={account.signIn}
          onSignUp={account.signUp}
          onVerifyOtp={account.verifySignupOtp}
          onResendOtp={account.resendSignupOtp}
        />
      </div>
    </div>
  );
}
