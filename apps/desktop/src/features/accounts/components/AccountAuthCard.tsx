import { useCallback, useId, useState } from "react";

type AuthMode = "sign-in" | "sign-up";

export interface AccountAuthCardProps {
  // 后端未配置时禁用提交并提示。
  configured: boolean;
  onSignIn(email: string, password: string): Promise<void>;
  onSignUp(email: string, password: string): Promise<void>;
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
  onClose,
}: AccountAuthCardProps) {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();

  const isSignUp = mode === "sign-up";

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
        setNotice("注册成功，已自动登录。");
      } else {
        await onSignIn(email.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [configured, email, password, confirmPassword, isSignUp, onSignIn, onSignUp]);

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
          void submit();
        }}
      >
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
          ) : isSignUp ? (
            "注册"
          ) : (
            "登录"
          )}
        </button>

        <div className="auth-card-foot">
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
        </div>
      </form>
    </div>
  );
}
