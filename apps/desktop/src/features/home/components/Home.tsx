import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type {
  AccountSnapshot,
  AccessMode,
  LocalUsageSnapshot,
  RateLimitSnapshot,
  WorkspaceInfo,
} from "../../../types";
import type {
  LatestAgentRun,
  UsageMetric,
  UsageWorkspaceOption,
} from "../homeTypes";
import { useI18n } from "@/i18n";

type HomeModelOption = { id: string; displayName: string; model: string };

type HomeProps = {
  // — 主线:codex 首页 —
  workspaces: WorkspaceInfo[];
  onEnterWorkspaceFromHome: (workspaceId: string, draft: string) => void;
  models: HomeModelOption[];
  selectedModelId: string | null;
  onSelectModel: (modelId: string) => void;
  accessMode: AccessMode;
  onSelectAccessMode: (mode: AccessMode) => void;
  reasoningOptions: string[];
  selectedEffort: string | null;
  onSelectEffort: (effort: string) => void;
  reasoningSupported: boolean;
  onAddWorkspace: () => void;
  // — 以下为仪表盘旧 props,保留以维持上游 homeProps 组装不变(首页不再渲染) —
  onAddWorkspaceFromUrl: () => void;
  latestAgentRuns: LatestAgentRun[];
  isLoadingLatestAgents: boolean;
  localUsageSnapshot: LocalUsageSnapshot | null;
  isLoadingLocalUsage: boolean;
  localUsageError: string | null;
  onRefreshLocalUsage: () => void;
  usageMetric: UsageMetric;
  onUsageMetricChange: (metric: UsageMetric) => void;
  usageWorkspaceId: string | null;
  usageWorkspaceOptions: UsageWorkspaceOption[];
  onUsageWorkspaceChange: (workspaceId: string | null) => void;
  accountRateLimits: RateLimitSnapshot | null;
  usageShowRemaining: boolean;
  accountInfo: AccountSnapshot | null;
  onSelectThread: (workspaceId: string, threadId: string) => void;
};

export function Home({
  workspaces,
  onEnterWorkspaceFromHome,
  models,
  selectedModelId,
  onSelectModel,
  accessMode,
  onSelectAccessMode,
  reasoningOptions,
  selectedEffort,
  onSelectEffort,
  reasoningSupported,
  onAddWorkspace,
}: HomeProps) {
  const { tx } = useI18n();
  const [draft, setDraft] = useState("");
  const [pickedWorkspaceId, setPickedWorkspaceId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 默认选中第一个工作区(工作区异步加载完成后)
  useEffect(() => {
    if (!pickedWorkspaceId && workspaces.length > 0) {
      setPickedWorkspaceId(workspaces[0].id);
    }
  }, [pickedWorkspaceId, workspaces]);

  const effectiveWorkspaceId =
    pickedWorkspaceId && workspaces.some((w) => w.id === pickedWorkspaceId)
      ? pickedWorkspaceId
      : workspaces[0]?.id ?? null;

  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId) ?? null,
    [models, selectedModelId],
  );
  const selectedModelLabel =
    selectedModel?.displayName || selectedModel?.model || tx("No models");

  const canSend = draft.trim().length > 0 && Boolean(effectiveWorkspaceId);

  const handleSend = () => {
    if (!canSend || !effectiveWorkspaceId) {
      return;
    }
    onEnterWorkspaceFromHome(effectiveWorkspaceId, draft.trim());
    setDraft("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="home home-codex">
      <div className="home-codex-inner">
        <h1 className="home-codex-greeting">{tx("What should we do?")}</h1>

        <div className="home-prompt-card">
          <div className="home-prompt-input-row">
            <textarea
              ref={textareaRef}
              className="home-prompt-textarea"
              placeholder={tx("Type anything")}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />
          </div>

          <div className="home-prompt-bar">
            <div className="home-prompt-meta">
              <button
                type="button"
                className="composer-attach home-prompt-attach"
                aria-label={tx("Add attachment")}
                title={tx("Available after you enter a project")}
                disabled
              >
                +
              </button>

              <div className="composer-select-wrap">
                <span className="composer-icon home-prompt-access-icon" aria-hidden>
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
                  value={accessMode}
                  onChange={(e) => onSelectAccessMode(e.target.value as AccessMode)}
                >
                  <option value="read-only">{tx("Read only")}</option>
                  <option value="current">{tx("On-Request")}</option>
                  <option value="full-access">{tx("Full access")}</option>
                </select>
              </div>
            </div>

            <div className="home-prompt-actions">
              <div className="composer-select-wrap composer-select-wrap--model">
                <span className="composer-icon composer-icon--model" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M12 4v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <path
                      d="M8 7.5h8a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5H8A2.5 2.5 0 0 1 5.5 15v-5A2.5 2.5 0 0 1 8 7.5Z"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                    <circle cx="9.5" cy="12.5" r="1" fill="currentColor" />
                    <circle cx="14.5" cy="12.5" r="1" fill="currentColor" />
                    <path d="M9.5 15.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <path d="M5.5 11H4M20 11h-1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </span>
                <select
                  className="composer-select composer-select--model"
                  aria-label={tx("Model")}
                  value={selectedModelId ?? ""}
                  onChange={(e) => onSelectModel(e.target.value)}
                  style={
                    {
                      "--composer-model-select-width": `${Math.max(
                        selectedModelLabel.length + 2,
                        8,
                      )}ch`,
                    } as React.CSSProperties
                  }
                >
                  {models.length === 0 && <option value="">{tx("No models")}</option>}
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.displayName || model.model}
                    </option>
                  ))}
                </select>
              </div>

              {reasoningSupported && reasoningOptions.length > 0 && (
                <div className="composer-select-wrap composer-select-wrap--effort">
                  <select
                    className="composer-select composer-select--effort"
                    aria-label={tx("Thinking mode")}
                    value={selectedEffort ?? ""}
                    onChange={(e) => onSelectEffort(e.target.value)}
                  >
                    {reasoningOptions.map((effort) => (
                      <option key={effort} value={effort}>
                        {effort}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                className="composer-action is-send home-prompt-send"
                aria-label={tx("Send")}
                title={tx("Send")}
                onClick={handleSend}
                disabled={!canSend}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 5l6 6m-6-6L6 11m6-6v14"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="home-codex-footer">
          {workspaces.length > 0 ? (
            <div className="composer-select-wrap home-project-picker">
              <span className="composer-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <select
                className="composer-select"
                aria-label={tx("Enter project work")}
                value={effectiveWorkspaceId ?? ""}
                onChange={(e) => setPickedWorkspaceId(e.target.value)}
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <button
              type="button"
              className="home-project-add"
              onClick={onAddWorkspace}
            >
              <span className="composer-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              {tx("Enter project work")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
