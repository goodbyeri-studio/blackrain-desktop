import { useEffect, useMemo, useState } from "react";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import Copy from "lucide-react/dist/esm/icons/copy";
import X from "lucide-react/dist/esm/icons/x";

import { revealPathInFileManager } from "@/services/tauri";
import type { WorkspaceInfo } from "@/types";
import { PanelFrame } from "@/features/design-system/components/panel/PanelPrimitives";
import type { useWorkController } from "../hooks/useWorkController";
import {
  selectCanResume,
  selectCanStop,
  buildVisibleWorkEvents,
  selectOrderedTasks,
  selectPendingApproval,
  selectSelectedTask,
  selectTaskEvents,
} from "../state/selectors";
import type { HermesRuntimeDiagnostics, WorkTaskStatus } from "../types";
import { WorkApprovalCard } from "./WorkApprovalCard";
import { WorkComposer } from "./WorkComposer";
import { WorkEventRow } from "./WorkEventRow";
import { WorkRuntimeBanner } from "./WorkRuntimeBanner";
import { WorkTaskSidebar } from "./WorkTaskSidebar";

type WorkController = ReturnType<typeof useWorkController>;

type WorkSurfaceProps = {
  controller: WorkController;
  workspaces: WorkspaceInfo[];
  onClose: () => void;
};

function isTerminal(status: WorkTaskStatus | undefined) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function isSettled(status: WorkTaskStatus | undefined) {
  return isTerminal(status) || status === "orphaned";
}

export function WorkSurface({ controller, workspaces, onClose }: WorkSurfaceProps) {
  const { state } = controller;
  const tasks = selectOrderedTasks(state);
  const selectedTask = selectSelectedTask(state);
  const events = selectTaskEvents(state, state.selectedTaskId);
  const visibleEvents = useMemo(() => buildVisibleWorkEvents(events), [events]);
  const approval = selectPendingApproval(state, state.selectedTaskId);
  const [draft, setDraft] = useState("");
  const [projectPath, setProjectPath] = useState(() => workspaces[0]?.path ?? "");
  const [diagnostics, setDiagnostics] = useState<HermesRuntimeDiagnostics | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);
  const pending = Object.keys(state.pendingOperations).length > 0;
  const busy = state.bootstrapping || pending;
  const selectedProjectPath = selectedTask?.projectPath ?? projectPath;
  const running = Boolean(selectedTask && !isSettled(selectedTask.status));
  const canStop = selectCanStop(selectedTask);
  const canResume = selectedTask?.status === "degraded" && selectCanResume(selectedTask);

  const diagnosticsText = useMemo(
    () => (diagnostics ? JSON.stringify(diagnostics, null, 2) : ""),
    [diagnostics],
  );

  useEffect(() => {
    if (!projectPath && workspaces[0]?.path) {
      setProjectPath(workspaces[0].path);
    }
  }, [projectPath, workspaces]);

  const handleSelectTask = async (taskId: string) => {
    controller.selectTask(taskId);
    await controller.loadTask(taskId).catch(() => undefined);
  };

  const handleNewTask = () => {
    controller.selectTask(null);
    setDraft("");
  };

  const handleSubmit = async () => {
    const prompt = draft.trim();
    if (!prompt) {
      return;
    }
    if (state.runtime?.state !== "ready") {
      await controller.startRuntime();
    }
    if (selectedTask && isTerminal(selectedTask.status)) {
      await controller.continueTask({ taskId: selectedTask.taskId, prompt });
    } else if (!selectedTask) {
      if (!projectPath) {
        return;
      }
      await controller.startTask({
        workbenchId: "office-agent",
        workbenchVersion: "0.1.0",
        projectPath,
        prompt,
      });
    } else {
      return;
    }
    setDraft("");
  };

  const handleDiagnostics = async () => {
    setDiagnosticsOpen(true);
    const next = await controller.loadDiagnostics().catch(() => null);
    setDiagnostics(next);
  };

  const handleCopyDiagnostics = async () => {
    if (!diagnosticsText) {
      return;
    }
    await navigator.clipboard.writeText(diagnosticsText);
    setCopiedDiagnostics(true);
    window.setTimeout(() => setCopiedDiagnostics(false), 1200);
  };

  return (
    <main className="work-surface">
      <header className="work-surface-header">
        <button type="button" className="ghost icon-button" onClick={onClose} aria-label="返回首页">
          <ArrowLeft aria-hidden />
        </button>
        <div>
          <strong>Office 工作台</strong>
          <span>{selectedTask ? selectedTask.projectPath : "由 Hermes Agent 执行"}</span>
        </div>
      </header>

      <div className="work-surface-body">
        <WorkTaskSidebar
          tasks={tasks}
          selectedTaskId={state.selectedTaskId}
          onSelectTask={(taskId) => void handleSelectTask(taskId)}
          onNewTask={handleNewTask}
        />

        <section className="work-conversation">
          <WorkRuntimeBanner
            runtime={state.runtime}
            busy={busy}
            onStart={() => void controller.startRuntime()}
            onRestart={() => void controller.restartRuntime()}
            onRepair={() => void controller.repairRuntime()}
            onDiagnostics={() => void handleDiagnostics()}
          />

          {state.lastError ? (
            <div className="work-error-banner" role="alert">
              <div>
                <strong>{state.lastError.code}</strong>
                <span>{state.lastError.message}</span>
              </div>
              <button type="button" className="ghost icon-button" onClick={controller.clearError} aria-label="关闭错误">
                <X aria-hidden />
              </button>
            </div>
          ) : null}

          <div className="work-transcript" aria-live="polite">
            {visibleEvents.length === 0 ? (
              <div className="work-welcome">
                <h1>{selectedTask ? "任务还没有可展示的事件" : "让 Office 工作台替你完成复杂工作"}</h1>
                <p>选择项目目录，描述目标。BlackRain 会启动隔离的 Hermes runtime，并在执行高影响操作前请求你的确认。</p>
                {!selectedTask ? (
                  <label className="work-project-picker">
                    <span>项目</span>
                    <select value={projectPath} onChange={(event) => setProjectPath(event.target.value)}>
                      <option value="" disabled>选择一个项目</option>
                      {workspaces.map((workspace) => (
                        <option key={workspace.id} value={workspace.path}>{workspace.name}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            ) : (
              <div className="work-event-list">
                {visibleEvents.map((event) => (
                  <WorkEventRow
                    key={event.eventId}
                    event={event}
                    projectPath={selectedProjectPath}
                    onOpenOutput={(path) => void revealPathInFileManager(path)}
                  />
                ))}
              </div>
            )}
          </div>

          {approval && selectedTask ? (
            <WorkApprovalCard
              approval={approval}
              busy={busy}
              onChoose={(choice) => void controller.approveTask(selectedTask.taskId, choice)}
            />
          ) : null}

          <WorkComposer
            value={draft}
            disabled={busy || (!selectedTask && !projectPath) || selectedTask?.status === "orphaned"}
            running={running}
            canStop={canStop}
            canResume={canResume}
            onChange={setDraft}
            onSubmit={() => void handleSubmit()}
            onStop={() => selectedTask && void controller.stopTask(selectedTask.taskId)}
            onResume={() => selectedTask && void controller.resumeTask(selectedTask.taskId)}
          />
        </section>
      </div>

      {diagnosticsOpen ? (
        <PanelFrame className="work-diagnostics">
          <header>
            <div>
              <strong>Hermes 诊断</strong>
              <span>内容由 Core 脱敏后返回</span>
            </div>
            <div>
              <button type="button" className="ghost" disabled={!diagnosticsText} onClick={() => void handleCopyDiagnostics()}>
                <Copy aria-hidden />
                {copiedDiagnostics ? "已复制" : "复制"}
              </button>
              <button type="button" className="ghost icon-button" onClick={() => setDiagnosticsOpen(false)} aria-label="关闭诊断">
                <X aria-hidden />
              </button>
            </div>
          </header>
          <pre>{diagnosticsText || "正在读取诊断…"}</pre>
        </PanelFrame>
      ) : null}
    </main>
  );
}
