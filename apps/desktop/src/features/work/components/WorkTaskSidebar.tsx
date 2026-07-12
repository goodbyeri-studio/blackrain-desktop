import FileText from "lucide-react/dist/esm/icons/file-text";
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
  tasks: WorkTask[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onNewTask: () => void;
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
  const segments = task.projectPath.split(/[\\/]/).filter(Boolean);
  const projectName = segments[segments.length - 1];
  return projectName || "Office 任务";
}

export function WorkTaskSidebar({
  tasks,
  selectedTaskId,
  onSelectTask,
  onNewTask,
}: WorkTaskSidebarProps) {
  return (
    <PanelFrame className="work-task-sidebar">
      <PanelHeader className="work-task-sidebar-header">
        <div>
          <strong>Office 工作台</strong>
          <PanelMeta>Hermes WORK</PanelMeta>
        </div>
        <button
          type="button"
          className="ghost icon-button work-new-task-button"
          aria-label="新建 Office 任务"
          title="新建 Office 任务"
          onClick={onNewTask}
        >
          <Plus aria-hidden />
        </button>
      </PanelHeader>

      <PanelNavList className="work-task-list">
        {tasks.length === 0 ? (
          <div className="work-task-empty">
            <FileText aria-hidden />
            <span>还没有任务</span>
            <small>从右侧输入一个 Office 目标开始。</small>
          </div>
        ) : (
          tasks.map((task) => (
            <PanelNavItem
              key={task.taskId}
              active={task.taskId === selectedTaskId}
              aria-current={task.taskId === selectedTaskId ? "page" : undefined}
              aria-label={`${taskTitle(task)}，${statusLabel[task.status]}`}
              icon={<FileText />}
              onClick={() => onSelectTask(task.taskId)}
            >
              <span className="work-task-row-copy">
                <span className="work-task-row-title">{taskTitle(task)}</span>
                <span className={`work-task-status is-${task.status}`}>
                  {statusLabel[task.status]}
                </span>
              </span>
            </PanelNavItem>
          ))
        )}
      </PanelNavList>
    </PanelFrame>
  );
}
