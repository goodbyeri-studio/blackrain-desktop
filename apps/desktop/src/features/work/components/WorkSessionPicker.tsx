import { useEffect, useMemo, useRef, useState } from "react";
import FileText from "lucide-react/dist/esm/icons/file-text";
import Search from "lucide-react/dist/esm/icons/search";

import { ModalShell } from "@/features/design-system/components/modal/ModalShell";
import type { WorkTask } from "../types";

type WorkSessionPickerProps = {
  tasks: WorkTask[];
  selectedTaskId: string | null;
  onSelect: (taskId: string) => void;
  onClose: () => void;
};

function basename(path: string) {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? "WORK 任务";
}

function statusLabel(status: WorkTask["status"]) {
  switch (status) {
    case "running":
      return "执行中";
    case "waitingForApproval":
      return "等待审批";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    case "degraded":
      return "连接中断";
    case "orphaned":
      return "运行记录缺失";
    case "stopping":
      return "停止中";
    case "queued":
      return "排队中";
    default:
      return "草稿";
  }
}

export function WorkSessionPicker({
  tasks,
  selectedTaskId,
  onSelect,
  onClose,
}: WorkSessionPickerProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const visibleTasks = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) {
      return tasks;
    }
    return tasks.filter((task) =>
      `${basename(task.projectPath)} ${task.projectPath} ${statusLabel(task.status)}`
        .toLocaleLowerCase()
        .includes(normalized),
    );
  }, [query, tasks]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const choose = (task: WorkTask | undefined) => {
    if (!task) {
      return;
    }
    onClose();
    onSelect(task.taskId);
  };

  return (
    <ModalShell
      className="work-session-modal"
      cardClassName="work-session-card"
      ariaLabel="切换 WORK 任务"
      onBackdropClick={onClose}
      onEscapeKeyDown={onClose}
    >
      <label className="work-command-search">
        <Search aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => {
                if (visibleTasks.length === 0) {
                  return 0;
                }
                const delta = event.key === "ArrowDown" ? 1 : -1;
                return (current + delta + visibleTasks.length) % visibleTasks.length;
              });
            }
            if (event.key === "Enter") {
              event.preventDefault();
              choose(visibleTasks[activeIndex]);
            }
          }}
          placeholder="按项目、路径或状态搜索"
          aria-label="搜索 WORK 任务切换器"
        />
        <kbd>Esc</kbd>
      </label>
      <div className="work-session-list" role="listbox" aria-label="WORK 任务">
        {visibleTasks.length > 0 ? (
          visibleTasks.map((task, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? "is-active" : ""}
              key={task.taskId}
              onMouseMove={() => setActiveIndex(index)}
              onClick={() => choose(task)}
            >
              <FileText aria-hidden />
              <span>
                <strong>{basename(task.projectPath)}</strong>
                <small>{task.projectPath}</small>
              </span>
              <span className={`work-task-status is-${task.status}`}>
                {statusLabel(task.status)}
              </span>
              {task.taskId === selectedTaskId ? <em>当前</em> : null}
            </button>
          ))
        ) : (
          <div className="work-command-empty">没有匹配的任务</div>
        )}
      </div>
    </ModalShell>
  );
}
