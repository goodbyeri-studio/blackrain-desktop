import { useCallback, useId, useState } from "react";

type AuthMode = "sign-in" | "sign-up";
// 注册两步：先填表单，再输验证码。
type AuthStep = "form" | "verify";

export interface AccountAuthCardProps {
  // 后端未配置时禁用提交并提示。
  configured: boolean;
  onSignIn(email: string, password: string): Promise<void>;
  onSignUp(email: string, password: string): Promise<void>;
  // 注册验证码校验（开启邮箱确认后必传；省略则注册后不进验证码步骤，仅作降级兜底）。
  onVerifyOtp?(email: string, token: string): Promise<void>;
  onResendOtp?(email: string): Promise<void>;
  // 可选关闭（门禁场景不传，强制先登录）。
  onClose?: () => void;
}

function isValidEmail(value: string): boolean {
  return /.+@.+\..+/.test(value.trim());
}

// 细线图标（冰蓝、aria-hidden，纯装饰）
function MailIcon() {
  return (
    <svg className="auth-field-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="auth-field-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </svg>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
      {off ? <path d="m4 4 16 16" /> : null}
    </svg>
  );
}


// 登录/注册卡片。开屏专用的独立设计（不再复用弹窗 ModalShell）。
export function AccountAuthCard({
  configured,
  onSignIn,
  onSignUp,
  onVerifyOtp,
  onResendOtp,
  onClose,
}: AccountAuthCardProps) {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  // 注册分两步：form（填邮箱密码）→ verify（输验证码）。登录恒为 form。
  const [step, setStep] = useState<AuthStep>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();
  const otpId = useId();

  const isSignUp = mode === "sign-up";
  const isVerify = step === "verify";

  // 切回填写态，清验证码/提示（切换登录注册、返回上一步时用）。
  const resetToForm = useCallback(() => {
    setStep("form");
    setOtp("");
    setError(null);
    setNotice(null);
  }, []);

  const submit = useCallback(async () => {
    setError(null);
    setNotice(null);
    if (!configured) {
      setError("账号后端未配置，暂时无法登录。");
      return;
    }
    if (!isValidEmail(email)) {
      setError("请输入有效邮箱。");
      return;
    }
    if (password.length < 6) {
      setError("密码至少 6 位。");
      return;
    }
    if (isSignUp && password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }
    setBusy(true);
    try {
      if (isSignUp) {
        await onSignUp(email.trim(), password);
        // 开启邮箱确认 → 进验证码步骤；无 onVerifyOtp（未开确认的降级）→ 提示注册成功。
        if (onVerifyOtp) {
          setStep("verify");
          setNotice("验证码已发送至邮箱，请查收后填入。");
        } else {
          setNotice("注册成功，已自动登录。");
        }
      } else {
        await onSignIn(email.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [
    configured,
    email,
    password,
    confirmPassword,
    isSignUp,
    onSignIn,
    onSignUp,
    onVerifyOtp,
  ]);

  // 校验验证码（注册第二步）。
  const verify = useCallback(async () => {
    setError(null);
    setNotice(null);
    if (!onVerifyOtp) {
      return;
    }
    if (otp.trim().length < 6) {
      setError("请输入 6 位验证码。");
      return;
    }
    setBusy(true);
    try {
      await onVerifyOtp(email.trim(), otp);
      // 成功后 provider 会切到已登录态，门禁自动放行；无需在此跳转。
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [onVerifyOtp, otp, email]);

  // 重发验证码。
  const resend = useCallback(async () => {
    setError(null);
    setNotice(null);
    if (!onResendOtp) {
      return;
    }
    setBusy(true);
    try {
      await onResendOtp(email.trim());
      setNotice("验证码已重新发送。");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [onResendOtp, email]);

  return (
    <div className="auth-card" data-tauri-drag-region="false">
      {!configured ? (
        <div className="auth-card-banner auth-card-banner--error">
          账号后端未配置：缺 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY。
        </div>
      ) : null}

      <form
        className="auth-card-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (isVerify) {
            void verify();
          } else {
            void submit();
          }
        }}
      >
        {isVerify ? (
          <>
            <p className="auth-verify-hint">
              已向 <strong>{email}</strong> 发送 6 位验证码，填入完成注册。
            </p>
            <div className="auth-field">
              <label className="auth-field-label" htmlFor={otpId}>
                验证码
              </label>
              <div className="auth-input-wrap">
                <input
                  id={otpId}
                  className="auth-input auth-input--otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="6 位数字"
                  value={otp}
                  disabled={busy}
                  onChange={(event) =>
                    setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="auth-field">
              <label className="auth-field-label" htmlFor={emailId}>
                邮箱
              </label>
              <div className="auth-input-wrap">
                <MailIcon />
                <input
                  id={emailId}
                  className="auth-input auth-input--icon"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  disabled={busy}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-field-label" htmlFor={passwordId}>
                密码
              </label>
              <div className="auth-input-wrap">
                <LockIcon />
                <input
                  id={passwordId}
                  className="auth-input auth-input--icon auth-input--toggle"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  placeholder="至少 6 位"
                  value={password}
                  disabled={busy}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="auth-input-eye"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  aria-pressed={showPassword}
                  disabled={busy}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  <EyeIcon off={showPassword} />
                </button>
              </div>
            </div>

            {isSignUp ? (
              <div className="auth-field">
                <label className="auth-field-label" htmlFor={confirmId}>
                  确认密码
                </label>
                <div className="auth-input-wrap">
                  <LockIcon />
                  <input
                    id={confirmId}
                    className="auth-input auth-input--icon"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="再次输入密码"
                    value={confirmPassword}
                    disabled={busy}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </div>
              </div>
            ) : null}
          </>
        )}

        {error ? (
          <div className="auth-card-banner auth-card-banner--error">{error}</div>
        ) : null}
        {notice ? (
          <div className="auth-card-banner auth-card-banner--notice">{notice}</div>
        ) : null}

        <button
          type="submit"
          className="auth-submit"
          disabled={busy || !configured}
        >
          {busy ? (
            <span className="auth-submit-busy">
              <span className="auth-submit-spinner" aria-hidden="true" />
              处理中…
            </span>
          ) : isVerify ? (
            "验证并登录"
          ) : isSignUp ? (
            "注册"
          ) : (
            "登录"
          )}
        </button>

        <div className="auth-card-foot">
          {isVerify ? (
            <>
              <button
                type="button"
                className="auth-link"
                disabled={busy}
                onClick={() => void resend()}
              >
                重新发送验证码
              </button>
              <button
                type="button"
                className="auth-link"
                disabled={busy}
                onClick={resetToForm}
              >
                返回修改
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="auth-link"
                disabled={busy}
                onClick={() => {
                  setMode(isSignUp ? "sign-in" : "sign-up");
                  setConfirmPassword("");
                  setError(null);
                  setNotice(null);
                }}
              >
                {isSignUp ? "已有账号？去登录" : "没有账号？去注册"}
              </button>
              {onClose ? (
                <button
                  type="button"
                  className="auth-link"
                  disabled={busy}
                  onClick={onClose}
                >
                  取消
                </button>
              ) : null}
            </>
          )}
        </div>
      </form>
    </div>
  );
}
