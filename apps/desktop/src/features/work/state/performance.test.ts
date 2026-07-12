import { describe, expect, it } from "vitest";

import type { WorkEvent, WorkTask } from "../types";
import { initialWorkState, workReducer } from "./reducer";
import { buildVisibleWorkEvents, selectOrderedTasks } from "./selectors";

const EVENT_COUNT = 10_000;
const EVENT_BATCH_SIZE = 256;
const TASK_COUNT = 5_000;
const MAX_EVENT_REDUCER_MS = 5_000;
const MAX_VISIBLE_PROJECTION_MS = 1_000;
const MAX_TASK_HYDRATION_MS = 3_000;
const MAX_TASK_SELECTION_MS = 500;
const MAX_SERIALIZED_LONG_SESSION_BYTES = 8 * 1024 * 1024;

function task(index: number): WorkTask {
  return {
    schemaVersion: 1,
    taskId: `task-${index.toString().padStart(5, "0")}`,
    activationId: "activation-office-performance",
    workbenchId: "com.blackrain.office",
    workbenchVersion: "0.1.0",
    projectPath: `C:\\Users\\demo\\Project-${index}`,
    hermesSessionId: `session-${index}`,
    activeRunId: index === 0 ? "run-performance" : null,
    status: index === 0 ? "running" : "completed",
    lastEventSequence: 0,
    createdAt: index + 1,
    updatedAt: index + 1,
    recovery: {},
  };
}

function delta(index: number): WorkEvent {
  return {
    schemaVersion: 1,
    eventId: `event-${index.toString().padStart(5, "0")}`,
    sequence: index + 1,
    taskId: "task-00000",
    runId: "run-performance",
    timestamp: index + 2,
    itemId: "message-performance",
    type: "agentTextDelta",
    delta: "x",
  };
}

describe("WORK performance guardrails", () => {
  it("processes a long session with the production event batch size", () => {
    let state = workReducer(initialWorkState, {
      type: "taskUpserted",
      task: task(0),
    });
    const events = Array.from({ length: EVENT_COUNT }, (_, index) => delta(index));
    const startedAt = performance.now();
    for (let offset = 0; offset < events.length; offset += EVENT_BATCH_SIZE) {
      state = workReducer(state, {
        type: "workEventsReceived",
        events: events.slice(offset, offset + EVENT_BATCH_SIZE),
      });
    }
    const reducerMs = performance.now() - startedAt;

    const projectionStartedAt = performance.now();
    const visible = buildVisibleWorkEvents(state.tasks["task-00000"].events);
    const projectionMs = performance.now() - projectionStartedAt;
    const serializedBytes = new TextEncoder().encode(
      JSON.stringify(state),
    ).byteLength;

    console.info(
      `[work-perf] events=${EVENT_COUNT} batches=${Math.ceil(EVENT_COUNT / EVENT_BATCH_SIZE)} reducerMs=${reducerMs.toFixed(1)} projectionMs=${projectionMs.toFixed(1)} serializedBytes=${serializedBytes}`,
    );
    expect(state.tasks["task-00000"].events).toHaveLength(EVENT_COUNT);
    expect(visible).toHaveLength(1);
    expect(reducerMs).toBeLessThan(MAX_EVENT_REDUCER_MS);
    expect(projectionMs).toBeLessThan(MAX_VISIBLE_PROJECTION_MS);
    expect(serializedBytes).toBeLessThan(MAX_SERIALIZED_LONG_SESSION_BYTES);
  });

  it("hydrates and selects a large task list without changing its order", () => {
    const tasks = Array.from({ length: TASK_COUNT }, (_, index) => task(index));
    const hydrateStartedAt = performance.now();
    const state = workReducer(initialWorkState, {
      type: "tasksLoaded",
      tasks,
    });
    const hydrationMs = performance.now() - hydrateStartedAt;

    const selectStartedAt = performance.now();
    const ordered = selectOrderedTasks(state);
    const selectionMs = performance.now() - selectStartedAt;

    console.info(
      `[work-perf] tasks=${TASK_COUNT} hydrationMs=${hydrationMs.toFixed(1)} selectionMs=${selectionMs.toFixed(1)}`,
    );
    expect(ordered).toHaveLength(TASK_COUNT);
    expect(ordered[0].taskId).toBe(
      `task-${(TASK_COUNT - 1).toString().padStart(5, "0")}`,
    );
    expect(ordered[TASK_COUNT - 1].taskId).toBe("task-00000");
    expect(hydrationMs).toBeLessThan(MAX_TASK_HYDRATION_MS);
    expect(selectionMs).toBeLessThan(MAX_TASK_SELECTION_MS);
  });
});
