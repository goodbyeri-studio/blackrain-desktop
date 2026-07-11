import type { WorkEvent, WorkTask } from "../types";
import type { WorkState } from "./reducer";

export function selectOrderedTasks(state: WorkState): WorkTask[] {
  return state.taskOrder.flatMap((taskId) => {
    const entry = state.tasks[taskId];
    return entry ? [entry.task] : [];
  });
}

export function selectTaskEvents(state: WorkState, taskId: string | null): WorkEvent[] {
  return taskId ? (state.tasks[taskId]?.events ?? []) : [];
}

export function selectSelectedTask(state: WorkState): WorkTask | null {
  return state.selectedTaskId
    ? (state.tasks[state.selectedTaskId]?.task ?? null)
    : null;
}

export function selectPendingApproval(
  state: WorkState,
  taskId: string | null,
): Extract<WorkEvent, { type: "approvalRequested" }> | null {
  const events = selectTaskEvents(state, taskId);
  let pending: Extract<WorkEvent, { type: "approvalRequested" }> | null = null;
  for (const event of events) {
    if (event.type === "approvalRequested") {
      pending = event;
    } else if (event.type === "approvalResolved") {
      pending = null;
    }
  }
  return pending;
}

export function selectCanStop(task: WorkTask | null): boolean {
  return Boolean(
    task?.activeRunId &&
      task.status !== "stopping" &&
      task.status !== "completed" &&
      task.status !== "failed" &&
      task.status !== "cancelled" &&
      task.status !== "orphaned",
  );
}

export function selectCanResume(task: WorkTask | null): boolean {
  return Boolean(
    task?.activeRunId &&
      (task.status === "degraded" ||
        task.status === "running" ||
        task.status === "waitingForApproval"),
  );
}
