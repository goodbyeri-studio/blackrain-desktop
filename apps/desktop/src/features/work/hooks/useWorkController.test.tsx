// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { subscribeWorkEvents } from "@/services/events";
import {
  hermesRuntimeStatus,
  hermesTaskContinue,
  hermesTaskList,
  hermesTaskRecoveryStatus,
  hermesTaskResume,
  hermesTaskStop,
} from "@/services/tauri";
import type { WorkEvent, WorkRuntimeStatus, WorkTask } from "../types";
import { useWorkController } from "./useWorkController";

vi.mock("@/services/events", () => ({
  subscribeWorkEvents: vi.fn(() => vi.fn()),
}));

vi.mock("@/services/tauri", () => ({
  hermesRuntimeDiagnostics: vi.fn(),
  hermesRuntimeRepair: vi.fn(),
  hermesRuntimeRestart: vi.fn(),
  hermesRuntimeStart: vi.fn(),
  hermesRuntimeStatus: vi.fn(),
  hermesRuntimeStop: vi.fn(),
  hermesTaskApproval: vi.fn(),
  hermesTaskContinue: vi.fn(),
  hermesTaskDeleteLocalMetadata: vi.fn(),
  hermesTaskList: vi.fn(),
  hermesTaskRead: vi.fn(),
  hermesTaskRecoveryStatus: vi.fn(),
  hermesTaskResume: vi.fn(),
  hermesTaskStart: vi.fn(),
  hermesTaskStop: vi.fn(),
}));

const runtime: WorkRuntimeStatus = {
  schemaVersion: 1,
  state: "ready",
  version: "2026.7.7.2",
  pid: 123,
  baseUrl: "http://127.0.0.1:8642",
  startedAt: 1,
  lastError: null,
};

const task: WorkTask = {
  schemaVersion: 1,
  taskId: "task-1",
  workbenchId: "office-agent",
  workbenchVersion: "0.1.0",
  projectPath: "C:\\Users\\demo\\Project",
  hermesSessionId: "run-1",
  activeRunId: "run-1",
  status: "running",
  lastEventSequence: 0,
  createdAt: 1,
  updatedAt: 1,
  recovery: {},
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

describe("useWorkController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(subscribeWorkEvents).mockReturnValue(vi.fn());
  });

  it("starts runtime, task, and recovery bootstrap requests in parallel", async () => {
    const runtimeRequest = deferred<WorkRuntimeStatus>();
    const tasksRequest = deferred<WorkTask[]>();
    const recoveryRequest = deferred<{ records: []; error: null }>();
    vi.mocked(hermesRuntimeStatus).mockReturnValue(runtimeRequest.promise);
    vi.mocked(hermesTaskList).mockReturnValue(tasksRequest.promise);
    vi.mocked(hermesTaskRecoveryStatus).mockReturnValue(recoveryRequest.promise);

    const { result } = renderHook(() => useWorkController());
    expect(hermesRuntimeStatus).toHaveBeenCalledTimes(1);
    expect(hermesTaskList).toHaveBeenCalledTimes(1);
    expect(hermesTaskRecoveryStatus).toHaveBeenCalledTimes(1);
    expect(result.current.state.bootstrapping).toBe(true);

    await act(async () => {
      runtimeRequest.resolve(runtime);
      tasksRequest.resolve([task]);
      recoveryRequest.resolve({ records: [], error: null });
      await Promise.all([
        runtimeRequest.promise,
        tasksRequest.promise,
        recoveryRequest.promise,
      ]);
    });
    await waitFor(() => expect(result.current.state.bootstrapping).toBe(false));
    expect(result.current.state.runtime).toEqual(runtime);
    expect(result.current.state.tasks["task-1"].task).toEqual(task);
  });

  it("rejects duplicate stop actions before another render is required", async () => {
    vi.mocked(hermesRuntimeStatus).mockResolvedValue(runtime);
    vi.mocked(hermesTaskList).mockResolvedValue([task]);
    vi.mocked(hermesTaskRecoveryStatus).mockResolvedValue({ records: [], error: null });
    const stopRequest = deferred<WorkTask>();
    vi.mocked(hermesTaskStop).mockReturnValue(stopRequest.promise);
    const { result } = renderHook(() => useWorkController());
    await waitFor(() => expect(result.current.state.bootstrapping).toBe(false));

    let first!: Promise<WorkTask>;
    let second!: Promise<WorkTask>;
    let conflicting!: Promise<WorkTask>;
    act(() => {
      first = result.current.stopTask("task-1");
      second = result.current.stopTask("task-1");
      conflicting = result.current.resumeTask("task-1");
    });
    await expect(second).rejects.toMatchObject({
      code: "work_operation_in_progress",
    });
    await expect(conflicting).rejects.toMatchObject({
      code: "work_operation_in_progress",
    });
    expect(hermesTaskStop).toHaveBeenCalledTimes(1);
    expect(hermesTaskResume).not.toHaveBeenCalled();

    await act(async () => {
      stopRequest.resolve({ ...task, status: "stopping" });
      await first;
    });
    expect(result.current.state.tasks["task-1"].task.status).toBe("stopping");

    const continued = { ...task, activeRunId: "run-2", status: "running" as const };
    vi.mocked(hermesTaskContinue).mockResolvedValue(continued);
    await act(async () => {
      await result.current.continueTask({ taskId: "task-1", prompt: "继续" });
    });
    expect(hermesTaskContinue).toHaveBeenCalledWith({
      taskId: "task-1",
      prompt: "继续",
    });
    expect(result.current.state.tasks["task-1"].task.activeRunId).toBe("run-2");
  });

  it("cleans up the single WORK event subscription", () => {
    vi.mocked(hermesRuntimeStatus).mockResolvedValue(runtime);
    vi.mocked(hermesTaskList).mockResolvedValue([]);
    vi.mocked(hermesTaskRecoveryStatus).mockResolvedValue({ records: [], error: null });
    const unsubscribe = vi.fn();
    vi.mocked(subscribeWorkEvents).mockReturnValue(unsubscribe);

    const { unmount } = renderHook(() => useWorkController());
    expect(subscribeWorkEvents).toHaveBeenCalledTimes(1);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("batches high-frequency WORK events before reducer delivery", async () => {
    vi.useFakeTimers();
    vi.mocked(hermesRuntimeStatus).mockResolvedValue(runtime);
    vi.mocked(hermesTaskList).mockResolvedValue([task]);
    vi.mocked(hermesTaskRecoveryStatus).mockResolvedValue({ records: [], error: null });
    let onEvent: ((event: WorkEvent) => void) | null = null;
    vi.mocked(subscribeWorkEvents).mockImplementation((listener) => {
      onEvent = listener;
      return vi.fn();
    });
    const { result } = renderHook(() => useWorkController());
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      for (let index = 0; index < 600; index += 1) {
        onEvent?.({
          schemaVersion: 1,
          eventId: `event-${index}`,
          sequence: index + 1,
          taskId: task.taskId,
          runId: "run-1",
          timestamp: index + 2,
          itemId: "message-1",
          type: "agentTextDelta",
          delta: "x",
        });
      }
    });
    expect(result.current.state.tasks[task.taskId].events).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(16);
    });
    expect(result.current.state.tasks[task.taskId].events).toHaveLength(256);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16);
    });
    expect(result.current.state.tasks[task.taskId].events).toHaveLength(512);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16);
    });
    expect(result.current.state.tasks[task.taskId].events).toHaveLength(600);
    vi.useRealTimers();
  });
});
