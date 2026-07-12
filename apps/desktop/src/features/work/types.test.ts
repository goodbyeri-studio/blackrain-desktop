import { describe, expect, it } from "vitest";

import rawMessageDelta from "../../../src-tauri/test-fixtures/hermes/v2026.7.7.2/event-message-delta.json";
import rawUnknown from "../../../src-tauri/test-fixtures/hermes/v2026.7.7.2/event-unknown.json";
import workAgentDelta from "../../../src-tauri/test-fixtures/hermes/v2026.7.7.2/work-event-agent-delta.json";
import workUserMessage from "../../../src-tauri/test-fixtures/hermes/v2026.7.7.2/work-event-user-message.json";
import activatedWorkbench from "../../../src-tauri/test-fixtures/workbench/v1/activated-workbench-context.json";
import {
  isActivatedWorkbenchContext,
  isHermesRawEvent,
  isWorkEvent,
  WORK_SCHEMA_VERSION,
  type WorkEvent,
} from "./types";

describe("Hermes WORK contracts", () => {
  it("accepts locked Hermes known and unknown raw events", () => {
    expect(isHermesRawEvent(rawMessageDelta)).toBe(true);
    expect(isHermesRawEvent(rawUnknown)).toBe(true);
  });

  it("accepts the Rust-shared WorkEvent fixture", () => {
    expect(isWorkEvent(workAgentDelta)).toBe(true);
    const event = workAgentDelta as WorkEvent;
    expect(event.schemaVersion).toBe(WORK_SCHEMA_VERSION);
    expect(event.type).toBe("agentTextDelta");
    if (event.type === "agentTextDelta") {
      expect(event.delta).toBe("正在读取季度报告。");
    }
  });

  it("accepts persisted user messages with project file references", () => {
    expect(isWorkEvent(workUserMessage)).toBe(true);
    const event = workUserMessage as WorkEvent;
    expect(event.type).toBe("userMessageAdded");
    if (event.type === "userMessageAdded") {
      expect(event.projectFileRefs).toEqual([
        "C:\\Users\\demo\\Office Project\\reports\\quarterly.xlsx",
      ]);
    }
  });

  it("rejects unknown normalized event types", () => {
    expect(isWorkEvent({ ...workAgentDelta, type: "futureEvent" })).toBe(false);
  });

  it("rejects malformed known normalized events", () => {
    expect(
      isWorkEvent({ ...workAgentDelta, type: "toolCompleted", tool: "read_file" }),
    ).toBe(false);
  });

  it("accepts the Rust-shared activated workbench context fixture", () => {
    expect(isActivatedWorkbenchContext(activatedWorkbench)).toBe(true);
    expect(
      isActivatedWorkbenchContext({
        ...activatedWorkbench,
        engine: "code",
      }),
    ).toBe(false);
  });
});
