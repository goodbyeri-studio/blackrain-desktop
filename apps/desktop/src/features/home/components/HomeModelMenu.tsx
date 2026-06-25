import Check from "lucide-react/dist/esm/icons/check";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import { useI18n } from "@/i18n";
import { useMenuController } from "@app/hooks/useMenuController";
import {
  hasKnownMultiplier,
  modelMultiplier,
} from "@/features/accounts/utils/creditPricing";
import {
  PopoverSurface,
  MenuTrigger,
} from "../../design-system/components/popover/PopoverPrimitives";

type HomeModelOption = { id: string; displayName: string; model: string };

type HomeModelMenuProps = {
  models: HomeModelOption[];
  selectedModelId: string | null;
  onSelectModel: (modelId: string) => void;
  reasoningOptions: string[];
  selectedEffort: string | null;
  onSelectEffort: (effort: string) => void;
  reasoningSupported: boolean;
};

const EFFORT_LABELS: Record<string, string> = {
  minimal: "极低",
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "超高",
  "x-high": "超高",
};

export function HomeModelMenu({
  models,
  selectedModelId,
  onSelectModel,
  reasoningOptions,
  selectedEffort,
  onSelectEffort,
  reasoningSupported,
}: HomeModelMenuProps) {
  const { tx } = useI18n();
  const menu = useMenuController();
  const { isOpen, containerRef, toggle, close } = menu;

  const selectedModel =
    models.find((m) => m.id === selectedModelId) ?? models[0] ?? null;
  const modelLabel = selectedModel?.displayName || selectedModel?.model || tx("No models");
  const effortLabel =
    reasoningSupported && selectedEffort
      ? EFFORT_LABELS[selectedEffort] ?? selectedEffort
      : null;
  const triggerLabel = effortLabel ? `${modelLabel} ${effortLabel}` : modelLabel;
  const hasReasoning = reasoningSupported && reasoningOptions.length > 0;

  return (
    <div className="home-menu-anchor" ref={containerRef}>
      <MenuTrigger
        isOpen={isOpen}
        className="home-pill home-model-trigger"
        onClick={toggle}
        aria-label={tx("Model")}
      >
        <span className="home-model-label">{triggerLabel}</span>
        <ChevronDown className="home-pill-chevron" aria-hidden />
      </MenuTrigger>

      {isOpen && (
        <PopoverSurface className="home-menu-popover home-menu-popover--model" role="menu">
          {hasReasoning && (
            <>
              <div className="home-menu-header">
                <span className="home-menu-title">{tx("Reasoning")}</span>
              </div>
              {reasoningOptions.map((effort) => {
                const active = effort === selectedEffort;
                return (
                  <button
                    key={effort}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className="home-menu-rich-item"
                    onClick={() => {
                      onSelectEffort(effort);
                    }}
                  >
                    <span className="home-menu-rich-body">
                      <span className="home-menu-rich-label">
                        {EFFORT_LABELS[effort] ?? effort}
                      </span>
                    </span>
                    <span className="home-menu-rich-check" aria-hidden>
                      {active ? <Check size={16} strokeWidth={2} /> : null}
                    </span>
                  </button>
                );
              })}
              <div className="home-menu-divider" />
            </>
          )}

          <div className="home-menu-header">
            <span className="home-menu-title">{tx("Model")}</span>
          </div>
          {models.length === 0 && (
            <div className="home-menu-empty">{tx("No models")}</div>
          )}
          {models.map((model) => {
            const active = model.id === selectedModelId;
            const multiplier = hasKnownMultiplier(model.model)
              ? modelMultiplier(model.model)
              : null;
            return (
              <button
                key={model.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className="home-menu-rich-item"
                onClick={() => {
                  onSelectModel(model.id);
                  close();
                }}
              >
                <span className="home-menu-rich-body">
                  <span className="home-menu-rich-label">
                    {model.displayName || model.model}
                  </span>
                </span>
                {multiplier ? (
                  <span className="home-model-multiplier" aria-label={`credit 倍率 ${multiplier.label}`}>
                    {multiplier.label}
                  </span>
                ) : null}
                <span className="home-menu-rich-check" aria-hidden>
                  {active ? <Check size={16} strokeWidth={2} /> : null}
                </span>
              </button>
            );
          })}
        </PopoverSurface>
      )}
    </div>
  );
}
