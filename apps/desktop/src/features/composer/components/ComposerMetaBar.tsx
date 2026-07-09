import type { CSSProperties } from "react";
import { useRef, useState } from "react";
import { Check, ChevronRight, SlidersHorizontal, Zap } from "lucide-react";
import type { AccessMode, ServiceTier, ThreadTokenUsage } from "../../../types";
import type { CodexArgsOption } from "../../threads/utils/codexArgsProfiles";
import { useI18n } from "@/i18n";
import { useMenuController } from "../../app/hooks/useMenuController";
import { PopoverMenuItem } from "../../design-system/components/popover/PopoverPrimitives";

type ComposerMetaBarProps = {
  disabled: boolean;
  collaborationModes: { id: string; label: string }[];
  selectedCollaborationModeId: string | null;
  onSelectCollaborationMode: (id: string | null) => void;
  models: { id: string; displayName: string; model: string }[];
  selectedModelId: string | null;
  onSelectModel: (id: string) => void;
  reasoningOptions: string[];
  selectedEffort: string | null;
  onSelectEffort: (effort: string) => void;
  selectedServiceTier: ServiceTier | null;
  reasoningSupported: boolean;
  accessMode: AccessMode;
  onSelectAccessMode: (mode: AccessMode) => void;
  codexArgsOptions?: CodexArgsOption[];
  selectedCodexArgsOverride?: string | null;
  onSelectCodexArgsOverride?: (value: string | null) => void;
  contextUsage?: ThreadTokenUsage | null;
};

export function ComposerMetaBar({
  disabled,
  collaborationModes,
  selectedCollaborationModeId,
  onSelectCollaborationMode,
  models,
  selectedModelId,
  onSelectModel,
  reasoningOptions,
  selectedEffort,
  onSelectEffort,
  selectedServiceTier,
  accessMode,
  onSelectAccessMode,
  codexArgsOptions = [],
  selectedCodexArgsOverride = null,
  onSelectCodexArgsOverride,
  contextUsage = null,
}: ComposerMetaBarProps) {
  const { tx } = useI18n();
  const selectedModel =
    models.find((model) => model.id === selectedModelId) ?? null;
  const contextWindow = contextUsage?.modelContextWindow ?? null;
  const lastTokens = contextUsage?.last.totalTokens ?? 0;
  const totalTokens = contextUsage?.total.totalTokens ?? 0;
  const usedTokens = lastTokens > 0 ? lastTokens : totalTokens;
  const contextFreePercent =
    contextWindow && contextWindow > 0 && usedTokens > 0
      ? Math.max(
          0,
          100 -
            Math.min(Math.max((usedTokens / contextWindow) * 100, 0), 100),
        )
      : null;
  const accessModeClass =
    accessMode === "full-access"
      ? "approval-danger"
      : accessMode === "current"
        ? "approval-warning"
        : "";

  const planMode =
    collaborationModes.find((mode) => mode.id === "plan") ?? null;
  const defaultMode =
    collaborationModes.find((mode) => mode.id === "default") ?? null;
  const canUsePlanToggle =
    Boolean(planMode) &&
    collaborationModes.every(
      (mode) => mode.id === "default" || mode.id === "plan",
    );
  const planSelected = selectedCollaborationModeId === (planMode?.id ?? "");

  // 两级模型选择器状态
  const modelMenu = useMenuController({});
  const [showModelPanel, setShowModelPanel] = useState(false);
  const [modelRowOffset, setModelRowOffset] = useState(0);
  const modelRowRef = useRef<HTMLDivElement>(null);
  const closePanelTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleModelRowEnter = () => {
    clearTimeout(closePanelTimer.current);
    if (modelRowRef.current) {
      setModelRowOffset(modelRowRef.current.offsetTop);
    }
    setShowModelPanel(true);
  };

  const scheduleClosePanel = () => {
    closePanelTimer.current = setTimeout(() => setShowModelPanel(false), 120);
  };

  const cancelClosePanel = () => {
    clearTimeout(closePanelTimer.current);
  };

  // 触发按钮展示文本：完整模型名（保留品牌前缀）+ 推理档位
  const currentDisplayName = selectedModel?.displayName ?? selectedModel?.model ?? tx("No models");
  const effortLabel = selectedEffort ?? "";

  return (
    <div className="composer-bar">
      <div className="composer-meta">
        {collaborationModes.length > 0 && (
          canUsePlanToggle ? (
            <div className="composer-select-wrap composer-plan-toggle-wrap">
              <label className="composer-plan-toggle" aria-label={tx("Plan mode")}>
                <input
                  className="composer-plan-toggle-input"
                  type="checkbox"
                  checked={planSelected}
                  disabled={disabled}
                  onChange={(event) =>
                    onSelectCollaborationMode(
                      event.target.checked
                        ? planMode?.id ?? "plan"
                        : (defaultMode?.id ?? null),
                    )
                  }
                />
                <span className="composer-plan-toggle-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="m6.5 7.5 1 1 2-2M6.5 12.5l1 1 2-2M6.5 17.5l1 1 2-2M11 7.5h7M11 12.5h7M11 17.5h7"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="composer-plan-toggle-label">
                  {tx(planMode?.label || "Plan")}
                </span>
              </label>
            </div>
          ) : (
            <div className="composer-select-wrap">
            <span className="composer-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="m6.5 7.5 1 1 2-2M6.5 12.5l1 1 2-2M6.5 17.5l1 1 2-2M11 7.5h7M11 12.5h7M11 17.5h7"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
              <select
                className="composer-select composer-select--model composer-select--collab"
                aria-label={tx("Collaboration mode")}
                value={selectedCollaborationModeId ?? ""}
                onChange={(event) =>
                  onSelectCollaborationMode(event.target.value || null)
                }
                disabled={disabled}
              >
                {collaborationModes.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {tx(mode.label || mode.id)}
                  </option>
                ))}
              </select>
            </div>
          )
        )}
        {/* 两级模型+推理选择器 */}
        <div className="model-selector-popover-wrap" ref={modelMenu.containerRef}>
          <button
            type="button"
            className="model-selector-trigger"
            disabled={disabled}
            onClick={modelMenu.toggle}
            aria-haspopup="menu"
            aria-expanded={modelMenu.isOpen}
            aria-label={tx("Model and effort selector")}
          >
            {currentDisplayName}{effortLabel ? ` ${effortLabel}` : ""} ∨
            {selectedServiceTier === "fast" && (
              <Zap size={12} strokeWidth={1.8} aria-label={tx("Fast mode enabled")} />
            )}
          </button>
          {modelMenu.isOpen && (
            <div
              className="model-selector-popover"
              onMouseLeave={scheduleClosePanel}
            >
              {/* 左面板：推理档位 + 模型族行 */}
              <div className="model-selector-left">
                {reasoningOptions.length > 0 && (
                  <>
                    <div className="model-selector-section-label">{tx("推理")}</div>
                    {reasoningOptions.map((option) => (
                      <PopoverMenuItem
                        key={option}
                        active={option === selectedEffort}
                        onClick={() => { onSelectEffort(option); }}
                      >
                        <span className="model-selector-option-label">{option}</span>
                        {option === selectedEffort && <Check size={13} className="model-selector-check" />}
                      </PopoverMenuItem>
                    ))}
                    <div className="model-selector-divider" />
                  </>
                )}
                {/* 模型族行：hover 从该行位置飞出右面板 */}
                <div
                  ref={modelRowRef}
                  className={`model-selector-model-row${showModelPanel ? " model-selector-model-row--active" : ""}`}
                  onMouseEnter={handleModelRowEnter}
                  onMouseLeave={scheduleClosePanel}
                >
                  <span>{currentDisplayName}</span>
                  <ChevronRight size={13} />
                </div>
              </div>
              {/* 右面板：绝对定位，top 对齐模型族行 */}
              {showModelPanel && (
                <div
                  className="model-selector-right"
                  style={{ top: modelRowOffset }}
                  onMouseEnter={cancelClosePanel}
                  onMouseLeave={scheduleClosePanel}
                >
                  <div className="model-selector-section-label">{tx("模型")}</div>
                  {models.map((m) => (
                    <PopoverMenuItem
                      key={m.id}
                      active={m.id === selectedModelId}
                      onClick={() => { onSelectModel(m.id); modelMenu.close(); setShowModelPanel(false); }}
                    >
                      <span className="model-selector-option-label">{m.displayName || m.model}</span>
                      {m.id === selectedModelId && <Check size={13} className="model-selector-check" />}
                    </PopoverMenuItem>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {codexArgsOptions.length > 1 && onSelectCodexArgsOverride && (
          <div className="composer-select-wrap">
            <span className="composer-icon" aria-hidden>
              <SlidersHorizontal size={14} strokeWidth={1.8} />
            </span>
            <select
              className="composer-select composer-select--approval"
              aria-label={tx("Codex args profile")}
              disabled={disabled}
              value={selectedCodexArgsOverride ?? ""}
              onChange={(event) =>
                onSelectCodexArgsOverride(event.target.value || null)
              }
            >
              {codexArgsOptions.map((option) => (
                <option key={option.value || "default"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className={`composer-select-wrap${accessModeClass ? ` ${accessModeClass}` : ""}`}>
          <span className="composer-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 4l7 3v5c0 4.5-3 7.5-7 8-4-0.5-7-3.5-7-8V7l7-3z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path
                d="M9.5 12.5l1.8 1.8 3.7-4"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <select
            className="composer-select composer-select--approval"
            aria-label={tx("Agent access")}
            disabled={disabled}
            value={accessMode}
            onChange={(event) =>
              onSelectAccessMode(event.target.value as AccessMode)
            }
          >
            <option value="read-only">{tx("Read only")}</option>
            <option value="current">{tx("On-Request")}</option>
            <option value="full-access">{tx("Full access")}</option>
          </select>
        </div>
      </div>
      <div className="composer-context">
        <div
          className="composer-context-ring"
          data-tooltip={
            contextFreePercent === null
              ? tx("Context free --")
              : tx("Context free {percent}%", {
                  percent: Math.round(contextFreePercent),
                })
          }
          aria-label={
            contextFreePercent === null
              ? tx("Context free --")
              : tx("Context free {percent}%", {
                  percent: Math.round(contextFreePercent),
                })
          }
          style={
            {
              "--context-free": contextFreePercent ?? 0,
            } as CSSProperties
          }
        >
          <span className="composer-context-value">●</span>
        </div>
      </div>
    </div>
  );
}
