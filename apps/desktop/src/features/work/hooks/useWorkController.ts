import { useCallback, useEffect, useReducer, useRef } from "react";

import { subscribeWorkEvents } from "@/services/events";
import {
  hermesRuntimeDiagnostics,
  hermesRuntimeRepair,
  hermesRuntimeRestart,
  hermesRuntimeStart,
  hermesRuntimeStatus,
  hermesRuntimeStop,
  hermesTaskApproval,
  hermesTaskContinue,
  hermesTaskDeleteLocalMetadata,
  hermesTaskList,
  hermesTaskRead,
  hermesTaskRecoveryStatus,
  hermesTaskResume,
  hermesTaskStart,
  hermesTaskStop,
} from "@/services/tauri";
import type {
  HermesRuntimeDiagnostics,
  HermesTaskContinueInput,
  HermesTaskStartInput,
  WorkEvent,
  WorkError,
} from "../types";
import { initialWorkState, workReducer } from "../state/reducer";

const unknownError = (error: unknown): WorkError => {
  if (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    "code" in error &&
    "message" in error
  ) {
    return error as WorkError;
  }
  return {
    kind: "unknown",
    code: "work_operation_failed",
    message: error instanceof Error ? error.message : "WORK operation failed.",
    retryable: false,
    httpStatus: null,
    requestId: null,
    details: {},
  };
};

const operationInProgressError = (): WorkError => ({
  kind: "invalidRequest",
  code: "work_operation_in_progress",
  message: "The requested WORK operation is already in progress.",
  retryable: false,
  httpStatus: null,
  requestId: null,
  details: {},
});

const WORK_EVENT_BATCH_SIZE = 256;
const WORK_EVENT_BATCH_DELAY_MS = 16;
const WORK_ENVIRONMENT_RECONCILE_DELAY_MS = 250;

export function useWorkController() {
  const [state, dispatch] = useReducer(workReducer, initialWorkState);
  const inFlightRef = useRef(new Set<string>());
  const eventQueueRef = useRef<WorkEvent[]>([]);
  const eventFlushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const flush = () => {
      eventFlushTimerRef.current = null;
      const events = eventQueueRef.current.splice(0, WORK_EVENT_BATCH_SIZE);
      if (events.length > 0) {
        dispatch({ type: "workEventsReceived", events });
      }
      if (eventQueueRef.current.length > 0) {
        eventFlushTimerRef.current = window.setTimeout(
          flush,
          WORK_EVENT_BATCH_DELAY_MS,
        );
      }
    };
    const unsubscribe = subscribeWorkEvents((event) => {
      eventQueueRef.current.push(event);
      if (eventFlushTimerRef.current === null) {
        eventFlushTimerRef.current = window.setTimeout(
          flush,
          WORK_EVENT_BATCH_DELAY_MS,
        );
      }
    });
    return () => {
      unsubscribe();
      if (eventFlushTimerRef.current !== null) {
        window.clearTimeout(eventFlushTimerRef.current);
      }
      eventFlushTimerRef.current = null;
      eventQueueRef.current = [];
    };
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      hermesRuntimeStatus(),
      hermesTaskList(),
      hermesTaskRecoveryStatus(),
    ]).then(([runtimeResult, tasksResult, recoveryResult]) => {
      if (!active) {
        return;
      }
      const rejected = [runtimeResult, tasksResult, recoveryResult].find(
        (result) => result.status === "rejected",
      );
      dispatch({
        type: "bootstrapCompleted",
        runtime: runtimeResult.status === "fulfilled" ? runtimeResult.value : null,
        tasks: tasksResult.status === "fulfilled" ? tasksResult.value : [],
        recovery:
          recoveryResult.status === "fulfilled" ? recoveryResult.value : null,
        error: rejected?.status === "rejected" ? unknownError(rejected.reason) : null,
      });
    });
    return () => {
      active = false;
    };
  }, []);

  const runExclusive = useCallback(
    async <T,>(key: string, operation: () => Promise<T>): Promise<T> => {
      if (inFlightRef.current.has(key)) {
        throw operationInProgressError();
      }
      inFlightRef.current.add(key);
      dispatch({ type: "operationStarted", key });
      try {
        const result = await operation();
        dispatch({ type: "operationFinished", key, error: null });
        return result;
      } catch (error) {
        const workError = unknownError(error);
        dispatch({ type: "operationFinished", key, error: workError });
        throw workError;
      } finally {
        inFlightRef.current.delete(key);
      }
    },
    [],
  );

  const refreshRuntime = useCallback(async () => {
    const runtime = await runExclusive("runtime:status", hermesRuntimeStatus);
    dispatch({ type: "runtimeUpdated", runtime });
    return runtime;
  }, [runExclusive]);

  const startRuntime = useCallback(async () => {
    const runtime = await runExclusive("runtime:start", hermesRuntimeStart);
    dispatch({ type: "runtimeUpdated", runtime });
    return runtime;
  }, [runExclusive]);

  const stopRuntime = useCallback(async () => {
    const runtime = await runExclusive("runtime:stop", hermesRuntimeStop);
    dispatch({ type: "runtimeUpdated", runtime });
    return runtime;
  }, [runExclusive]);

  const restartRuntime = useCallback(async () => {
    const runtime = await runExclusive("runtime:restart", hermesRuntimeRestart);
    dispatch({ type: "runtimeUpdated", runtime });
    return runtime;
  }, [runExclusive]);

  const repairRuntime = useCallback(async () => {
    const runtime = await runExclusive("runtime:repair", hermesRuntimeRepair);
    dispatch({ type: "runtimeUpdated", runtime });
    return runtime;
  }, [runExclusive]);

  const loadDiagnostics = useCallback(
    (): Promise<HermesRuntimeDiagnostics> =>
      runExclusive("runtime:diagnostics", hermesRuntimeDiagnostics),
    [runExclusive],
  );

  const refreshTasks = useCallback(async () => {
    const tasks = await runExclusive("tasks:list", hermesTaskList);
    dispatch({ type: "tasksLoaded", tasks });
    return tasks;
  }, [runExclusive]);

  const loadTask = useCallback(
    async (taskId: string) => {
      const result = await runExclusive(`task:${taskId}:read`, () =>
        hermesTaskRead(taskId),
      );
      dispatch({ type: "taskLoaded", task: result.task, events: result.events });
      return result;
    },
    [runExclusive],
  );

  const startTask = useCallback(
    async (input: HermesTaskStartInput) => {
      const task = await runExclusive("task:start", () => hermesTaskStart(input));
      dispatch({ type: "taskUpserted", task });
      dispatch({ type: "taskSelected", taskId: task.taskId });
      return task;
    },
    [runExclusive],
  );

  const resumeTask = useCallback(
    async (taskId: string) => {
      const task = await runExclusive(`task:${taskId}:mutation`, () =>
        hermesTaskResume(taskId),
      );
      dispatch({ type: "taskUpserted", task });
      return task;
    },
    [runExclusive],
  );

  const continueTask = useCallback(
    async (input: HermesTaskContinueInput) => {
      const task = await runExclusive(`task:${input.taskId}:mutation`, () =>
        hermesTaskContinue(input),
      );
      dispatch({ type: "taskUpserted", task });
      return task;
    },
    [runExclusive],
  );

  const approveTask = useCallback(
    async (
      taskId: string,
      choice: "once" | "session" | "always" | "deny",
      resolveAll = false,
    ) => {
      const task = await runExclusive(`task:${taskId}:mutation`, () =>
        hermesTaskApproval(taskId, choice, resolveAll),
      );
      dispatch({ type: "taskUpserted", task });
      return task;
    },
    [runExclusive],
  );

  const stopTask = useCallback(
    async (taskId: string) => {
      const task = await runExclusive(`task:${taskId}:mutation`, () =>
        hermesTaskStop(taskId),
      );
      dispatch({ type: "taskUpserted", task });
      return task;
    },
    [runExclusive],
  );

  const deleteTaskMetadata = useCallback(
    async (taskId: string) => {
      const removed = await runExclusive(`task:${taskId}:mutation`, () =>
        hermesTaskDeleteLocalMetadata(taskId),
      );
      if (removed) {
        dispatch({ type: "taskRemoved", taskId });
      }
      return removed;
    },
    [runExclusive],
  );

  const refreshRecovery = useCallback(async () => {
    const recovery = await runExclusive("recovery:status", hermesTaskRecoveryStatus);
    dispatch({ type: "recoveryUpdated", recovery });
    return recovery;
  }, [runExclusive]);

  const selectTask = useCallback((taskId: string | null) => {
    dispatch({ type: "taskSelected", taskId });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: "errorCleared" });
  }, []);

  useEffect(() => {
    let reconcileTimer: number | null = null;
    let active = true;
    const reconcile = async () => {
      reconcileTimer = null;
      const [runtimeResult, tasksResult] = await Promise.allSettled([
        refreshRuntime(),
        refreshTasks(),
        refreshRecovery(),
      ]);
      if (!active || runtimeResult.status !== "fulfilled") {
        return;
      }
      if (runtimeResult.value.state !== "ready" || tasksResult.status !== "fulfilled") {
        return;
      }
      const degradedTasks = tasksResult.value.filter(
        (task) => task.status === "degraded" && Boolean(task.activeRunId),
      );
      await Promise.allSettled(degradedTasks.map((task) => resumeTask(task.taskId)));
    };
    const scheduleReconcile = () => {
      if (!active || reconcileTimer !== null) {
        return;
      }
      reconcileTimer = window.setTimeout(
        () => void reconcile(),
        WORK_ENVIRONMENT_RECONCILE_DELAY_MS,
      );
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleReconcile();
      }
    };
    window.addEventListener("online", scheduleReconcile);
    window.addEventListener("focus", scheduleReconcile);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      active = false;
      window.removeEventListener("online", scheduleReconcile);
      window.removeEventListener("focus", scheduleReconcile);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (reconcileTimer !== null) {
        window.clearTimeout(reconcileTimer);
      }
    };
  }, [refreshRecovery, refreshRuntime, refreshTasks, resumeTask]);

  return {
    state,
    refreshRuntime,
    startRuntime,
    stopRuntime,
    restartRuntime,
    repairRuntime,
    loadDiagnostics,
    refreshTasks,
    loadTask,
    startTask,
    continueTask,
    resumeTask,
    approveTask,
    stopTask,
    deleteTaskMetadata,
    refreshRecovery,
    selectTask,
    clearError,
  };
}
