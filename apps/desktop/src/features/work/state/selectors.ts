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

export function buildVisibleWorkEvents(events: WorkEvent[]): WorkEvent[] {
  const completedItems = new Set(
    events
      .filter((event) => event.type === "agentMessageCompleted" && event.itemId)
      .map((event) => event.itemId as string),
  );
  const visible: WorkEvent[] = [];
  const liveDeltaIndex = new Map<string, number>();
  for (const event of events) {
    if (event.type !== "agentTextDelta") {
      visible.push(event);
      continue;
    }
    const key = event.itemId ?? `run:${event.runId}`;
    if (event.itemId && completedItems.has(event.itemId)) {
      continue;
    }
    const index = liveDeltaIndex.get(key);
    if (index === undefined) {
      liveDeltaIndex.set(key, visible.length);
      visible.push(event);
      continue;
    }
    const current = visible[index];
    if (current?.type === "agentTextDelta") {
      visible[index] = {
        ...event,
        eventId: current.eventId,
        sequence: current.sequence,
        delta: `${current.delta}${event.delta}`,
      };
    }
  }
  return visible;
}

export function resolveProjectOutputPath(
  projectPath: string,
  outputPath: string,
): string | null {
  if (!projectPath.trim() || !outputPath.trim() || outputPath.includes("\0")) {
    return null;
  }
  const relativeSegments = outputPath.split(/[\\/]/);
  if (relativeSegments.some((segment) => segment === "..")) {
    return null;
  }
  const absolute = /^[A-Za-z]:[\\/]/.test(outputPath) || outputPath.startsWith("/");
  const separator = projectPath.includes("\\") ? "\\" : "/";
  const candidate = absolute
    ? outputPath
    : `${projectPath.replace(/[\\/]+$/, "")}${separator}${relativeSegments
        .filter((segment) => segment && segment !== ".")
        .join(separator)}`;
  const normalize = (value: string) =>
    value.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedProject = normalize(projectPath);
  const normalizedCandidate = normalize(candidate);
  const caseInsensitive = /^[A-Za-z]:/.test(normalizedProject);
  const projectKey = caseInsensitive ? normalizedProject.toLowerCase() : normalizedProject;
  const candidateKey = caseInsensitive
    ? normalizedCandidate.toLowerCase()
    : normalizedCandidate;
  return candidateKey === projectKey || candidateKey.startsWith(`${projectKey}/`)
    ? candidate
    : null;
}

export function resolveWorkMessageFilePath(
  projectPath: string,
  messagePath: string,
): string | null {
  const normalizedMessage = messagePath.replace(/\\/g, "/");
  if (!normalizedMessage.startsWith("/workspace/")) {
    return resolveProjectOutputPath(projectPath, messagePath);
  }
  const projectSegments = projectPath.split(/[\\/]/).filter(Boolean);
  const projectName = projectSegments[projectSegments.length - 1];
  const mountedSegments = normalizedMessage.slice("/workspace/".length).split("/");
  const mountedProject = mountedSegments.shift();
  if (
    !projectName ||
    !mountedProject ||
    mountedProject.toLocaleLowerCase() !== projectName.toLocaleLowerCase()
  ) {
    return null;
  }
  return resolveProjectOutputPath(projectPath, mountedSegments.join("/"));
}
