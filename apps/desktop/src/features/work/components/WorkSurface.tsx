import { useEffect, useMemo, useRef, useState } from "react";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import Copy from "lucide-react/dist/esm/icons/copy";
import FolderOpen from "lucide-react/dist/esm/icons/folder-open";
import Power from "lucide-react/dist/esm/icons/power";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import X from "lucide-react/dist/esm/icons/x";

import {
  pickWorkProjectFiles,
  pickWorkspacePath,
  revealPathInFileManager,
} from "@/services/tauri";
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
import { WorkFollowUpQueue } from "./WorkFollowUpQueue";
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
  const [editingFollowUpId, setEditingFollowUpId] = useState<string | null>(null);
  const [activationId, setActivationId] = useState(
    () => state.activations[0]?.activationId ?? "",
  );
  const [diagnostics, setDiagnostics] = useState<HermesRuntimeDiagnostics | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);
  const [deactivationOpen, setDeactivationOpen] = useState(false);
  const [taskDeletionOpen, setTaskDeletionOpen] = useState(false);
  const [activationOpen, setActivationOpen] = useState(false);
  const [activationProjectPath, setActivationProjectPath] = useState("");
  const [composerFocusRequestId, setComposerFocusRequestId] = useState(0);
  const diagnosticsCloseRef = useRef<HTMLButtonElement | null>(null);
  const diagnosticsReturnFocusRef = useRef<HTMLElement | null>(null);
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
  const followUps = selectedTask
    ? state.tasks[selectedTask.taskId]?.followUps ?? []
    : [];

  const diagnosticsText = useMemo(
    () => (diagnostics ? JSON.stringify(diagnostics, null, 2) : ""),
    [diagnostics],
  );

  useEffect(() => {
    if (!activationId && state.activations[0]?.activationId) {
      setActivationId(state.activations[0].activationId);
    }
  }, [activationId, state.activations]);

  useEffect(() => {
    if (!diagnosticsOpen) {
      return undefined;
    }
    diagnosticsCloseRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDiagnosticsOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (diagnosticsReturnFocusRef.current?.isConnected) {
        diagnosticsReturnFocusRef.current.focus();
      }
      diagnosticsReturnFocusRef.current = null;
    };
  }, [diagnosticsOpen]);

  const handleSelectTask = async (taskId: string) => {
    controller.selectTask(taskId);
    setProjectFileRefs([]);
    setAttachmentError(null);
    setEditingFollowUpId(null);
    await controller.loadTask(taskId).catch(() => undefined);
  };

  const handleNewTask = () => {
    controller.selectTask(null);
    setDraft("");
    setProjectFileRefs([]);
    setAttachmentError(null);
    setEditingFollowUpId(null);
    setComposerFocusRequestId((current) => current + 1);
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
    if (selectedTask && editingFollowUpId) {
      await controller.editFollowUp({
        taskId: selectedTask.taskId,
        followUpId: editingFollowUpId,
        prompt,
        projectFileRefs,
      });
    } else if (selectedTask && running) {
      await controller.enqueueFollowUp({
        taskId: selectedTask.taskId,
        prompt,
        projectFileRefs,
      });
    } else if (selectedTask && isTerminal(selectedTask.status)) {
      if (state.runtime?.state !== "ready") {
        await controller.startRuntime();
      }
      await controller.continueTask({
        taskId: selectedTask.taskId,
        prompt,
        projectFileRefs,
      });
    } else if (!selectedTask) {
      if (!selectedActivation) {
        return;
      }
      if (state.runtime?.state !== "ready") {
        await controller.startRuntime();
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
    setEditingFollowUpId(null);
  };

  const handleDiagnostics = async () => {
    diagnosticsReturnFocusRef.current = document.activeElement as HTMLElement | null;
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

  const handleChooseActivationProject = async () => {
    const projectPath = await pickWorkspacePath().catch(() => null);
    if (!projectPath) {
      return;
    }
    setActivationProjectPath(projectPath);
    setActivationOpen(true);
  };

  const handleActivateOfficialWorkbench = async () => {
    if (!state.bundledOffice || !activationProjectPath) {
      return;
    }
    const result = await controller.activateOfficialWorkbench(
      state.bundledOffice.manifest.id,
      activationProjectPath,
    );
    setActivationId(result.activation.activationId);
    setActivationOpen(false);
    setActivationProjectPath("");
  };

  const handleDeleteTask = async () => {
    if (!selectedTask) {
      return;
    }
    const removed = await controller.deleteTaskMetadata(selectedTask.taskId);
    if (removed) {
      setDraft("");
      setProjectFileRefs([]);
      setAttachmentError(null);
      setEditingFollowUpId(null);
      setTaskDeletionOpen(false);
    }
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
        <div className="work-surface-header-actions">
          {selectedTask && isSettled(selectedTask.status) ? (
            <button
              type="button"
              className="ghost work-delete-task-button"
              disabled={busy}
              onClick={() => setTaskDeletionOpen(true)}
              aria-label="删除记录"
              title="删除记录"
            >
              <Trash2 aria-hidden />
              删除记录
            </button>
          ) : null}
          {deactivationActivation ? (
            <button
              type="button"
              className="ghost work-deactivate-button"
              disabled={busy}
              onClick={() => setDeactivationOpen(true)}
              aria-label="停用"
              title="停用"
            >
              <Power aria-hidden />
              停用
            </button>
          ) : null}
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

          <div
            className="work-transcript"
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            aria-atomic="false"
          >
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
                {!selectedActivation && state.bundledOffice ? (
                  <div className="work-package-plan" aria-label="Office 工作台安装计划">
                    <strong>
                      {state.bundledOffice.manifest.name}@
                      {state.bundledOffice.manifest.version}
                    </strong>
                    <span>{state.bundledOffice.manifest.description}</span>
                    <small>
                      Windows x64 · {state.bundledOffice.manifest.skills.length} 个 Skills ·{" "}
                      {state.bundledOffice.manifest.dependencies.length} 个受控依赖 · 卸载保留项目
                    </small>
                    <button
                      type="button"
                      className="primary"
                      disabled={busy}
                      onClick={() => void handleChooseActivationProject()}
                    >
                      <FolderOpen aria-hidden />
                      选择项目并安装激活
                    </button>
                  </div>
                ) : null}
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

          <WorkFollowUpQueue
            items={followUps}
            busy={busy}
            editingId={editingFollowUpId}
            onEdit={(item) => {
              setEditingFollowUpId(item.followUpId);
              setDraft(item.prompt);
              setProjectFileRefs(item.projectFileRefs);
              setAttachmentError(null);
              setComposerFocusRequestId((current) => current + 1);
            }}
            onCancel={(followUpId) => {
              if (!selectedTask) {
                return;
              }
              if (editingFollowUpId === followUpId) {
                setEditingFollowUpId(null);
                setDraft("");
                setProjectFileRefs([]);
              }
              void controller.cancelFollowUp(selectedTask.taskId, followUpId);
            }}
            onRetry={(followUpId) =>
              selectedTask && void controller.retryFollowUp(selectedTask.taskId, followUpId)
            }
          />

          <WorkComposer
            value={draft}
            disabled={busy || (!selectedTask && !selectedActivation) || selectedTask?.status === "orphaned"}
            running={running}
            canStop={canStop}
            canResume={canResume}
            projectFileRefs={projectFileRefs}
            canAttach={Boolean(selectedProjectPath) && projectFileRefs.length < 16}
            attachmentError={attachmentError}
            focusRequestId={composerFocusRequestId}
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
        <PanelFrame
          className="work-diagnostics"
          aria-labelledby="work-diagnostics-title"
        >
          <header>
            <div>
              <strong id="work-diagnostics-title">Hermes 诊断</strong>
              <span>内容由 Core 脱敏后返回</span>
            </div>
            <div>
              <button type="button" className="ghost" disabled={!diagnosticsText} onClick={() => void handleCopyDiagnostics()}>
                <Copy aria-hidden />
                {copiedDiagnostics ? "已复制" : "复制"}
              </button>
              <button
                ref={diagnosticsCloseRef}
                type="button"
                className="ghost icon-button"
                onClick={() => setDiagnosticsOpen(false)}
                aria-label="关闭诊断"
              >
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
          onEscapeKeyDown={() => {
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

      {activationOpen && state.bundledOffice ? (
        <ModalShell
          ariaLabelledBy="work-activation-title"
          ariaDescribedBy="work-activation-description"
          onBackdropClick={() => {
            if (!busy) {
              setActivationOpen(false);
            }
          }}
          onEscapeKeyDown={() => {
            if (!busy) {
              setActivationOpen(false);
            }
          }}
        >
          <div id="work-activation-title" className="ds-modal-title">
            安装并激活 Office 工作台？
          </div>
          <div id="work-activation-description" className="ds-modal-subtitle">
            BlackRain 将校验并安装 {state.bundledOffice.manifest.name}@
            {state.bundledOffice.manifest.version}、
            {state.bundledOffice.manifest.skills.length} 个受控 Skills 和 OfficeCLI 1.0.117，
            并授予对项目目录 {activationProjectPath} 的读写权限。该版本不声明网络访问；停用或卸载时保留项目文件。
          </div>
          <div className="ds-modal-actions">
            <button
              type="button"
              className="ghost ds-modal-button"
              disabled={busy}
              onClick={() => setActivationOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="primary ds-modal-button"
              disabled={busy}
              onClick={() => void handleActivateOfficialWorkbench()}
            >
              {busy ? "正在校验并激活…" : "确认权限并激活"}
            </button>
          </div>
        </ModalShell>
      ) : null}

      {taskDeletionOpen && selectedTask ? (
        <ModalShell
          ariaLabelledBy="work-task-deletion-title"
          ariaDescribedBy="work-task-deletion-description"
          onBackdropClick={() => {
            if (!busy) {
              setTaskDeletionOpen(false);
            }
          }}
          onEscapeKeyDown={() => {
            if (!busy) {
              setTaskDeletionOpen(false);
            }
          }}
        >
          <div id="work-task-deletion-title" className="ds-modal-title">
            删除本地任务记录？
          </div>
          <div id="work-task-deletion-description" className="ds-modal-subtitle">
            只会删除 BlackRain 保存的任务元数据、消息日志和后续任务队列。不会删除项目目录
            {` ${selectedTask.projectPath}`} 或其中的输出文件，也不会停用工作台。
          </div>
          <div className="ds-modal-actions">
            <button
              type="button"
              className="ghost ds-modal-button"
              disabled={busy}
              onClick={() => setTaskDeletionOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="primary ds-modal-button"
              disabled={busy}
              onClick={() => void handleDeleteTask()}
            >
              {busy ? "正在删除…" : "确认删除记录"}
            </button>
          </div>
        </ModalShell>
      ) : null}
    </main>
  );
}
