import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";

type NavigationControlsProps = {
  onBack?: () => void;
  onForward?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
};

export function NavigationControls({
  onBack,
  onForward,
  canGoBack = false,
  canGoForward = false,
}: NavigationControlsProps) {
  return (
    <div className="nav-controls">
      <button
        className="nav-controls-button"
        onClick={onBack}
        disabled={!canGoBack}
        type="button"
        aria-label="后退"
      >
        <ChevronLeft size={16} aria-hidden />
      </button>
      <button
        className="nav-controls-button"
        onClick={onForward}
        disabled={!canGoForward}
        type="button"
        aria-label="前进"
      >
        <ChevronRight size={16} aria-hidden />
      </button>
    </div>
  );
}
