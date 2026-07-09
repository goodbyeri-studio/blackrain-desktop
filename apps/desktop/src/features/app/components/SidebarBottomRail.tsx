import ScrollText from "lucide-react/dist/esm/icons/scroll-text";
import { useI18n } from "@/i18n";

// 注:codex 风格底部已移除用量面板(用量/会话/进度条),仅保留扁平设置行。
// 用量相关 props(sessionPercent/weeklyPercent/…)仍由 Sidebar 透传但不再消费,
// 用量数据另在 Home / 托盘等入口展示。
type SidebarBottomRailProps = {
  sessionPercent: number | null;
  weeklyPercent: number | null;
  sessionResetLabel: string | null;
  weeklyResetLabel: string | null;
  creditsLabel: string | null;
  showWeekly: boolean;
  onOpenSettings: () => void;
  onOpenDebug: () => void;
  showDebugButton: boolean;
  showAccountSwitcher: boolean;
  accountLabel: string;
  accountActionLabel: string;
  accountDisabled: boolean;
  accountSwitching: boolean;
  accountCancelDisabled: boolean;
  onSwitchAccount: () => void;
  onCancelSwitchAccount: () => void;
};

export function SidebarBottomRail({
  onOpenSettings,
  onOpenDebug,
  showDebugButton,
  accountLabel,
}: SidebarBottomRailProps) {
  const { tx } = useI18n();

  return (
    <div className="sidebar-bottom-rail">
      <div className="sidebar-bottom-actions is-compact">
        <div className="sidebar-utility-actions">
          <button
            className="ghost sidebar-settings-account-button"
            type="button"
            onClick={onOpenSettings}
            aria-label={tx("Open settings")}
          >
            <span className="sidebar-settings-account-copy">
              <span className="sidebar-settings-account-title">{tx("Settings")}</span>
              <span className="sidebar-settings-account-subtitle">{accountLabel}</span>
            </span>
          </button>
          {showDebugButton && (
            <button
              className="ghost sidebar-utility-button"
              type="button"
              onClick={onOpenDebug}
              aria-label={tx("Open debug log")}
            >
              <ScrollText size={14} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
