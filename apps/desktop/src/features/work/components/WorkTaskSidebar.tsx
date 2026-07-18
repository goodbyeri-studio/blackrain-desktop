import { useMemo, useState } from "react";
import FileText from "lucide-react/dist/esm/icons/file-text";
import Archive from "lucide-react/dist/esm/icons/archive";
import MoreHorizontal from "lucide-react/dist/esm/icons/more-horizontal";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import Pin from "lucide-react/dist/esm/icons/pin";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import Search from "lucide-react/dist/esm/icons/search";
import Bot from "lucide-react/dist/esm/icons/bot";
import Boxes from "lucide-react/dist/esm/icons/boxes";
import MessageSquare from "lucide-react/dist/esm/icons/message-square";
import House from "lucide-react/dist/esm/icons/house";
import Plus from "lucide-react/dist/esm/icons/plus";

import {
  PanelFrame,
  PanelNavItem,
  PanelNavList,
} from "@/features/design-system/components/panel/PanelPrimitives";
import type { WorkTask } from "../types";
import { SurfaceModeSwitch } from "@app/components/SidebarActions";

type WorkTaskSidebarProps = {
  tasks: WorkTask[];
  selectedTaskId: string | null;
  activationId: string;
  activations: Array<{ id: string; label: string }>;
  canCreateProject: boolean;
  onSelectTask: (taskId: string) => void;
  onSelectActivation: (activationId: string) => void;
  onNewTask: () => void;
  onCreateProject: () => void;
  onHome: () => void;
  onSurfaceModeChange: (mode: "work" | "code") => void;
  onRenameTask: (task: WorkTask) => void;
  onTogglePin: (task: WorkTask) => void;
  onToggleArchive: (task: WorkTask) => void;
  onOpenTools: () => void;
  onOpenArtifacts: () => void;
};

const statusLabel: Record<WorkTask["status"], string> = {
  draft: "草稿",
  queued: "排队中",
  running: "执行中",
  waitingForApproval: "等待审批",
  stopping: "停止中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
  degraded: "连接中断",
  orphaned: "运行记录缺失",
};

function taskTitle(task: WorkTask) {
  if (task.title?.trim()) {
    return task.title.trim();
  }
  const segments = task.projectPath.split(/[\\/]/).filter(Boolean);
  const projectName = segments[segments.length - 1];
  return projectName || "WORK 任务";
}

const needsInput = (task: WorkTask) =>
  task.status === "waitingForApproval" || task.status === "degraded";

const isActive = (task: WorkTask) =>
  task.status === "queued" || task.status === "running" || task.status === "stopping";

export function WorkTaskSidebar({
  tasks,
  selectedTaskId,
  activationId,
  activations,
  canCreateProject,
  onSelectTask,
  onSelectActivation,
  onNewTask,
  onCreateProject,
  onHome,
  onSurfaceModeChange,
  onRenameTask,
  onTogglePin,
  onToggleArchive,
  onOpenTools,
  onOpenArtifacts,
}: WorkTaskSidebarProps) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null);
  const filteredTasks = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) {
      return tasks.filter((task) => Boolean(task.archived) === showArchived);
    }
    return tasks.filter(
      (task) =>
        Boolean(task.archived) === showArchived &&
        `${taskTitle(task)} ${task.projectPath} ${statusLabel[task.status]}`
          .toLocaleLowerCase()
          .includes(normalized),
    );
  }, [query, showArchived, tasks]);
  const groups = useMemo(
    () => [
      { id: "pinned", label: "已置顶", tasks: filteredTasks.filter((task) => task.pinned) },
      { id: "attention", label: "需要处理", tasks: filteredTasks.filter(needsInput) },
      { id: "active", label: "进行中", tasks: filteredTasks.filter((task) => !task.pinned && isActive(task)) },
      {
        id: "recent",
        label: "最近",
        tasks: filteredTasks.filter((task) => !task.pinned && !needsInput(task) && !isActive(task)),
      },
    ],
    [filteredTasks],
  );

  return (
    <PanelFrame className="work-task-sidebar">
      <SurfaceModeSwitch surfaceMode="work" onSurfaceModeChange={onSurfaceModeChange} />
      <nav className="work-hermes-nav" aria-label="Hermes 导航">
        <button type="button" onClick={onNewTask} aria-label="新建 WORK 任务"><Bot aria-hidden /><span>新建会话</span><kbd>Ctrl N</kbd></button>
        <button type="button" onClick={onOpenTools}><Boxes aria-hidden /><span>技能与工具</span></button>
        <button type="button" disabled title="消息平台将在对应合同接入后开放"><MessageSquare aria-hidden /><span>消息平台</span></button>
        <button type="button" onClick={onOpenArtifacts}><FileText aria-hidden /><span>产物</span></button>
      </nav>

      <label className="work-task-search">
        <Search aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索任务"
          aria-label="搜索 WORK 任务"
        />
      </label>

      <div className="work-task-section-label">
        <span>最近任务</span>
        <small>{filteredTasks.length}</small>
      </div>

      <PanelNavList
        className="work-task-list"
        role="navigation"
        aria-label="WORK 任务列表"
      >
        {filteredTasks.length === 0 ? (
          <div className="work-task-empty">
            <FileText aria-hidden />
            <span>{tasks.length === 0 ? "暂无会话" : "没有匹配的任务"}</span>
            <small>{tasks.length === 0 ? "输入一个目标开始。" : "尝试其他关键词。"}</small>
            {tasks.length === 0 && canCreateProject ? (
              <button type="button" className="work-sidebar-project-action" onClick={onCreateProject}>
                <Plus aria-hidden />
                新建项目
              </button>
            ) : null}
          </div>
        ) : groups.map((group) =>
          group.tasks.length > 0 ? (
            <section className="work-task-group" key={group.id} aria-label={group.label}>
              <div className="work-task-group-label">{group.label}</div>
              {group.tasks.map((task) => (
                <div className="work-task-row" key={task.taskId}>
                  <PanelNavItem
                    active={task.taskId === selectedTaskId}
                    aria-current={task.taskId === selectedTaskId ? "page" : undefined}
                    aria-label={`${taskTitle(task)}，${statusLabel[task.status]}`}
                    icon={task.pinned ? <Pin /> : <FileText />}
                    onClick={() => onSelectTask(task.taskId)}
                  >
                    <span className="work-task-row-copy">
                      <span className="work-task-row-title">{taskTitle(task)}</span>
                      <span className={`work-task-status is-${task.status}`}>
                        {statusLabel[task.status]}
                      </span>
                    </span>
                  </PanelNavItem>
                  <button
                    type="button"
                    className="ghost icon-button work-task-more"
                    aria-label={`任务操作 ${taskTitle(task)}`}
                    aria-expanded={menuTaskId === task.taskId}
                    onClick={() => setMenuTaskId((current) => current === task.taskId ? null : task.taskId)}
                  >
                    <MoreHorizontal aria-hidden />
                  </button>
                  {menuTaskId === task.taskId ? (
                    <div className="work-task-menu" role="menu">
                      <button type="button" role="menuitem" onClick={() => { setMenuTaskId(null); onRenameTask(task); }}>
                        <Pencil aria-hidden />重命名
                      </button>
                      {!task.archived ? (
                        <button type="button" role="menuitem" onClick={() => { setMenuTaskId(null); onTogglePin(task); }}>
                          <Pin aria-hidden />{task.pinned ? "取消置顶" : "置顶"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        role="menuitem"
                        disabled={!task.archived && Boolean(task.activeRunId)}
                        onClick={() => { setMenuTaskId(null); onToggleArchive(task); }}
                      >
                        {task.archived ? <RotateCcw aria-hidden /> : <Archive aria-hidden />}
                        {task.archived ? "恢复" : "归档"}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null,
        )}
      </PanelNavList>
      {activations.length > 1 ? (
        <select
          className="work-sidebar-activation-select"
          value={activationId}
          onChange={(event) => onSelectActivation(event.target.value)}
          aria-label="切换已激活项目"
        >
          {activations.map((activation) => (
            <option key={activation.id} value={activation.id}>{activation.label}</option>
          ))}
        </select>
      ) : null}
      <div className="work-sidebar-footer">
        <button type="button" className="is-active" onClick={onHome} aria-label="返回 BlackRain 首页">
          <House aria-hidden />
        </button>
        <button type="button" onClick={canCreateProject ? onCreateProject : onNewTask} aria-label="新建项目">
          <Plus aria-hidden />
        </button>
        <span />
        <button
          type="button"
          className={showArchived ? "is-active" : ""}
          onClick={() => {
            setShowArchived((current) => !current);
            setMenuTaskId(null);
          }}
          aria-label={showArchived ? "返回最近任务" : "查看已归档任务"}
          title={showArchived ? "返回最近任务" : "已归档"}
        >
          <MoreHorizontal aria-hidden />
        </button>
      </div>
    </PanelFrame>
  );
}
