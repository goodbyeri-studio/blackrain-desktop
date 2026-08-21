// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlackRainHostApi } from "../../electron/shared/host-api";
import type { AgentEvent } from "../../electron/shared/agent";
import type { TerminalEvent } from "../../electron/shared/terminal";
import {
  subscribeAppServerEvents,
  subscribeTerminalExit,
  subscribeTerminalOutput,
} from "./events";

afterEach(() => {
  delete window.blackrain;
  vi.restoreAllMocks();
});

describe("Electron typed 事件入口", () => {
  it("补拉、排序并去重 App Server 事件", async () => {
    let liveListener: ((event: AgentEvent) => void) | undefined;
    let resolveBatch!: (value: Awaited<ReturnType<BlackRainHostApi["agent"]["getEvents"]>>) => void;
    const stopHost = vi.fn();
    window.blackrain = {
      agent: {
        onEvent(listener: (event: AgentEvent) => void) {
          liveListener = listener;
          return stopHost;
        },
        getEvents: vi.fn(() => new Promise((resolve) => {
          resolveBatch = resolve;
        })),
      },
    } as unknown as BlackRainHostApi;

    const onEvent = vi.fn();
    const cleanup = subscribeAppServerEvents(onEvent);
    liveListener!({
      sequence: 2,
      workspaceId: "workspace-1",
      method: "turn/completed",
      params: { threadId: "thread-1" },
    });
    resolveBatch({
      events: [
        { sequence: 1, workspaceId: "workspace-1", method: "turn/started", params: {} },
        { sequence: 2, workspaceId: "workspace-1", method: "turn/completed", params: {} },
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
    cleanup();
    expect(stopHost).toHaveBeenCalledOnce();
  });

  it("统一扇出 terminal data/exit 并在最后一个订阅释放时解绑", () => {
    let listener: ((event: TerminalEvent) => void) | undefined;
    const stopHost = vi.fn();
    window.blackrain = {
      terminal: {
        onEvent(next: (event: TerminalEvent) => void) {
          listener = next;
          return stopHost;
        },
      },
    } as unknown as BlackRainHostApi;
    const onOutput = vi.fn();
    const onExit = vi.fn();
    const stopOutput = subscribeTerminalOutput(onOutput);
    const stopExit = subscribeTerminalExit(onExit);

    listener!({ kind: "data", workspaceId: "ws", terminalId: "term", data: "hello" });
    listener!({ kind: "exit", workspaceId: "ws", terminalId: "term", exitCode: 0, signal: null });
    expect(onOutput).toHaveBeenCalledWith(expect.objectContaining({ data: "hello" }));
    expect(onExit).toHaveBeenCalledWith({ workspaceId: "ws", terminalId: "term" });

    stopOutput();
    expect(stopHost).not.toHaveBeenCalled();
    stopExit();
    expect(stopHost).toHaveBeenCalledOnce();
  });
});
