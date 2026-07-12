import type {
  ActivatedWorkbenchContext,
  HermesTaskRecoveryState,
  HermesRuntimeModel,
  WorkError,
  WorkEvent,
  WorkFollowUp,
  WorkRuntimeStatus,
  WorkTask,
  WorkTaskStatus,
  WorkbenchPackageInspection,
} from "../types";

const MAX_ORPHAN_TASKS = 100;
const MAX_ORPHAN_EVENTS_PER_TASK = 1024;

export type WorkTaskState = {
  task: WorkTask;
  events: WorkEvent[];
  eventIds: Record<string, true>;
  followUps: WorkFollowUp[];
};

export type WorkState = {
  activations: ActivatedWorkbenchContext[];
  bundledOffice: WorkbenchPackageInspection | null;
  runtime: WorkRuntimeStatus | null;
  recovery: HermesTaskRecoveryState | null;
  models: HermesRuntimeModel[];
  tasks: Record<string, WorkTaskState>;
  orphanEvents: Record<string, WorkEvent[]>;
  taskOrder: string[];
  selectedTaskId: string | null;
  bootstrapping: boolean;
  pendingOperations: Record<string, true>;
  lastError: WorkError | null;
};

export const initialWorkState: WorkState = {
  activations: [],
  bundledOffice: null,
  runtime: null,
  recovery: null,
  models: [],
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
      activations: ActivatedWorkbenchContext[];
      bundledOffice: WorkbenchPackageInspection | null;
      error: WorkError | null;
    }
  | { type: "runtimeUpdated"; runtime: WorkRuntimeStatus }
  | { type: "modelsLoaded"; models: HermesRuntimeModel[] }
  | { type: "recoveryUpdated"; recovery: HermesTaskRecoveryState }
  | { type: "tasksLoaded"; tasks: WorkTask[] }
  | { type: "activationsLoaded"; activations: ActivatedWorkbenchContext[] }
  | { type: "taskLoaded"; task: WorkTask; events: WorkEvent[]; followUps: WorkFollowUp[] }
  | { type: "followUpsUpdated"; taskId: string; followUps: WorkFollowUp[] }
  | { type: "taskUpserted"; task: WorkTask }
  | { type: "taskRemoved"; taskId: string }
  | { type: "workEventReceived"; event: WorkEvent }
  | { type: "workEventsReceived"; events: WorkEvent[] }
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
  if (event.sequence < task.lastEventSequence) {
    return task;
  }
  let status: WorkTaskStatus = task.status;
  if (event.type === "taskStatusChanged") {
    status = event.status;
  } else if (event.type === "userMessageAdded") {
    status = "running";
  } else if (event.type === "taskFailed") {
    status = "failed";
  }
  const terminal =
    status === "completed" || status === "failed" || status === "cancelled";
  return {
    ...task,
    status,
    activeRunId:
      event.type === "userMessageAdded"
        ? event.runId
        : terminal
          ? null
          : task.activeRunId,
    lastEventSequence: Math.max(task.lastEventSequence, event.sequence),
    updatedAt: Math.max(task.updatedAt, event.timestamp),
  };
}

function receiveWorkEvents(state: WorkState, incoming: WorkEvent[]): WorkState {
  if (incoming.length === 0) {
    return state;
  }
  const grouped = new Map<string, { events: WorkEvent[]; lastIndex: number }>();
  for (const [index, event] of incoming.entries()) {
    const group = grouped.get(event.taskId);
    if (group) {
      group.events.push(event);
      group.lastIndex = index;
    } else {
      grouped.set(event.taskId, { events: [event], lastIndex: index });
    }
  }

  let tasks = state.tasks;
  let orphanEvents = state.orphanEvents;
  let taskOrder = state.taskOrder;
  let changed = false;

  const orderedGroups = Array.from(grouped.entries()).sort(
    ([, left], [, right]) => left.lastIndex - right.lastIndex,
  );
  for (const [taskId, group] of orderedGroups) {
    const taskEvents = group.events;
    const current = tasks[taskId];
    if (!current) {
      const currentOrphans = orphanEvents[taskId] ?? [];
      const orphanIds = new Set(currentOrphans.map((event) => event.eventId));
      if (taskEvents.every((event) => orphanIds.has(event.eventId))) {
        continue;
      }
      const pending = mergeEvents(currentOrphans, taskEvents).slice(
        -MAX_ORPHAN_EVENTS_PER_TASK,
      );
      if (orphanEvents === state.orphanEvents) {
        orphanEvents = { ...state.orphanEvents };
      }
      orphanEvents[taskId] = pending;
      changed = true;
      continue;
    }

    const seenEventIds = new Set(Object.keys(current.eventIds));
    const appended: WorkEvent[] = [];
    for (const event of taskEvents) {
      if (!seenEventIds.has(event.eventId)) {
        seenEventIds.add(event.eventId);
        appended.push(event);
      }
    }
    appended.sort((left, right) => left.sequence - right.sequence);
    if (appended.length === 0) {
      continue;
    }
    const events = mergeEvents(current.events, appended);
    const task = appended.reduce(projectTaskFromEvent, current.task);
    const nextEventIds = { ...current.eventIds };
    for (const event of appended) {
      nextEventIds[event.eventId] = true;
    }
    if (tasks === state.tasks) {
      tasks = { ...state.tasks };
    }
    tasks[taskId] = {
      task,
      events,
      eventIds: nextEventIds,
      followUps: current.followUps,
    };
    taskOrder = [taskId, ...taskOrder.filter((candidate) => candidate !== taskId)];
    changed = true;
  }

  if (orphanEvents !== state.orphanEvents) {
    const orphanTaskIds = Object.keys(orphanEvents);
    while (orphanTaskIds.length > MAX_ORPHAN_TASKS) {
      const oldest = orphanTaskIds.shift();
      if (oldest) {
        delete orphanEvents[oldest];
      }
    }
  }

  return changed ? { ...state, tasks, orphanEvents, taskOrder } : state;
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
      followUps: current?.followUps ?? [],
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
        activations: action.activations,
        bundledOffice: action.bundledOffice,
        bootstrapping: false,
        lastError: action.error,
      };
    }
    case "runtimeUpdated":
      return { ...state, runtime: action.runtime };
    case "modelsLoaded":
      return { ...state, models: action.models };
    case "recoveryUpdated":
      return { ...state, recovery: action.recovery };
    case "tasksLoaded":
      return { ...state, ...upsertTasks(state, action.tasks) };
    case "activationsLoaded":
      return { ...state, activations: action.activations };
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
      const loaded = merged.tasks[action.task.taskId];
      return {
        ...state,
        ...merged,
        tasks: loaded
          ? {
              ...merged.tasks,
              [action.task.taskId]: { ...loaded, followUps: action.followUps },
            }
          : merged.tasks,
      };
    }
    case "followUpsUpdated": {
      const current = state.tasks[action.taskId];
      if (!current) {
        return state;
      }
      return {
        ...state,
        tasks: {
          ...state.tasks,
          [action.taskId]: { ...current, followUps: action.followUps },
        },
      };
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
      return receiveWorkEvents(state, [action.event]);
    }
    case "workEventsReceived":
      return receiveWorkEvents(state, action.events);
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
