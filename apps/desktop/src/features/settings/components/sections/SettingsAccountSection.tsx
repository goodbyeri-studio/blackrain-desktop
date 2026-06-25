import { useState } from "react";
import { SettingsSection } from "@/features/design-system/components/settings/SettingsPrimitives";
import { useAccount } from "@/features/accounts/hooks/useAccount";
import { AccountAuthCard } from "@/features/accounts/components/AccountAuthCard";
import {
  formatCredits,
  planLabel,
} from "@/features/accounts/utils/creditDisplay";
import {
  ACCOUNT_PLANS,
  PLAN_DESCRIPTORS,
} from "@/features/accounts/types";

// 002-accounts-credits / M-A1.6：设置页账号区。
// 展示登录态、当前 plan+余额、三档套餐占位；未登录给登录入口。
export function SettingsAccountSection() {
  const account = useAccount();
  const [showAuth, setShowAuth] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const unconfigured = account.status === "unconfigured";
  const signedIn = account.status === "signed-in";

  return (
    <SettingsSection
      title="账号"
      subtitle="登录后用赠送的 credit 对话；Plus+ 可自带第三方 key。"
    >
      {unconfigured ? (
        <div className="settings-gateway-provider-status settings-gateway-provider-status--error">
          账号后端未配置：缺 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY。
        </div>
      ) : null}

      {/* 当前登录态 */}
      <div className="settings-field">
        <div className="settings-field-label">当前账号</div>
        {signedIn ? (
          <>
            <div className="settings-help">
              {account.session?.email ?? "已登录"}
            </div>
            <div className="settings-help">
              套餐 <strong>{planLabel(account.profile?.plan ?? "free")}</strong>
              {account.profile
                ? ` · 余额 ${formatCredits(account.profile.credits)} credits`
                : account.error
                  ? " · 余额暂不可用"
                  : ""}
            </div>
            <div className="settings-gateway-provider-actions">
              <button
                type="button"
                className="ghost settings-button-compact"
                disabled={signingOut}
                onClick={() => {
                  setSigningOut(true);
                  void account
                    .signOut()
                    .finally(() => setSigningOut(false));
                }}
              >
                {signingOut ? "登出中…" : "登出"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="settings-help">
              {account.status === "loading" ? "正在恢复会话…" : "尚未登录。"}
            </div>
            <div className="settings-gateway-provider-actions">
              <button
                type="button"
                className="ghost settings-button-compact"
                disabled={unconfigured}
                onClick={() => setShowAuth(true)}
              >
                登录 / 注册
              </button>
            </div>
          </>
        )}
      </div>

      <div className="settings-divider" />

      {/* 三档套餐占位 */}
      <div className="settings-field">
        <div className="settings-field-label settings-field-label--section">
          套餐
        </div>
        <div className="settings-help">价格与额度待定，当前仅 Free 可用。</div>
        <div className="settings-gateway-provider-list">
          {ACCOUNT_PLANS.map((plan) => {
            const descriptor = PLAN_DESCRIPTORS[plan];
            const current = account.profile?.plan === plan;
            return (
              <div className="settings-gateway-provider" key={plan}>
                <div className="settings-gateway-provider-main">
                  <div className="settings-gateway-provider-title-row">
                    <div className="settings-gateway-provider-title">
                      {descriptor.label}
                    </div>
                    {current ? (
                      <span className="settings-mobile-remote-badge">当前</span>
                    ) : null}
                  </div>
                  <div className="settings-gateway-provider-meta">
                    {descriptor.priceLabel}
                    {descriptor.byok ? " · 可自带 key（BYOK）" : " · 仅平台额度"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showAuth && !signedIn ? (
        <AccountAuthCard
          configured={!unconfigured}
          onSignIn={account.signIn}
          onSignUp={account.signUp}
          onClose={() => setShowAuth(false)}
        />
      ) : null}
    </SettingsSection>
  );
}
