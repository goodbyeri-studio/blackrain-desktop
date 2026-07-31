import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event, EventCallback, UnlistenFn } from "@tauri-apps/api/event";
import { listen } from "@tauri-apps/api/event";
import type { AppServerEvent } from "../types";
import type { BlackRainHostApi } from "../../electron/shared/host-api";
import type { AgentEvent } from "../../electron/shared/agent";
import {
  subscribeAppServerEvents,
  subscribeMenuCycleCollaborationMode,
  subscribeMenuCycleModel,
  subscribeMenuNewAgent,
  subscribeTerminalOutput,
} from "./events";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

describe("events subscriptions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it("在 Electron 中补拉、排序并去重 typed App Server 事件", async () => {
    vi.stubGlobal("window", {});
    let liveListener: ((event: AgentEvent) => void) | undefined;
    let resolveBatch!: (value: Awaited<ReturnType<BlackRainHostApi["agent"]["getEvents"]>>) => void;
    const stopHost = vi.fn();
    window.blackrain = {
      agent: {
        onEvent(listener: (event: AgentEvent) => void) {
          liveListener = listener;
          return stopHost;
        },
        getEvents: vi.fn(
          () =>
            new Promise((resolve) => {
              resolveBatch = resolve;
            }),
        ),
      },
    } as unknown as BlackRainHostApi;

    const onEvent = vi.fn();
    const cleanup = subscribeAppServerEvents(onEvent);
    expect(liveListener).toBeTypeOf("function");
    liveListener!({
      sequence: 2,
      workspaceId: "workspace-1",
      method: "turn/completed",
      params: { threadId: "thread-1" },
    });
    resolveBatch({
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
    await Promise.resolve();
    await Promise.resolve();

    expect(onEvent.mock.calls.map(([event]) => event.message.method)).toEqual([
      "turn/started",
      "turn/completed",
    ]);
    expect(onEvent.mock.calls[0]?.[0].workspace_id).toBe("workspace-1");
    expect(listen).not.toHaveBeenCalled();

    cleanup();
    expect(stopHost).toHaveBeenCalledOnce();
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
