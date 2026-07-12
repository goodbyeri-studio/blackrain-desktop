import { useMemo, useState } from "react";
import FileText from "lucide-react/dist/esm/icons/file-text";
import Archive from "lucide-react/dist/esm/icons/archive";
import MoreHorizontal from "lucide-react/dist/esm/icons/more-horizontal";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import Pin from "lucide-react/dist/esm/icons/pin";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import Search from "lucide-react/dist/esm/icons/search";
import Plus from "lucide-react/dist/esm/icons/plus";

import {
  PanelFrame,
  PanelHeader,
  PanelMeta,
  PanelNavItem,
  PanelNavList,
} from "@/features/design-system/components/panel/PanelPrimitives";
import type { WorkTask } from "../types";

type WorkTaskSidebarProps = {
  title: string;
  tasks: WorkTask[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onNewTask: () => void;
  onRenameTask: (task: WorkTask) => void;
  onTogglePin: (task: WorkTask) => void;
  onToggleArchive: (task: WorkTask) => void;
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
  title,
  tasks,
  selectedTaskId,
  onSelectTask,
  onNewTask,
  onRenameTask,
  onTogglePin,
  onToggleArchive,
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
      <PanelHeader className="work-task-sidebar-header">
        <div>
          <strong>{title}</strong>
          <PanelMeta>Hermes WORK</PanelMeta>
        </div>
        <button
          type="button"
          className="ghost icon-button work-new-task-button"
          aria-label="新建 WORK 任务"
          title="新建 WORK 任务"
          onClick={onNewTask}
        >
          <Plus aria-hidden />
        </button>
      </PanelHeader>

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
            <span>{tasks.length === 0 ? "还没有任务" : "没有匹配的任务"}</span>
            <small>{tasks.length === 0 ? "输入一个目标开始。" : "尝试其他关键词。"}</small>
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
      <button
        type="button"
        className={`ghost work-archive-toggle${showArchived ? " is-active" : ""}`}
        onClick={() => {
          setShowArchived((current) => !current);
          setMenuTaskId(null);
        }}
      >
        <Archive aria-hidden />
        {showArchived ? "返回最近任务" : "已归档"}
      </button>
    </PanelFrame>
  );
}
