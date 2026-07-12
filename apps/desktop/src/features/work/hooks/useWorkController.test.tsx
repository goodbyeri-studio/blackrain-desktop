// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  subscribeWorkEnvironmentReconcile,
  subscribeWorkEvents,
  subscribeWorkFollowUpsChanged,
} from "@/services/events";
import {
  hermesFollowUpCancel,
  hermesFollowUpEdit,
  hermesFollowUpEnqueue,
  hermesFollowUpRetry,
  hermesFollowUpDispatchReady,
  hermesRuntimeModels,
  hermesRuntimeStatus,
  hermesTaskContinue,
  hermesTaskList,
  hermesTaskRecoveryStatus,
  hermesTaskResume,
  hermesTaskStop,
  workbenchActivationDeactivate,
  workbenchActivationList,
  workbenchBundledInspect,
  workbenchOfficialActivate,
} from "@/services/tauri";
import type {
  WorkEvent,
  WorkFollowUp,
  WorkRuntimeStatus,
  WorkTask,
  WorkbenchPackageInspection,
} from "../types";
import { useWorkController } from "./useWorkController";

vi.mock("@/services/events", () => ({
  subscribeWorkEnvironmentReconcile: vi.fn(() => vi.fn()),
  subscribeWorkEvents: vi.fn(() => vi.fn()),
  subscribeWorkFollowUpsChanged: vi.fn(() => vi.fn()),
}));

vi.mock("@/services/tauri", () => ({
  hermesFollowUpCancel: vi.fn(),
  hermesFollowUpEdit: vi.fn(),
  hermesFollowUpEnqueue: vi.fn(),
  hermesFollowUpRetry: vi.fn(),
  hermesFollowUpDispatchReady: vi.fn(),
  hermesRuntimeDiagnostics: vi.fn(),
  hermesRuntimeModels: vi.fn(),
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
  hermesTaskUpdateMetadata: vi.fn(),
  hermesProjectList: vi.fn(),
  hermesProjectPreview: vi.fn(),
  workbenchActivationDeactivate: vi.fn(),
  workbenchActivationList: vi.fn(),
  workbenchBundledInspect: vi.fn(),
  workbenchOfficialActivate: vi.fn(),
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
  activationId: "activation-office-demo",
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

const followUp: WorkFollowUp = {
  schemaVersion: 1,
  followUpId: "follow-up-1",
  taskId: "task-1",
  prompt: "继续整理",
  projectFileRefs: [],
  instructions: null,
  model: null,
  status: "queued",
  attemptId: null,
  createdAt: 2,
  updatedAt: 2,
  lastError: null,
};

const bundledOffice: WorkbenchPackageInspection = {
  packageRoot: "C:\\Program Files\\BlackRain\\workbenches\\office-agent",
  manifestPath:
    "C:\\Program Files\\BlackRain\\workbenches\\office-agent\\workbench.yaml",
  manifest: {
    schemaVersion: 1,
    id: "com.blackrain.office",
    name: "Office 办公工作台",
    version: "0.1.0",
    publisher: "blackrain-official",
    description: "Office fixture",
    license: "BlackRain-Commercial",
    target: {
      domains: ["office"],
      roles: ["office-generalist"],
      platforms: [{ os: "windows", arch: "x86_64" }],
      blackrain: ">=0.7.68",
    },
    engine: { preferred: "work", allowed: ["work"] },
    skills: [{ path: "skills/generate-office-deliverable" }],
    plugins: [],
    dependencies: [],
    permissions: {
      files: { mode: "user-selected-folders" },
      network: { domains: [] },
      processes: { spawn: [] },
    },
    tasks: { source: "tasks/tasks.yaml" },
    validation: {
      health: "validation/health.yaml",
      smoke: "validation/smoke/basic.yaml",
    },
    uninstall: { preserveUserProjects: true },
  },
  skillRoots: [],
  taskSource: "tasks/tasks.yaml",
  healthSource: "validation/health.yaml",
  smokeSource: "validation/smoke/basic.yaml",
  installableOnWindowsX64: true,
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
    vi.mocked(subscribeWorkEnvironmentReconcile).mockReturnValue(vi.fn());
    vi.mocked(subscribeWorkEvents).mockReturnValue(vi.fn());
    vi.mocked(subscribeWorkFollowUpsChanged).mockReturnValue(vi.fn());
    vi.mocked(workbenchActivationList).mockResolvedValue([]);
    vi.mocked(workbenchBundledInspect).mockResolvedValue(bundledOffice);
    vi.mocked(hermesFollowUpDispatchReady).mockResolvedValue(false);
    vi.mocked(hermesRuntimeModels).mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
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
    expect(workbenchActivationList).toHaveBeenCalledTimes(1);
    expect(workbenchBundledInspect).toHaveBeenCalledWith("com.blackrain.office");
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
    expect(result.current.state.bundledOffice).toEqual(bundledOffice);
    expect(hermesFollowUpDispatchReady).toHaveBeenCalledTimes(1);
  });

  it("deactivates through Core and reconciles runtime tasks recovery and activations", async () => {
    vi.mocked(hermesRuntimeStatus).mockResolvedValue(runtime);
    vi.mocked(hermesTaskList).mockResolvedValue([task]);
    vi.mocked(hermesTaskRecoveryStatus).mockResolvedValue({ records: [], error: null });
    vi.mocked(workbenchActivationDeactivate).mockResolvedValue({
      activationId: "activation-office-demo",
      stoppedTaskIds: ["task-1"],
      projectPath: task.projectPath,
      projectPreserved: true,
    });

    const { result } = renderHook(() => useWorkController());
    await waitFor(() => expect(result.current.state.bootstrapping).toBe(false));

    await act(async () => {
      await result.current.deactivateActivation("activation-office-demo");
    });

    expect(workbenchActivationDeactivate).toHaveBeenCalledWith(
      "activation-office-demo",
    );
    expect(hermesRuntimeStatus).toHaveBeenCalledTimes(2);
    expect(hermesTaskList).toHaveBeenCalledTimes(2);
    expect(hermesTaskRecoveryStatus).toHaveBeenCalledTimes(2);
    expect(workbenchActivationList).toHaveBeenCalledTimes(2);
  });

  it("activates the official workbench and refreshes Core activations", async () => {
    vi.mocked(hermesRuntimeStatus).mockResolvedValue(runtime);
    vi.mocked(hermesTaskList).mockResolvedValue([]);
    vi.mocked(hermesTaskRecoveryStatus).mockResolvedValue({ records: [], error: null });
    const activation = {
      schemaVersion: 1 as const,
      activationId: "office-project-demo",
      workbenchId: "com.blackrain.office",
      workbenchVersion: "0.1.0",
      engine: "work" as const,
      project: { projectId: "project-demo", path: task.projectPath },
      task: null,
      skillRoots: ["C:\\AppData\\BlackRain\\workbenches\\office\\skills"],
      plugins: [],
      mcpServers: [],
      environmentRefs: [
        { kind: "systemCapability" as const, referenceId: "officecli-1.0.117" },
      ],
      permissions: {
        grantId: "grant-demo",
        files: [{ path: task.projectPath, access: "readWrite" as const }],
        networkDomains: [],
        processIds: ["com.blackrain.office-cli"],
      },
      verifiedAt: 1,
    };
    vi.mocked(workbenchOfficialActivate).mockResolvedValue({
      activation,
      installRoot: "C:\\AppData\\BlackRain\\workbenches\\office",
      officecliRoot: "C:\\AppData\\BlackRain\\tools\\officecli",
      healthChecks: ["OfficeCLI 1.0.117"],
      projectPreserved: true,
    });
    vi.mocked(workbenchActivationList)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([activation]);

    const { result } = renderHook(() => useWorkController());
    await waitFor(() => expect(result.current.state.bootstrapping).toBe(false));
    await act(async () => {
      await result.current.activateOfficialWorkbench(
        "com.blackrain.office",
        task.projectPath,
      );
    });

    expect(workbenchOfficialActivate).toHaveBeenCalledWith(
      "com.blackrain.office",
      task.projectPath,
    );
    expect(result.current.state.activations).toEqual([activation]);
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

  it("persists follow-up queue mutations through Tauri wrappers", async () => {
    vi.mocked(hermesRuntimeStatus).mockResolvedValue(runtime);
    vi.mocked(hermesTaskList).mockResolvedValue([task]);
    vi.mocked(hermesTaskRecoveryStatus).mockResolvedValue({ records: [], error: null });
    vi.mocked(hermesFollowUpEnqueue).mockResolvedValue([followUp]);
    vi.mocked(hermesFollowUpEdit).mockResolvedValue([
      { ...followUp, prompt: "修改后继续" },
    ]);
    vi.mocked(hermesFollowUpCancel).mockResolvedValue([]);
    vi.mocked(hermesFollowUpRetry).mockResolvedValue([followUp]);
    const { result } = renderHook(() => useWorkController());
    await waitFor(() => expect(result.current.state.bootstrapping).toBe(false));

    await act(async () => {
      await result.current.enqueueFollowUp({ taskId: "task-1", prompt: "继续整理" });
    });
    expect(result.current.state.tasks["task-1"].followUps).toEqual([followUp]);
    await act(async () => {
      await result.current.editFollowUp({
        taskId: "task-1",
        followUpId: "follow-up-1",
        prompt: "修改后继续",
      });
    });
    expect(result.current.state.tasks["task-1"].followUps[0].prompt).toBe(
      "修改后继续",
    );
    await act(async () => {
      await result.current.cancelFollowUp("task-1", "follow-up-1");
    });
    expect(result.current.state.tasks["task-1"].followUps).toEqual([]);
    await act(async () => {
      await result.current.retryFollowUp("task-1", "follow-up-1");
    });
    expect(result.current.state.tasks["task-1"].followUps).toEqual([followUp]);
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

  it("applies durable follow-up events and cleans up their subscription", async () => {
    vi.mocked(hermesRuntimeStatus).mockResolvedValue(runtime);
    vi.mocked(hermesTaskList).mockResolvedValue([task]);
    vi.mocked(hermesTaskRecoveryStatus).mockResolvedValue({ records: [], error: null });
    let onFollowUpsChanged:
      | ((payload: { taskId: string; followUps: WorkFollowUp[] }) => void)
      | null = null;
    const unsubscribe = vi.fn();
    vi.mocked(subscribeWorkFollowUpsChanged).mockImplementation((listener) => {
      onFollowUpsChanged = listener;
      return unsubscribe;
    });

    const { result, unmount } = renderHook(() => useWorkController());
    await waitFor(() => expect(result.current.state.bootstrapping).toBe(false));
    act(() => {
      onFollowUpsChanged?.({ taskId: task.taskId, followUps: [followUp] });
    });
    expect(result.current.state.tasks[task.taskId].followUps).toEqual([followUp]);

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

  it("reconciles and reattaches degraded runs after native, focus, or network recovery", async () => {
    vi.useFakeTimers();
    const degradedTask = { ...task, status: "degraded" as const };
    vi.mocked(hermesRuntimeStatus).mockResolvedValue(runtime);
    vi.mocked(hermesTaskList).mockResolvedValue([degradedTask]);
    vi.mocked(hermesTaskRecoveryStatus).mockResolvedValue({ records: [], error: null });
    vi.mocked(hermesTaskResume).mockResolvedValue({ ...task, status: "running" });
    let onNativeResume: (() => void) | null = null;
    const unsubscribeNativeResume = vi.fn();
    vi.mocked(subscribeWorkEnvironmentReconcile).mockImplementation((listener) => {
      onNativeResume = listener;
      return unsubscribeNativeResume;
    });
    const { result, unmount } = renderHook(() => useWorkController());
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      onNativeResume?.();
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(hermesRuntimeStatus).toHaveBeenCalledTimes(2);
    expect(hermesTaskList).toHaveBeenCalledTimes(2);
    expect(hermesTaskRecoveryStatus).toHaveBeenCalledTimes(2);
    expect(hermesTaskResume).toHaveBeenCalledWith(degradedTask.taskId);
    expect(result.current.state.tasks[task.taskId].task.status).toBe("running");
    unmount();
    expect(unsubscribeNativeResume).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
