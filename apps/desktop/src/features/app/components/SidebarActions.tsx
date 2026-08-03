import SquarePen from "lucide-react/dist/esm/icons/square-pen";
import { useI18n } from "@/i18n";

type SidebarActionsProps = {
  onNewConversation: () => void;
};

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

    </div>
  );
}
