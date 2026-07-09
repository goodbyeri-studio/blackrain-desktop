import { useState } from "react";
import SquarePen from "lucide-react/dist/esm/icons/square-pen";
import LayoutGrid from "lucide-react/dist/esm/icons/layout-grid";
import Boxes from "lucide-react/dist/esm/icons/boxes";
import Store from "lucide-react/dist/esm/icons/store";
import Clock3 from "lucide-react/dist/esm/icons/clock-3";
import { useI18n } from "@/i18n";

type SidebarActionsProps = {
  onNewConversation: () => void;
};

/**
 * Codex 顺序:新对话 / 已安排 / 插件。
 * BlackRain 只在后面追加模型广场 / 智能体市场两个入口。
 */
export function SidebarActions({ onNewConversation }: SidebarActionsProps) {
  const { tx } = useI18n();
  const [surfaceMode, setSurfaceMode] = useState<"work" | "code">("code");

  return (
    <div className="sidebar-actions">
      <div className="sidebar-mode-switch" role="group" aria-label={tx("Mode")}>
        {(["work", "code"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`sidebar-mode-switch-button${
              surfaceMode === mode ? " is-active" : ""
            }`}
            aria-pressed={surfaceMode === mode}
            onClick={() => setSurfaceMode(mode)}
            data-tauri-drag-region="false"
          >
            {tx(mode === "work" ? "Work" : "Code")}
          </button>
        ))}
      </div>

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
          <Clock3 size={17} strokeWidth={1.8} />
        </span>
        <span className="sidebar-action-label">{tx("Scheduled")}</span>
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
