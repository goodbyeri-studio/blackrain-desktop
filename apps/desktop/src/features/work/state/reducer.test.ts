import { describe, expect, it } from "vitest";

import type { WorkEvent, WorkTask } from "../types";
import { initialWorkState, workReducer } from "./reducer";
import {
  selectCanResume,
  selectCanStop,
  selectPendingApproval,
  selectTaskEvents,
} from "./selectors";

function task(overrides: Partial<WorkTask> = {}): WorkTask {
  return {
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
    ...overrides,
  };
}

function event(
  eventId: string,
  sequence: number,
  kind: Pick<WorkEvent, "type"> & Record<string, unknown>,
): WorkEvent {
  return {
    schemaVersion: 1,
    eventId,
    sequence,
    taskId: "task-1",
    runId: "run-1",
    timestamp: sequence + 1,
    itemId: null,
    ...kind,
  } as WorkEvent;
}

describe("workReducer", () => {
  it("buffers events that race ahead of the task start response", () => {
    const delta = event("event-1", 1, {
      type: "agentTextDelta",
      delta: "正在处理",
    });
    const beforeTask = workReducer(initialWorkState, {
      type: "workEventReceived",
      event: delta,
    });
    expect(beforeTask.orphanEvents["task-1"]).toEqual([delta]);

    const afterTask = workReducer(beforeTask, {
      type: "taskUpserted",
      task: task(),
    });
    expect(selectTaskEvents(afterTask, "task-1")).toEqual([delta]);
    expect(afterTask.orphanEvents["task-1"]).toBeUndefined();
  });

  it("deduplicates replay and keeps sequence order across hydration", () => {
    const second = event("event-2", 2, {
      type: "agentMessageCompleted",
      text: "完成",
    });
    const first = event("event-1", 1, {
      type: "agentTextDelta",
      delta: "完",
    });
    let state = workReducer(initialWorkState, {
      type: "taskUpserted",
      task: task(),
    });
    state = workReducer(state, { type: "workEventReceived", event: second });
    state = workReducer(state, { type: "workEventReceived", event: second });
    state = workReducer(state, {
      type: "taskLoaded",
      task: task({ lastEventSequence: 2 }),
      events: [first, second],
      followUps: [],
    });

    expect(selectTaskEvents(state, "task-1").map((entry) => entry.eventId)).toEqual([
      "event-1",
      "event-2",
    ]);
  });

  it("projects an automatically dispatched follow-up user event into a running task", () => {
    let state = workReducer(initialWorkState, {
      type: "taskUpserted",
      task: task({ status: "completed", activeRunId: null }),
    });
    state = workReducer(state, {
      type: "workEventReceived",
      event: event("follow-up-user", 3, {
        runId: "run-follow-up",
        type: "userMessageAdded",
        text: "继续生成摘要",
        projectFileRefs: [],
        sourceFollowUpId: "follow-up-1",
      }),
    });
    expect(state.tasks["task-1"].task.status).toBe("running");
    expect(state.tasks["task-1"].task.activeRunId).toBe("run-follow-up");
  });

  it("applies a high-frequency batch with one task projection", () => {
    let state = workReducer(initialWorkState, {
      type: "taskUpserted",
      task: task(),
    });
    const events = Array.from({ length: 600 }, (_, index) =>
      event(`delta-${index}`, index + 1, {
        type: "agentTextDelta",
        delta: "x",
      }),
    );
    state = workReducer(state, {
      type: "workEventsReceived",
      events: [...events, events[100]],
    });

    expect(selectTaskEvents(state, "task-1")).toHaveLength(600);
    expect(state.tasks["task-1"].task.lastEventSequence).toBe(600);
    expect(state.taskOrder).toEqual(["task-1"]);
  });

  it("projects terminal task status and clears the active run", () => {
    let state = workReducer(initialWorkState, {
      type: "taskUpserted",
      task: task(),
    });
    state = workReducer(state, {
      type: "workEventReceived",
      event: event("event-terminal", 3, {
        type: "taskStatusChanged",
        status: "completed",
      }),
    });

    expect(state.tasks["task-1"].task.status).toBe("completed");
    expect(state.tasks["task-1"].task.activeRunId).toBeNull();
    expect(selectCanStop(state.tasks["task-1"].task)).toBe(false);
    expect(selectCanResume(state.tasks["task-1"].task)).toBe(false);
    expect(selectCanResume(task({ status: "orphaned" }))).toBe(false);
  });

  it("tracks the latest unresolved approval", () => {
    let state = workReducer(initialWorkState, {
      type: "taskUpserted",
      task: task({ status: "waitingForApproval" }),
    });
    state = workReducer(state, {
      type: "workEventReceived",
      event: event("approval-request", 1, {
        type: "approvalRequested",
        command: "python report.py",
        description: "生成报告",
        choices: ["once", "deny"],
      }),
    });
    expect(selectPendingApproval(state, "task-1")?.eventId).toBe(
      "approval-request",
    );

    state = workReducer(state, {
      type: "workEventReceived",
      event: event("approval-resolved", 2, {
        type: "approvalResolved",
        choice: "once",
        resolved: 1,
      }),
    });
    expect(selectPendingApproval(state, "task-1")).toBeNull();
  });
});
