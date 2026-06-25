import { useCallback, useId, useState } from "react";
import { ModalShell } from "@/features/design-system/components/modal/ModalShell";

type AuthMode = "sign-in" | "sign-up";

export interface AccountAuthCardProps {
  // 后端未配置时禁用提交并提示。
  configured: boolean;
  onSignIn(email: string, password: string): Promise<void>;
  onSignUp(email: string, password: string): Promise<void>;
  // 可选关闭（门禁场景下可不传，强制先登录）。
  onClose?: () => void;
}

function isValidEmail(value: string): boolean {
  return /.+@.+\..+/.test(value.trim());
}

// 登录/注册卡片。M-A1.5：复用 design-system ModalShell + settings 输入样式。
export function AccountAuthCard({
  configured,
  onSignIn,
  onSignUp,
  onClose,
}: AccountAuthCardProps) {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const emailId = useId();
  const passwordId = useId();

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
    setBusy(true);
    try {
      if (isSignUp) {
        await onSignUp(email.trim(), password);
        setNotice("注册成功。若开启了邮箱确认，请查收邮件后再登录。");
      } else {
        await onSignIn(email.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [configured, email, password, isSignUp, onSignIn, onSignUp]);

  return (
    <ModalShell
      ariaLabel={isSignUp ? "注册账号" : "登录账号"}
      onBackdropClick={onClose}
    >
      <div className="settings-section-title">
        {isSignUp ? "注册 BlackRain 账号" : "登录 BlackRain"}
      </div>
      <div className="settings-section-subtitle">
        {isSignUp
          ? "注册即获赠 100 credits，可直接对话。"
          : "登录后即可使用赠送额度对话。"}
      </div>

      {!configured ? (
        <div className="settings-gateway-provider-status settings-gateway-provider-status--error">
          账号后端未配置：缺 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY。
        </div>
      ) : null}

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="settings-field">
          <label className="settings-field-label" htmlFor={emailId}>
            邮箱
          </label>
          <div className="settings-field-row">
            <input
              id={emailId}
              className="settings-input"
              type="email"
              autoComplete="email"
              value={email}
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </div>

        <div className="settings-field">
          <label className="settings-field-label" htmlFor={passwordId}>
            密码
          </label>
          <div className="settings-field-row">
            <input
              id={passwordId}
              className="settings-input"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              value={password}
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        </div>

        {error ? (
          <div className="settings-gateway-provider-status settings-gateway-provider-status--error">
            {error}
          </div>
        ) : null}
        {notice ? <div className="settings-help">{notice}</div> : null}

        <div className="settings-gateway-provider-actions">
          <button
            type="submit"
            className="ghost settings-button-compact"
            disabled={busy || !configured}
          >
            {busy ? "处理中…" : isSignUp ? "注册" : "登录"}
          </button>
          <button
            type="button"
            className="ghost settings-button-compact"
            disabled={busy}
            onClick={() => {
              setMode(isSignUp ? "sign-in" : "sign-up");
              setError(null);
              setNotice(null);
            }}
          >
            {isSignUp ? "已有账号？去登录" : "没有账号？去注册"}
          </button>
          {onClose ? (
            <button
              type="button"
              className="ghost settings-button-compact"
              disabled={busy}
              onClick={onClose}
            >
              取消
            </button>
          ) : null}
        </div>
      </form>
    </ModalShell>
  );
}
