import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event, EventCallback, UnlistenFn } from "@tauri-apps/api/event";
import { listen } from "@tauri-apps/api/event";
import type { AppServerEvent } from "../types";
import type { WorkEvent } from "@/features/work/types";
import {
  subscribeAppServerEvents,
  subscribeMenuCycleCollaborationMode,
  subscribeMenuCycleModel,
  subscribeMenuNewAgent,
  subscribeTerminalOutput,
  subscribeWorkEnvironmentReconcile,
  subscribeWorkEvents,
} from "./events";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

describe("events subscriptions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("delivers payloads and unsubscribes on cleanup", async () => {
    let listener: EventCallback<AppServerEvent> = () => {};
    const unlisten = vi.fn();

    vi.mocked(listen).mockImplementation((_event, handler) => {
      listener = handler as EventCallback<AppServerEvent>;
      return Promise.resolve(unlisten);
    });

    const onEvent = vi.fn();
    const cleanup = subscribeAppServerEvents(onEvent);
    const payload: AppServerEvent = {
      workspace_id: "ws-1",
      message: { method: "ping" },
    };

    const event: Event<AppServerEvent> = {
      event: "app-server-event",
      id: 1,
      payload,
    };
    listener(event);
    expect(onEvent).toHaveBeenCalledWith(payload);

    cleanup();
    await Promise.resolve();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("fans out WORK events through one Tauri listener", async () => {
    let listener: EventCallback<WorkEvent> = () => {};
    const unlisten = vi.fn();
    vi.mocked(listen).mockImplementation((eventName, handler) => {
      expect(eventName).toBe("work-event");
      listener = handler as EventCallback<WorkEvent>;
      return Promise.resolve(unlisten);
    });
    const first = vi.fn();
    const second = vi.fn();
    const cleanupFirst = subscribeWorkEvents(first);
    const cleanupSecond = subscribeWorkEvents(second);
    const payload: WorkEvent = {
      schemaVersion: 1,
      eventId: "event-1",
      sequence: 1,
      taskId: "task-1",
      runId: "run-1",
      timestamp: 1,
      itemId: null,
      type: "agentTextDelta",
      delta: "完成",
    };

    listener({ event: "work-event", id: 2, payload });
    expect(first).toHaveBeenCalledWith(payload);
    expect(second).toHaveBeenCalledWith(payload);
    expect(listen).toHaveBeenCalledTimes(1);

    cleanupFirst();
    cleanupSecond();
    await Promise.resolve();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("delivers native WORK environment reconcile signals", async () => {
    let listener: EventCallback<void> = () => {};
    const unlisten = vi.fn();
    vi.mocked(listen).mockImplementation((eventName, handler) => {
      expect(eventName).toBe("work-environment-reconcile");
      listener = handler as EventCallback<void>;
      return Promise.resolve(unlisten);
    });
    const onEvent = vi.fn();
    const cleanup = subscribeWorkEnvironmentReconcile(onEvent);

    listener({
      event: "work-environment-reconcile",
      id: 3,
      payload: undefined,
    });
    expect(onEvent).toHaveBeenCalledTimes(1);

    cleanup();
    await Promise.resolve();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("cleans up listeners that resolve after unsubscribe", async () => {
    let resolveListener: (handler: UnlistenFn) => void = () => {};
    const unlisten = vi.fn();

    vi.mocked(listen).mockImplementation(
      () =>
        new Promise<UnlistenFn>((resolve) => {
          resolveListener = resolve;
        }),
    );

    const cleanup = subscribeMenuNewAgent(() => {});
    cleanup();

    resolveListener(unlisten);
    await Promise.resolve();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("delivers menu events to subscribers", async () => {
    let listener: EventCallback<void> = () => {};
    const unlisten = vi.fn();

    vi.mocked(listen).mockImplementation((_event, handler) => {
      listener = handler as EventCallback<void>;
      return Promise.resolve(unlisten);
    });

    const onEvent = vi.fn();
    const cleanup = subscribeMenuCycleModel(onEvent);

    const event: Event<void> = {
      event: "menu-composer-cycle-model",
      id: 1,
      payload: undefined,
    };
    listener(event);
    expect(onEvent).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("delivers collaboration cycle menu events to subscribers", async () => {
    let listener: EventCallback<void> = () => {};
    const unlisten = vi.fn();

    vi.mocked(listen).mockImplementation((_event, handler) => {
      listener = handler as EventCallback<void>;
      return Promise.resolve(unlisten);
    });

    const onEvent = vi.fn();
    const cleanup = subscribeMenuCycleCollaborationMode(onEvent);

    const event: Event<void> = {
      event: "menu-composer-cycle-collaboration",
      id: 1,
      payload: undefined,
    };
    listener(event);
    expect(onEvent).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("reports listen errors through options", async () => {
    const error = new Error("nope");
    vi.mocked(listen).mockRejectedValueOnce(error);

    const onError = vi.fn();
    const cleanup = subscribeTerminalOutput(() => {}, { onError });

    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith(error);

    cleanup();
  });
});
