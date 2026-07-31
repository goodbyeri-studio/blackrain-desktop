import {
  AgentEventCursorInputSchema,
  AgentEventSchema,
  type AgentEvent,
  type AgentEventBatch,
} from "../../shared/agent";

export const MAX_AGENT_EVENTS = 512;
export const MAX_AGENT_EVENT_BYTES = 1024 * 1024;

type AgentEventListener = (event: AgentEvent) => void;

export class AgentEventStream {
  readonly #events: AgentEvent[] = [];
  readonly #listeners = new Set<AgentEventListener>();
  #latestSequence = 0;

  publish(
    method: string,
    params: unknown,
    workspaceId: string | null,
  ): AgentEvent | null {
    let cloned: { method: string; params: unknown };
    try {
      const serialized = JSON.stringify({ method, params });
      if (Buffer.byteLength(serialized, "utf8") > MAX_AGENT_EVENT_BYTES) {
        return null;
      }
      cloned = JSON.parse(serialized) as { method: string; params: unknown };
    } catch {
      return null;
    }

    const event = AgentEventSchema.parse({
      sequence: ++this.#latestSequence,
      workspaceId,
      method: cloned.method,
      params: cloned.params,
    });
    this.#events.push(event);
    if (this.#events.length > MAX_AGENT_EVENTS) {
      this.#events.splice(0, this.#events.length - MAX_AGENT_EVENTS);
    }
    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch {
        // 单个窗口监听器失败不能阻断 App Server stdout 消费。
      }
    }
    return event;
  }

  read(input: unknown): AgentEventBatch {
    const { afterSequence } = AgentEventCursorInputSchema.parse(input);
    const oldestSequence = this.#events[0]?.sequence ?? this.#latestSequence + 1;
    return {
      events: this.#events.filter((event) => event.sequence > afterSequence),
      latestSequence: this.#latestSequence,
      resetRequired:
        this.#events.length > 0 && afterSequence < oldestSequence - 1,
    };
  }

  subscribe(listener: AgentEventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}
