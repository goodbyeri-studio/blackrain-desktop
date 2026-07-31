import { describe, expect, it, vi } from "vitest";
import {
  AgentEventStream,
  MAX_AGENT_EVENTS,
  MAX_AGENT_EVENT_BYTES,
} from "./agent-event-stream";

describe("AgentEventStream", () => {
  it("按 sequence 发布、补拉和退订事件", () => {
    const stream = new AgentEventStream();
    const listener = vi.fn();
    const unsubscribe = stream.subscribe(listener);

    stream.publish("turn/started", { threadId: "thread-1" }, "workspace-1");
    unsubscribe();
    stream.publish("turn/completed", { threadId: "thread-1" }, "workspace-1");

    expect(listener).toHaveBeenCalledOnce();
    expect(stream.read({ afterSequence: 0 })).toEqual({
      events: [
        {
          sequence: 1,
          workspaceId: "workspace-1",
          method: "turn/started",
          params: { threadId: "thread-1" },
        },
        {
          sequence: 2,
          workspaceId: "workspace-1",
          method: "turn/completed",
          params: { threadId: "thread-1" },
        },
      ],
      latestSequence: 2,
      resetRequired: false,
    });
  });

  it("限制队列数量并标记过旧 cursor", () => {
    const stream = new AgentEventStream();
    for (let index = 0; index < MAX_AGENT_EVENTS + 2; index += 1) {
      stream.publish("item/agentMessage/delta", { index }, null);
    }

    const batch = stream.read({ afterSequence: 0 });
    expect(batch.events).toHaveLength(MAX_AGENT_EVENTS);
    expect(batch.events[0]?.sequence).toBe(3);
    expect(batch.latestSequence).toBe(MAX_AGENT_EVENTS + 2);
    expect(batch.resetRequired).toBe(true);
  });

  it("拒绝超大或不可序列化消息且不推进 sequence", () => {
    const stream = new AgentEventStream();
    expect(
      stream.publish("item/agentMessage/delta", {
        delta: "x".repeat(MAX_AGENT_EVENT_BYTES + 1),
      }, null),
    ).toBeNull();
    expect(stream.publish("invalid", { value: 1n }, null)).toBeNull();
    expect(stream.read({ afterSequence: 0 }).latestSequence).toBe(0);
  });
});
