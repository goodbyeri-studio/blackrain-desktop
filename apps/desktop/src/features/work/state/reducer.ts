import type {
  HermesTaskRecoveryState,
  WorkError,
  WorkEvent,
  WorkRuntimeStatus,
  WorkTask,
  WorkTaskStatus,
} from "../types";

const MAX_ORPHAN_TASKS = 100;
const MAX_ORPHAN_EVENTS_PER_TASK = 1024;

export type WorkTaskState = {
  task: WorkTask;
  events: WorkEvent[];
  eventIds: Record<string, true>;
};

export type WorkState = {
  runtime: WorkRuntimeStatus | null;
  recovery: HermesTaskRecoveryState | null;
  tasks: Record<string, WorkTaskState>;
  orphanEvents: Record<string, WorkEvent[]>;
  taskOrder: string[];
  selectedTaskId: string | null;
  bootstrapping: boolean;
  pendingOperations: Record<string, true>;
  lastError: WorkError | null;
};

export const initialWorkState: WorkState = {
  runtime: null,
  recovery: null,
  tasks: {},
  orphanEvents: {},
  taskOrder: [],
  selectedTaskId: null,
  bootstrapping: true,
  pendingOperations: {},
  lastError: null,
};

export type WorkAction =
  | {
      type: "bootstrapCompleted";
      runtime: WorkRuntimeStatus | null;
      recovery: HermesTaskRecoveryState | null;
      tasks: WorkTask[];
      error: WorkError | null;
    }
  | { type: "runtimeUpdated"; runtime: WorkRuntimeStatus }
  | { type: "recoveryUpdated"; recovery: HermesTaskRecoveryState }
  | { type: "tasksLoaded"; tasks: WorkTask[] }
  | { type: "taskLoaded"; task: WorkTask; events: WorkEvent[] }
  | { type: "taskUpserted"; task: WorkTask }
  | { type: "taskRemoved"; taskId: string }
  | { type: "workEventReceived"; event: WorkEvent }
  | { type: "taskSelected"; taskId: string | null }
  | { type: "operationStarted"; key: string }
  | { type: "operationFinished"; key: string; error?: WorkError | null }
  | { type: "errorCleared" };

function eventIds(events: WorkEvent[]): Record<string, true> {
  const ids: Record<string, true> = {};
  for (const event of events) {
    ids[event.eventId] = true;
  }
  return ids;
}

function mergeEvents(current: WorkEvent[], incoming: WorkEvent[]): WorkEvent[] {
  if (incoming.length === 0) {
    return current;
  }
  const byId = new Map(current.map((event) => [event.eventId, event]));
  for (const event of incoming) {
    if (!byId.has(event.eventId)) {
      byId.set(event.eventId, event);
    }
  }
  return Array.from(byId.values()).sort(
    (left, right) => left.sequence - right.sequence,
  );
}

function projectTaskFromEvent(task: WorkTask, event: WorkEvent): WorkTask {
  let status: WorkTaskStatus = task.status;
  if (event.type === "taskStatusChanged") {
    status = event.status;
  } else if (event.type === "taskFailed") {
    status = "failed";
  }
  const terminal =
    status === "completed" || status === "failed" || status === "cancelled";
  return {
    ...task,
    status,
    activeRunId: terminal ? null : task.activeRunId,
    lastEventSequence: Math.max(task.lastEventSequence, event.sequence),
    updatedAt: Math.max(task.updatedAt, event.timestamp),
  };
}

function upsertTasks(
  state: WorkState,
  tasks: WorkTask[],
): Pick<WorkState, "tasks" | "orphanEvents" | "taskOrder" | "selectedTaskId"> {
  const nextTasks = { ...state.tasks };
  const orphanEvents = { ...state.orphanEvents };
  for (const task of tasks) {
    const current = nextTasks[task.taskId];
    const events = mergeEvents(
      current?.events ?? [],
      orphanEvents[task.taskId] ?? [],
    );
    let projectedTask = task;
    for (const event of events) {
      projectedTask = projectTaskFromEvent(projectedTask, event);
    }
    nextTasks[task.taskId] = {
      task: projectedTask,
      events,
      eventIds: eventIds(events),
    };
    delete orphanEvents[task.taskId];
  }
  const taskOrder = Object.values(nextTasks)
    .sort(
      (left, right) =>
        right.task.updatedAt - left.task.updatedAt ||
        left.task.taskId.localeCompare(right.task.taskId),
    )
    .map((entry) => entry.task.taskId);
  const selectedTaskId =
    state.selectedTaskId && nextTasks[state.selectedTaskId]
      ? state.selectedTaskId
      : (taskOrder[0] ?? null);
  return { tasks: nextTasks, orphanEvents, taskOrder, selectedTaskId };
}

export function workReducer(state: WorkState, action: WorkAction): WorkState {
  switch (action.type) {
    case "bootstrapCompleted": {
      const merged = upsertTasks(state, action.tasks);
      return {
        ...state,
        ...merged,
        runtime: action.runtime,
        recovery: action.recovery,
        bootstrapping: false,
        lastError: action.error,
      };
    }
    case "runtimeUpdated":
      return { ...state, runtime: action.runtime };
    case "recoveryUpdated":
      return { ...state, recovery: action.recovery };
    case "tasksLoaded":
      return { ...state, ...upsertTasks(state, action.tasks) };
    case "taskLoaded": {
      const pendingState = {
        ...state,
        orphanEvents: {
          ...state.orphanEvents,
          [action.task.taskId]: mergeEvents(
            state.orphanEvents[action.task.taskId] ?? [],
            action.events,
          ),
        },
      };
      const merged = upsertTasks(pendingState, [action.task]);
      return { ...state, ...merged };
    }
    case "taskUpserted":
      return { ...state, ...upsertTasks(state, [action.task]) };
    case "taskRemoved": {
      if (!state.tasks[action.taskId]) {
        return state;
      }
      const tasks = { ...state.tasks };
      delete tasks[action.taskId];
      const taskOrder = state.taskOrder.filter((taskId) => taskId !== action.taskId);
      return {
        ...state,
        tasks,
        taskOrder,
        selectedTaskId:
          state.selectedTaskId === action.taskId
            ? (taskOrder[0] ?? null)
            : state.selectedTaskId,
      };
    }
    case "workEventReceived": {
      const current = state.tasks[action.event.taskId];
      if (!current) {
        const pending = mergeEvents(
          state.orphanEvents[action.event.taskId] ?? [],
          [action.event],
        ).slice(-MAX_ORPHAN_EVENTS_PER_TASK);
        const orphanEvents = {
          ...state.orphanEvents,
          [action.event.taskId]: pending,
        };
        const orphanTaskIds = Object.keys(orphanEvents);
        if (orphanTaskIds.length > MAX_ORPHAN_TASKS) {
          delete orphanEvents[orphanTaskIds[0]];
        }
        return {
          ...state,
          orphanEvents,
        };
      }
      if (current.eventIds[action.event.eventId]) {
        return state;
      }
      const events = mergeEvents(current.events, [action.event]);
      const task = projectTaskFromEvent(current.task, action.event);
      return {
        ...state,
        tasks: {
          ...state.tasks,
          [action.event.taskId]: {
            task,
            events,
            eventIds: { ...current.eventIds, [action.event.eventId]: true },
          },
        },
        taskOrder: [
          action.event.taskId,
          ...state.taskOrder.filter((taskId) => taskId !== action.event.taskId),
        ],
      };
    }
    case "taskSelected":
      return {
        ...state,
        selectedTaskId:
          action.taskId === null || state.tasks[action.taskId]
            ? action.taskId
            : state.selectedTaskId,
      };
    case "operationStarted":
      return {
        ...state,
        pendingOperations: { ...state.pendingOperations, [action.key]: true },
      };
    case "operationFinished": {
      const pendingOperations = { ...state.pendingOperations };
      delete pendingOperations[action.key];
      return {
        ...state,
        pendingOperations,
        lastError: action.error === undefined ? state.lastError : action.error,
      };
    }
    case "errorCleared":
      return { ...state, lastError: null };
    default:
      return state;
  }
}
