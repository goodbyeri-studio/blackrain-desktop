import Check from "lucide-react/dist/esm/icons/check";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { useMenuController } from "@app/hooks/useMenuController";
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

function modelLabel(model: HomeModelOption | null) {
  return model?.model || model?.displayName || "";
}

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
  const menu = useMenuController({});
  const { isOpen, containerRef, toggle, close } = menu;
  const [showModelPanel, setShowModelPanel] = useState(false);
  const [modelRowOffset, setModelRowOffset] = useState(0);
  const modelRowRef = useRef<HTMLButtonElement>(null);
  const closePanelTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const selectedModel =
    models.find((m) => m.id === selectedModelId) ?? models[0] ?? null;

  const currentModelLabel = modelLabel(selectedModel) || tx("No models");
  const hasReasoning = reasoningSupported && reasoningOptions.length > 0;
  const displayEffort = hasReasoning ? selectedEffort : null;
  const triggerLabel = displayEffort ? `${currentModelLabel} ${displayEffort}` : currentModelLabel;

  const handleModelRowEnter = () => {
    clearTimeout(closePanelTimer.current);
    if (modelRowRef.current) {
      setModelRowOffset(modelRowRef.current.offsetTop);
    }
    setShowModelPanel(true);
  };

  const scheduleClosePanel = () => {
    clearTimeout(closePanelTimer.current);
    closePanelTimer.current = setTimeout(() => setShowModelPanel(false), 120);
  };

  const cancelClosePanel = () => {
    clearTimeout(closePanelTimer.current);
  };

  useEffect(() => {
    if (!isOpen) {
      setShowModelPanel(false);
    }
    return () => clearTimeout(closePanelTimer.current);
  }, [isOpen]);

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

      {isOpen && !hasReasoning && (
        <PopoverSurface className="home-menu-popover home-menu-popover--model" role="menu">
          <div className="home-menu-header">
            <span className="home-menu-title">{tx("Model")}</span>
          </div>
          {models.length === 0 && (
            <div className="home-menu-empty">{tx("No models")}</div>
          )}
          {models.map((model) => {
            const active = model.id === selectedModelId;
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
                      {modelLabel(model)}
                    </span>
                  </span>
                <span className="home-menu-rich-check" aria-hidden>
                  {active ? <Check size={16} strokeWidth={2} /> : null}
                </span>
              </button>
            );
          })}
        </PopoverSurface>
      )}

      {isOpen && hasReasoning && (
        <div className="home-model-popover-wrap">
          {/* 主面板：推理档位 + 模型族行 */}
          <PopoverSurface
            className="home-menu-popover home-menu-popover--left"
            role="menu"
            onMouseLeave={scheduleClosePanel}
          >
            <div className="home-menu-header">
              <span className="home-menu-title">{tx("Reasoning")}</span>
            </div>
            {reasoningOptions.map((effort) => {
              const active = effort === displayEffort;
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
                    <span className="home-menu-rich-label">{effort}</span>
                  </span>
                  <span className="home-menu-rich-check" aria-hidden>
                    {active ? <Check size={18} strokeWidth={2} /> : null}
                  </span>
                </button>
              );
            })}
            <div className="home-menu-divider" />

            {/* 模型族行：hover/focus 触发模型子面板 */}
            <button
              ref={modelRowRef}
              type="button"
              className={`home-menu-rich-item home-menu-model-row${showModelPanel ? " is-active" : ""}`}
              aria-haspopup="menu"
              aria-expanded={showModelPanel}
              onMouseEnter={handleModelRowEnter}
              onMouseLeave={scheduleClosePanel}
              onFocus={handleModelRowEnter}
              onBlur={scheduleClosePanel}
              onClick={handleModelRowEnter}
            >
              <span className="home-menu-rich-body">
                <span className="home-menu-rich-label">{currentModelLabel}</span>
              </span>
              <ChevronRight size={14} className="home-menu-model-row-chevron" aria-hidden />
            </button>
          </PopoverSurface>

          {/* 模型子面板：绝对定位，top 对齐模型族行 */}
          {showModelPanel && (
            <PopoverSurface
              className="home-menu-popover home-menu-popover--right"
              role="menu"
              style={{ top: modelRowOffset }}
              onMouseEnter={cancelClosePanel}
              onMouseLeave={scheduleClosePanel}
              onFocus={cancelClosePanel}
              onBlur={scheduleClosePanel}
            >
              <div className="home-menu-header">
                <span className="home-menu-title">{tx("模型")}</span>
              </div>
              {models.length === 0 && (
                <div className="home-menu-empty">{tx("No models")}</div>
              )}
              {models.map((model) => {
                const active = model.id === selectedModelId;
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
                      setShowModelPanel(false);
                    }}
                  >
                    <span className="home-menu-rich-body">
                      <span className="home-menu-rich-label">
                        {modelLabel(model)}
                      </span>
                    </span>
                    <span className="home-menu-rich-check" aria-hidden>
                      {active ? <Check size={16} strokeWidth={2} /> : null}
                    </span>
                  </button>
                );
              })}
            </PopoverSurface>
          )}
        </div>
      )}
    </div>
  );
}
