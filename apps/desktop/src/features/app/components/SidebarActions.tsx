import SquarePen from "lucide-react/dist/esm/icons/square-pen";
import Search from "lucide-react/dist/esm/icons/search";
import { useI18n } from "@/i18n";

type SidebarActionsProps = {
  onNewConversation: () => void;
  onToggleSearch: () => void;
  isSearchOpen: boolean;
};

/**
 * codex 式侧栏顶部动作区:新对话 / 搜索。
 * 「插件 / 自动化」codex 有、2049 暂无对应后端,按「视觉1:1+真实数据」原则
 * 先不渲染(避免点了无反应的「说谎 UI」),待有功能再加。
 */
export function SidebarActions({
  onNewConversation,
  onToggleSearch,
  isSearchOpen,
}: SidebarActionsProps) {
  const { tx } = useI18n();

  return (
    <div className="sidebar-actions">
      <button
        type="button"
        className="sidebar-action"
        onClick={onNewConversation}
        data-tauri-drag-region="false"
      >
        <span className="sidebar-action-icon" aria-hidden>
          <SquarePen size={17} strokeWidth={1.8} />
        </span>
        <span className="sidebar-action-label">{tx("New conversation")}</span>
      </button>

      <button
        type="button"
        className={`sidebar-action${isSearchOpen ? " is-active" : ""}`}
        onClick={onToggleSearch}
        data-tauri-drag-region="false"
        aria-label={tx("Toggle search")}
        aria-pressed={isSearchOpen}
      >
        <span className="sidebar-action-icon" aria-hidden>
          <Search size={17} strokeWidth={1.8} />
        </span>
        <span className="sidebar-action-label">{tx("Search")}</span>
      </button>
    </div>
  );
}
