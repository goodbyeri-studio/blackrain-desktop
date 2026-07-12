import { useEffect, useMemo, useState } from "react";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import Copy from "lucide-react/dist/esm/icons/copy";
import Power from "lucide-react/dist/esm/icons/power";
import X from "lucide-react/dist/esm/icons/x";

import { pickWorkProjectFiles, revealPathInFileManager } from "@/services/tauri";
import { ModalShell } from "@/features/design-system/components/modal/ModalShell";
import { PanelFrame } from "@/features/design-system/components/panel/PanelPrimitives";
import type { useWorkController } from "../hooks/useWorkController";
import {
  selectCanResume,
  selectCanStop,
  buildVisibleWorkEvents,
  resolveProjectOutputPath,
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
  onClose: () => void;
};

function isTerminal(status: WorkTaskStatus | undefined) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function isSettled(status: WorkTaskStatus | undefined) {
  return isTerminal(status) || status === "orphaned";
}

export function WorkSurface({ controller, onClose }: WorkSurfaceProps) {
  const { state } = controller;
  const tasks = selectOrderedTasks(state);
  const selectedTask = selectSelectedTask(state);
  const events = selectTaskEvents(state, state.selectedTaskId);
  const visibleEvents = useMemo(() => buildVisibleWorkEvents(events), [events]);
  const approval = selectPendingApproval(state, state.selectedTaskId);
  const [draft, setDraft] = useState("");
  const [projectFileRefs, setProjectFileRefs] = useState<string[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [activationId, setActivationId] = useState(
    () => state.activations[0]?.activationId ?? "",
  );
  const [diagnostics, setDiagnostics] = useState<HermesRuntimeDiagnostics | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);
  const [deactivationOpen, setDeactivationOpen] = useState(false);
  const pending = Object.keys(state.pendingOperations).length > 0;
  const busy = state.bootstrapping || pending;
  const selectedActivation =
    state.activations.find((activation) => activation.activationId === activationId) ??
    state.activations[0] ??
    null;
  const selectedProjectPath = selectedTask?.projectPath ?? selectedActivation?.project.path ?? "";
  const deactivationActivation = selectedTask?.activationId
    ? state.activations.find(
        (activation) => activation.activationId === selectedTask.activationId,
      ) ?? null
    : selectedActivation;
  const running = Boolean(selectedTask && !isSettled(selectedTask.status));
  const canStop = selectCanStop(selectedTask);
  const canResume = selectedTask?.status === "degraded" && selectCanResume(selectedTask);

  const diagnosticsText = useMemo(
    () => (diagnostics ? JSON.stringify(diagnostics, null, 2) : ""),
    [diagnostics],
  );

  useEffect(() => {
    if (!activationId && state.activations[0]?.activationId) {
      setActivationId(state.activations[0].activationId);
    }
  }, [activationId, state.activations]);

  const handleSelectTask = async (taskId: string) => {
    controller.selectTask(taskId);
    setProjectFileRefs([]);
    setAttachmentError(null);
    await controller.loadTask(taskId).catch(() => undefined);
  };

  const handleNewTask = () => {
    controller.selectTask(null);
    setDraft("");
    setProjectFileRefs([]);
    setAttachmentError(null);
  };

  const handleAddProjectFiles = async () => {
    if (!selectedProjectPath) {
      return;
    }
    const selected = await pickWorkProjectFiles(selectedProjectPath).catch(() => {
      setAttachmentError("无法打开项目文件选择器，请稍后重试。");
      return [];
    });
    if (selected.length === 0) {
      return;
    }
    const accepted = selected.filter((path) =>
      Boolean(resolveProjectOutputPath(selectedProjectPath, path)),
    );
    const merged = Array.from(new Set([...projectFileRefs, ...accepted]));
    setAttachmentError(
      accepted.length !== selected.length
        ? "只能引用当前已验证项目目录内的文件。"
        : merged.length > 16
          ? "每次任务最多引用 16 个项目文件。"
          : null,
    );
    setProjectFileRefs(merged.slice(0, 16));
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
      await controller.continueTask({
        taskId: selectedTask.taskId,
        prompt,
        projectFileRefs,
      });
    } else if (!selectedTask) {
      if (!selectedActivation) {
        return;
      }
      await controller.startTask({
        activationId: selectedActivation.activationId,
        prompt,
        projectFileRefs,
      });
    } else {
      return;
    }
    setDraft("");
    setProjectFileRefs([]);
    setAttachmentError(null);
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

  const handleDeactivate = async () => {
    if (!deactivationActivation) {
      return;
    }
    await controller.deactivateActivation(deactivationActivation.activationId);
    setActivationId("");
    setDeactivationOpen(false);
  };

  return (
    <main className="work-surface">
      <header className="work-surface-header">
        <button type="button" className="ghost icon-button" onClick={onClose} aria-label="返回首页">
          <ArrowLeft aria-hidden />
        </button>
        <div className="work-surface-title">
          <strong>Office 工作台</strong>
          <span>{selectedTask ? selectedTask.projectPath : "由 Hermes Agent 执行"}</span>
        </div>
        {deactivationActivation ? (
          <button
            type="button"
            className="ghost work-deactivate-button"
            disabled={busy}
            onClick={() => setDeactivationOpen(true)}
          >
            <Power aria-hidden />
            停用
          </button>
        ) : null}
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
                <h1>
                  {selectedTask
                    ? "任务还没有可展示的事件"
                    : selectedActivation
                      ? "让 Office 工作台替你完成复杂工作"
                      : "Office 工作台尚未激活"}
                </h1>
                <p>
                  {selectedActivation
                    ? "选择已验证的工作台项目，描述目标。BlackRain 会启动隔离的 Hermes runtime，并在执行高影响操作前请求你的确认。"
                    : "需要先通过工作台安装、权限审批和健康验证，才能创建正式 WORK 任务。"}
                </p>
                {!selectedTask ? (
                  <label className="work-project-picker">
                    <span>已激活工作台项目</span>
                    <select
                      value={activationId}
                      onChange={(event) => {
                        setActivationId(event.target.value);
                        setProjectFileRefs([]);
                        setAttachmentError(null);
                      }}
                      disabled={state.activations.length === 0}
                    >
                      <option value="" disabled>选择一个已激活项目</option>
                      {state.activations.map((activation) => (
                        <option key={activation.activationId} value={activation.activationId}>
                          {activation.workbenchId} · {activation.project.path}
                        </option>
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
            disabled={busy || (!selectedTask && !selectedActivation) || selectedTask?.status === "orphaned"}
            running={running}
            canStop={canStop}
            canResume={canResume}
            projectFileRefs={projectFileRefs}
            canAttach={Boolean(selectedProjectPath) && projectFileRefs.length < 16}
            attachmentError={attachmentError}
            onChange={setDraft}
            onAddFiles={() => void handleAddProjectFiles()}
            onRemoveFile={(path) =>
              setProjectFileRefs((current) => current.filter((item) => item !== path))
            }
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

      {deactivationOpen && deactivationActivation ? (
        <ModalShell
          ariaLabelledBy="work-deactivation-title"
          ariaDescribedBy="work-deactivation-description"
          onBackdropClick={() => {
            if (!busy) {
              setDeactivationOpen(false);
            }
          }}
        >
          <div id="work-deactivation-title" className="ds-modal-title">
            停用 Office 工作台？
          </div>
          <div id="work-deactivation-description" className="ds-modal-subtitle">
            BlackRain 会停止该激活的运行中任务、关闭 Hermes 与受控 MCP
            进程，并解除 Skills/MCP 注册。你的项目文件会保留在
            {` ${deactivationActivation.project.path}`}。
          </div>
          <div className="ds-modal-actions">
            <button
              type="button"
              className="ghost ds-modal-button"
              disabled={busy}
              onClick={() => setDeactivationOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="primary ds-modal-button"
              disabled={busy}
              onClick={() => void handleDeactivate()}
            >
              {busy ? "正在停用…" : "确认停用"}
            </button>
          </div>
        </ModalShell>
      ) : null}
    </main>
  );
}
