import SquarePen from "lucide-react/dist/esm/icons/square-pen";
import LayoutGrid from "lucide-react/dist/esm/icons/layout-grid";
import Boxes from "lucide-react/dist/esm/icons/boxes";
import Store from "lucide-react/dist/esm/icons/store";
import { useI18n } from "@/i18n";

type SidebarActionsProps = {
  onNewConversation: () => void;
};

/**
 * codex 式侧栏顶部动作区。
 * - 新对话:回首页卡片(真实功能)
 * - 插件 / 模型广场 / 智能体市场:2049 暂无后端,先做空占位(可见,点击暂无反应),
 *   待功能就绪再接线。
 * 「搜索 / 自动化」按需求移除(搜索机器保留休眠,见 Sidebar)。
 */
export function SidebarActions({ onNewConversation }: SidebarActionsProps) {
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
        className="sidebar-action is-placeholder"
        data-tauri-drag-region="false"
        aria-disabled="true"
        title={tx("Coming soon")}
      >
        <span className="sidebar-action-icon" aria-hidden>
          <LayoutGrid size={17} strokeWidth={1.8} />
        </span>
        <span className="sidebar-action-label">{tx("Plugins")}</span>
      </button>

      <button
        type="button"
        className="sidebar-action is-placeholder"
        data-tauri-drag-region="false"
        aria-disabled="true"
        title={tx("Coming soon")}
      >
        <span className="sidebar-action-icon" aria-hidden>
          <Boxes size={17} strokeWidth={1.8} />
        </span>
        <span className="sidebar-action-label">{tx("Model plaza")}</span>
      </button>

      <button
        type="button"
        className="sidebar-action is-placeholder"
        data-tauri-drag-region="false"
        aria-disabled="true"
        title={tx("Coming soon")}
      >
        <span className="sidebar-action-icon" aria-hidden>
          <Store size={17} strokeWidth={1.8} />
        </span>
        <span className="sidebar-action-label">{tx("Agent marketplace")}</span>
      </button>
    </div>
  );
}
