import { useEffect, useRef, useState, type KeyboardEvent } from "react";
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
import { HomeAccessMenu } from "./HomeAccessMenu";
import { HomeModelMenu } from "./HomeModelMenu";
import { HomeProjectMenu } from "./HomeProjectMenu";

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
  onAddWorkspaceFromUrl: () => void;
  // — 以下为仪表盘旧 props,保留以维持上游 homeProps 组装不变(首页不再渲染) —
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
  onAddWorkspaceFromUrl,
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

  const handleEnterWorkspace = (workspaceId: string) => {
    setPickedWorkspaceId(workspaceId);
    onEnterWorkspaceFromHome(workspaceId, draft.trim());
    setDraft("");
  };

  return (
    <div className="home home-codex">
      <div className="home-codex-inner">
        <h1 className="home-codex-greeting">{tx("What should we do?")}</h1>

        <div className="home-prompt-card">
          <div className="home-prompt-main">
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
                  className="home-prompt-attach"
                  aria-label={tx("Add attachment")}
                  title={tx("Available after you enter a project")}
                  disabled
                >
                  +
                </button>
                <HomeAccessMenu
                  accessMode={accessMode}
                  onSelectAccessMode={onSelectAccessMode}
                />
              </div>

              <div className="home-prompt-actions">
                <span
                  className="home-context-ring"
                  data-tooltip={tx("Background info window:")}
                  aria-hidden
                />
                <HomeModelMenu
                  models={models}
                  selectedModelId={selectedModelId}
                  onSelectModel={onSelectModel}
                  reasoningOptions={reasoningOptions}
                  selectedEffort={selectedEffort}
                  onSelectEffort={onSelectEffort}
                  reasoningSupported={reasoningSupported}
                />
                <button
                  type="button"
                  className="home-prompt-send"
                  aria-label={tx("Send")}
                  title={tx("Send")}
                  onClick={handleSend}
                  disabled={!canSend}
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M12 19V5M12 5l-6 6M12 5l6 6"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="home-project-row">
            <HomeProjectMenu
              workspaces={workspaces}
              onEnterWorkspace={handleEnterWorkspace}
              onAddWorkspace={onAddWorkspace}
              onAddWorkspaceFromUrl={onAddWorkspaceFromUrl}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
