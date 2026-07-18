import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import ArrowDown from "lucide-react/dist/esm/icons/arrow-down";
import Copy from "lucide-react/dist/esm/icons/copy";
import PanelRight from "lucide-react/dist/esm/icons/panel-right";
import PanelLeft from "lucide-react/dist/esm/icons/panel-left";
import Search from "lucide-react/dist/esm/icons/search";
import SquareTerminal from "lucide-react/dist/esm/icons/square-terminal";
import Boxes from "lucide-react/dist/esm/icons/boxes";
import Bot from "lucide-react/dist/esm/icons/bot";
import FolderOpen from "lucide-react/dist/esm/icons/folder-open";
import Power from "lucide-react/dist/esm/icons/power";
import Settings from "lucide-react/dist/esm/icons/settings";
import SwitchCamera from "lucide-react/dist/esm/icons/switch-camera";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import Upload from "lucide-react/dist/esm/icons/upload";
import X from "lucide-react/dist/esm/icons/x";

import {
  pickWorkProjectFiles,
  pickWorkspacePath,
  revealPathInFileManager,
} from "@/services/tauri";
import { ModalShell } from "@/features/design-system/components/modal/ModalShell";
import { PanelFrame } from "@/features/design-system/components/panel/PanelPrimitives";
import type { DictationTranscript } from "@/types";
import type { useWorkController } from "../hooks/useWorkController";
import { useWorkProjectDrop } from "../hooks/useWorkProjectDrop";
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
import type { HermesRuntimeDiagnostics, WorkTask, WorkTaskStatus } from "../types";
import { WorkApprovalCard } from "./WorkApprovalCard";
import { WorkAgentPanel } from "./WorkAgentPanel";
import { WorkComposer } from "./WorkComposer";
import { WorkCommandPalette, type WorkCommand } from "./WorkCommandPalette";
import { WorkEventRow } from "./WorkEventRow";
import { WorkFollowUpQueue } from "./WorkFollowUpQueue";
import { WorkModelPicker } from "./WorkModelPicker";
import { WorkRuntimeBanner } from "./WorkRuntimeBanner";
import { WorkResourceRail, type WorkRailTab } from "./WorkResourceRail";
import { WorkSessionPicker } from "./WorkSessionPicker";
import { WorkTaskSidebar } from "./WorkTaskSidebar";

type WorkController = ReturnType<typeof useWorkController>;

type WorkSurfaceProps = {
  controller: WorkController;
  onClose: () => void;
  onOpenSettings?: () => void;
  dictationEnabled?: boolean;
  dictationState?: "idle" | "listening" | "processing";
  dictationLevel?: number;
  dictationTranscript?: DictationTranscript | null;
  dictationError?: string | null;
  dictationHint?: string | null;
  onToggleDictation?: () => void;
  onCancelDictation?: () => void;
  onOpenDictationSettings?: () => void;
  onDictationTranscriptHandled?: (id: string) => void;
  onDismissDictationError?: () => void;
  onDismissDictationHint?: () => void;
};

function isTerminal(status: WorkTaskStatus | undefined) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function isSettled(status: WorkTaskStatus | undefined) {
  return isTerminal(status) || status === "orphaned";
}

export function WorkSurface({
  controller,
  onClose,
  onOpenSettings = () => undefined,
  dictationEnabled = false,
  dictationState = "idle",
  dictationLevel = 0,
  dictationTranscript = null,
  dictationError = null,
  dictationHint = null,
  onToggleDictation,
  onCancelDictation,
  onOpenDictationSettings,
  onDictationTranscriptHandled,
  onDismissDictationError,
  onDismissDictationHint,
}: WorkSurfaceProps) {
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
  const [renamingTask, setRenamingTask] = useState<WorkTask | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [activationOpen, setActivationOpen] = useState(false);
  const [activationProjectPath, setActivationProjectPath] = useState("");
  const [resourceRailOpen, setResourceRailOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [resourceRailTab, setResourceRailTab] = useState<WorkRailTab>("files");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const [transcriptAtBottom, setTranscriptAtBottom] = useState(true);
  const [composerFocusRequestId, setComposerFocusRequestId] = useState(0);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const diagnosticsCloseRef = useRef<HTMLButtonElement | null>(null);
  const surfaceRef = useRef<HTMLElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
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
  const activeActivation = selectedTask?.activationId
    ? state.activations.find((activation) => activation.activationId === selectedTask.activationId) ?? null
    : selectedActivation;
  const skillNames = useMemo(
    () =>
      activeActivation?.skillRoots.map((path) => {
        const segments = path.split(/[\\/]/).filter(Boolean);
        return segments[segments.length - 1] ?? path;
      }) ?? [],
    [activeActivation],
  );
  const running = Boolean(selectedTask && !isSettled(selectedTask.status));
  const canStop = selectCanStop(selectedTask);
  const canResume = selectedTask?.status === "degraded" && selectCanResume(selectedTask);
  const followUps = selectedTask
    ? state.tasks[selectedTask.taskId]?.followUps ?? []
    : [];
  const latestUsage = [...events]
    .reverse()
    .find((event) => event.type === "usageUpdated");

  const handleDroppedProjectFiles = useCallback((paths: string[], rejectedCount: number) => {
    const merged = Array.from(new Set([...projectFileRefs, ...paths]));
    setProjectFileRefs(merged.slice(0, 16));
    setAttachmentError(
      rejectedCount > 0
        ? "只能拖入当前已验证项目目录内的文件。"
        : merged.length > 16
          ? "每次任务最多引用 16 个项目文件。"
          : null,
    );
  }, [projectFileRefs]);
  const dropState = useWorkProjectDrop({
    targetRef: surfaceRef,
    projectPath: selectedProjectPath,
    disabled:
      busy || !selectedProjectPath || projectFileRefs.length >= 16 || selectedTask?.status === "orphaned",
    onDropFiles: handleDroppedProjectFiles,
  });

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
    const taskModel = selectedTask?.model ?? null;
    if (taskModel) {
      setSelectedModel(taskModel);
      return;
    }
    if (!selectedModel && state.models[0]?.id) {
      setSelectedModel(state.models[0].id);
    }
  }, [selectedModel, selectedTask?.model, state.models]);

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

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript) {
      return;
    }
    if (visibleEvents.length === 0) {
      transcript.scrollTo?.({ top: 0 });
      return;
    }
    if (!transcriptAtBottom) {
      return;
    }
    transcript.scrollTo?.({ top: transcript.scrollHeight, behavior: "smooth" });
  }, [transcriptAtBottom, visibleEvents.length]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "p") {
        event.preventDefault();
        setSessionPickerOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

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
        model: selectedModel,
      });
    } else if (selectedTask && running) {
      await controller.enqueueFollowUp({
        taskId: selectedTask.taskId,
        prompt,
        projectFileRefs,
        model: selectedModel,
      });
    } else if (selectedTask && isTerminal(selectedTask.status)) {
      if (state.runtime?.state !== "ready") {
        await controller.startRuntime();
      }
      await controller.continueTask({
        taskId: selectedTask.taskId,
        prompt,
        projectFileRefs,
        model: selectedModel,
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
        model: selectedModel,
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

  const handleRenameTask = async () => {
    if (!renamingTask || !renameDraft.trim()) {
      return;
    }
    await controller.updateTaskMetadata({
      taskId: renamingTask.taskId,
      title: renameDraft.trim(),
    });
    setRenamingTask(null);
    setRenameDraft("");
  };

  const showResourceTab = (tab: WorkRailTab) => {
    setResourceRailTab(tab);
    setResourceRailOpen(true);
  };
  const commands: WorkCommand[] = [
    {
      id: "models",
      label: "选择模型",
      detail: "使用当前 Hermes runtime 暴露的模型",
      icon: <Bot aria-hidden />,
      onSelect: () => setModelPickerOpen(true),
    },
    {
      id: "sessions",
      label: "切换任务",
      detail: "搜索并恢复已有 WORK 任务",
      icon: <SwitchCamera aria-hidden />,
      onSelect: () => setSessionPickerOpen(true),
    },
    {
      id: "artifacts",
      label: "打开成果",
      detail: "查看当前任务登记的输出",
      icon: <FolderOpen aria-hidden />,
      onSelect: () => showResourceTab("artifacts"),
    },
    {
      id: "review",
      label: "审阅任务结果",
      detail: "汇总当前任务的成果、工具和告警",
      icon: <FolderOpen aria-hidden />,
      onSelect: () => showResourceTab("review"),
    },
    {
      id: "new-task",
      label: "新建任务",
      detail: "在当前工作台创建一个新会话",
      icon: <Search aria-hidden />,
      onSelect: handleNewTask,
    },
    {
      id: "files",
      label: "打开文件",
      detail: "查看当前任务引用和输出",
      icon: <FolderOpen aria-hidden />,
      onSelect: () => showResourceTab("files"),
    },
    {
      id: "tools",
      label: "打开 Skills 与工具",
      detail: "查看当前 activation 的执行能力",
      icon: <Boxes aria-hidden />,
      onSelect: () => showResourceTab("tools"),
    },
    {
      id: "terminal",
      label: "打开终端活动",
      detail: "查看当前任务的命令执行状态",
      icon: <SquareTerminal aria-hidden />,
      onSelect: () => showResourceTab("terminal"),
    },
    {
      id: "agent",
      label: "打开 WORK Agent",
      detail: "查看 runtime、Skills、Tools 和权限",
      icon: <Bot aria-hidden />,
      onSelect: () => setAgentPanelOpen(true),
    },
    {
      id: "diagnostics",
      label: "打开诊断",
      detail: "查看脱敏后的 Hermes runtime 状态",
      icon: <Copy aria-hidden />,
      onSelect: () => void handleDiagnostics(),
    },
    {
      id: "settings",
      label: "打开 BlackRain 设置",
      detail: "外观、通知、快捷键与关于使用全局设置",
      icon: <Settings aria-hidden />,
      onSelect: onOpenSettings,
    },
  ];

  return (
    <main ref={surfaceRef} className="work-surface">
      <header className="work-surface-header">
        <button
          type="button"
          className="ghost icon-button"
          onClick={() => setSidebarOpen((open) => !open)}
          aria-label={sidebarOpen ? "收起会话侧栏" : "打开会话侧栏"}
          title={sidebarOpen ? "收起会话侧栏" : "打开会话侧栏"}
        >
          <PanelLeft aria-hidden />
        </button>
        <button type="button" className="ghost icon-button" onClick={onClose} aria-label="返回首页">
          <ArrowLeft aria-hidden />
        </button>
        <div className="work-surface-header-actions">
          <button
            type="button"
            className="ghost work-command-trigger"
            onClick={() => setCommandPaletteOpen(true)}
            aria-label="搜索任务和命令"
            title="搜索任务和命令"
          >
            <Search aria-hidden />
            <kbd>⌘K</kbd>
          </button>
          <button
            type="button"
            className="ghost icon-button"
            onClick={() => setSessionPickerOpen(true)}
            aria-label="切换 WORK 任务"
            title="切换任务 (Ctrl/Cmd+P)"
          >
            <SwitchCamera aria-hidden />
          </button>
          <button type="button" className="ghost icon-button" onClick={onOpenSettings} aria-label="打开设置" title="打开设置">
            <Settings aria-hidden />
          </button>
          {!resourceRailOpen ? (
            <button
              type="button"
              className="ghost icon-button"
              onClick={() => setResourceRailOpen(true)}
              aria-label="打开任务资源"
              title="打开任务资源"
            >
              <PanelRight aria-hidden />
            </button>
          ) : null}
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

      <div className={`work-surface-body${sidebarOpen ? "" : " is-sidebar-closed"}`}>
        {sidebarOpen ? <WorkTaskSidebar
          tasks={tasks}
          selectedTaskId={state.selectedTaskId}
          activationId={activationId}
          activations={state.activations.map((activation) => ({
            id: activation.activationId,
            label: `${activation.workbenchId} · ${activation.project.path}`,
          }))}
          canCreateProject={Boolean(state.bundledOffice)}
          onSelectTask={(taskId) => void handleSelectTask(taskId)}
          onSelectActivation={(nextActivationId) => {
            setActivationId(nextActivationId);
            setProjectFileRefs([]);
            setAttachmentError(null);
          }}
          onNewTask={handleNewTask}
          onCreateProject={() => void handleChooseActivationProject()}
          onHome={onClose}
          onSurfaceModeChange={(mode) => {
            if (mode === "code") {
              onClose();
            }
          }}
          onRenameTask={(task) => {
            const pathSegments = task.projectPath.split(/[\\/]/).filter(Boolean);
            setRenamingTask(task);
            setRenameDraft(task.title?.trim() || pathSegments[pathSegments.length - 1] || "WORK 任务");
          }}
          onTogglePin={(task) => void controller.updateTaskMetadata({
            taskId: task.taskId,
            pinned: !task.pinned,
          })}
          onToggleArchive={(task) => void controller.updateTaskMetadata({
            taskId: task.taskId,
            archived: !task.archived,
          }).then(() => {
            if (!task.archived && state.selectedTaskId === task.taskId) {
              controller.selectTask(null);
            }
          })}
          onOpenTools={() => setAgentPanelOpen(true)}
          onOpenArtifacts={() => showResourceTab("artifacts")}
        /> : null}

        <section className="work-conversation">
          <div className="work-hermes-backdrop" aria-hidden>
            <img src="/assets/hermes/filler-bg0.jpg" alt="" />
          </div>

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
            ref={transcriptRef}
            className="work-transcript"
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            aria-atomic="false"
            onScroll={(event) => {
              const element = event.currentTarget;
              setTranscriptAtBottom(
                element.scrollHeight - element.scrollTop - element.clientHeight < 48,
              );
            }}
          >
            {visibleEvents.length === 0 ? (
              <div className="work-welcome">
                <h1 aria-label="HERMES AGENT">HERMES AGENT</h1>
                <p>Drop a file path, a traceback, or a rough idea. I&apos;ll investigate, suggest next steps, and keep things reversible.</p>
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

          {!transcriptAtBottom ? (
            <button
              type="button"
              className="work-scroll-bottom"
              aria-label="滚动到最新消息"
              title="滚动到最新消息"
              onClick={() => {
                transcriptRef.current?.scrollTo?.({
                  top: transcriptRef.current.scrollHeight,
                  behavior: "smooth",
                });
                setTranscriptAtBottom(true);
              }}
            >
              <ArrowDown aria-hidden />
            </button>
          ) : null}

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
            skillNames={skillNames}
            selectedModel={selectedModel}
            focusRequestId={composerFocusRequestId}
            dictationEnabled={dictationEnabled}
            dictationState={dictationState}
            dictationLevel={dictationLevel}
            dictationTranscript={dictationTranscript}
            dictationError={dictationError}
            dictationHint={dictationHint}
            onChange={setDraft}
            onAddFiles={() => void handleAddProjectFiles()}
            onOpenTools={() => showResourceTab("tools")}
            onOpenModels={() => {
              setModelPickerOpen(true);
              if (state.runtime?.state === "ready") {
                void controller.refreshModels().catch(() => undefined);
              }
            }}
            onRemoveFile={(path) =>
              setProjectFileRefs((current) => current.filter((item) => item !== path))
            }
            onSubmit={() => void handleSubmit()}
            onStop={() => selectedTask && void controller.stopTask(selectedTask.taskId)}
            onResume={() => selectedTask && void controller.resumeTask(selectedTask.taskId)}
            onToggleDictation={onToggleDictation}
            onCancelDictation={onCancelDictation}
            onOpenDictationSettings={onOpenDictationSettings}
            onDictationTranscriptHandled={onDictationTranscriptHandled}
            onDismissDictationError={onDismissDictationError}
            onDismissDictationHint={onDismissDictationHint}
          />
        </section>

        {resourceRailOpen ? (
          <WorkResourceRail
            activation={activeActivation}
            events={events}
            task={selectedTask}
            activeTab={resourceRailTab}
            onTabChange={setResourceRailTab}
            onOpenPath={(path) => void revealPathInFileManager(path)}
            onListProjectDirectory={controller.listProjectDirectory}
            onPreviewProjectFile={controller.previewProjectFile}
            onCollapse={() => setResourceRailOpen(false)}
          />
        ) : null}
      </div>

      <footer className="work-statusbar">
        <WorkRuntimeBanner
          runtime={state.runtime}
          busy={busy}
          onStart={() => void controller.startRuntime()}
          onRestart={() => void controller.restartRuntime()}
          onRepair={() => void controller.repairRuntime()}
          onDiagnostics={() => void handleDiagnostics()}
        />
        <span>{activeActivation ? `${activeActivation.workbenchId}@${activeActivation.workbenchVersion}` : "无 activation"}</span>
        {latestUsage?.type === "usageUpdated" ? (
          <span>{latestUsage.totalTokens.toLocaleString()} tokens</span>
        ) : null}
        <span className="work-statusbar-spacer" />
        <span>{selectedTask?.status ?? "新任务"}</span>
      </footer>

      {dropState !== "idle" ? (
        <div className={`work-drop-overlay is-${dropState}`} role="status">
          <Upload aria-hidden />
          <strong>{dropState === "accept" ? "添加项目文件引用" : "无法添加这些文件"}</strong>
          <span>
            {dropState === "accept"
              ? "松开后加入当前任务，不会复制或上传文件。"
              : "只能引用当前已验证项目目录中的文件。"}
          </span>
        </div>
      ) : null}

      {commandPaletteOpen ? (
        <WorkCommandPalette
          commands={commands}
          onClose={() => setCommandPaletteOpen(false)}
        />
      ) : null}
      {sessionPickerOpen ? (
        <WorkSessionPicker
          tasks={tasks}
          selectedTaskId={state.selectedTaskId}
          onSelect={(taskId) => void handleSelectTask(taskId)}
          onClose={() => setSessionPickerOpen(false)}
        />
      ) : null}
      {modelPickerOpen ? (
        <WorkModelPicker
          models={state.models}
          selectedModel={selectedModel}
          onSelect={setSelectedModel}
          onClose={() => setModelPickerOpen(false)}
        />
      ) : null}
      {agentPanelOpen ? (
        <WorkAgentPanel
          activation={activeActivation}
          runtime={state.runtime}
          task={selectedTask}
          models={state.models}
          selectedModel={selectedModel}
          usage={latestUsage?.type === "usageUpdated" ? latestUsage : null}
          onOpenSettings={onOpenSettings}
          onClose={() => setAgentPanelOpen(false)}
        />
      ) : null}

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

      {renamingTask ? (
        <ModalShell
          ariaLabelledBy="work-task-rename-title"
          onBackdropClick={() => setRenamingTask(null)}
          onEscapeKeyDown={() => setRenamingTask(null)}
        >
          <div id="work-task-rename-title" className="ds-modal-title">重命名任务</div>
          <label className="work-task-rename-field">
            <span>任务名称</span>
            <input
              autoFocus
              value={renameDraft}
              maxLength={120}
              onChange={(event) => setRenameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && renameDraft.trim()) {
                  event.preventDefault();
                  void handleRenameTask();
                }
              }}
            />
          </label>
          <div className="ds-modal-actions">
            <button type="button" className="ghost ds-modal-button" onClick={() => setRenamingTask(null)}>取消</button>
            <button type="button" className="primary ds-modal-button" disabled={!renameDraft.trim() || busy} onClick={() => void handleRenameTask()}>
              保存
            </button>
          </div>
        </ModalShell>
      ) : null}
    </main>
  );
}
