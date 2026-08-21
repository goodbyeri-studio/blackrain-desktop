// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlackRainHostApi } from "../../electron/shared/host-api";
import {
  interruptTurn,
  listThreads,
  resumeThread,
  sendUserMessage,
  startThread,
  steerTurn,
} from "./agent";

function installHost() {
  const agent = {
    getStatus: vi.fn(),
    getEvents: vi.fn(),
    onEvent: vi.fn(),
    listThreads: vi.fn().mockResolvedValue({
      data: [{ id: "thread-1", cwd: "C:\\repo" }],
      nextCursor: "cursor-2",
    }),
    startThread: vi.fn().mockResolvedValue({
      threadId: "thread-1",
      thread: { id: "thread-1", turns: [] },
    }),
    resumeThread: vi.fn().mockResolvedValue({
      threadId: "thread-1",
      thread: { id: "thread-1", turns: [{ id: "turn-old" }] },
    }),
    startTurn: vi.fn().mockResolvedValue({
      threadId: "thread-1",
      turnId: "turn-1",
    }),
    steerTurn: vi.fn().mockResolvedValue({
      threadId: "thread-1",
      turnId: "turn-1",
    }),
    interruptTurn: vi.fn().mockResolvedValue({
      threadId: "thread-1",
      turnId: "turn-1",
    }),
  };
  Object.defineProperty(window, "blackrain", {
    configurable: true,
    writable: true,
    value: { agent } as unknown as BlackRainHostApi,
  });
  return agent;
}

afterEach(() => {
  Object.defineProperty(window, "blackrain", {
    configurable: true,
    writable: true,
    value: undefined,
  });
  vi.clearAllMocks();
});

describe("Agent host service", () => {
  it("在 Electron 下投影 thread、turn、steer 与 interrupt typed API", async () => {
    const host = installHost();

    await expect(
      listThreads("workspace-1", "cursor-1", 25, "updated_at"),
    ).resolves.toEqual({
      data: [{ id: "thread-1", cwd: "C:\\repo" }],
      nextCursor: "cursor-2",
    });

    await expect(startThread("workspace-1", "C:\\repo")).resolves.toEqual({
      thread: { id: "thread-1", turns: [] },
    });
    await expect(
      resumeThread("workspace-1", "thread-1", "C:\\repo"),
    ).resolves.toEqual({
      thread: { id: "thread-1", turns: [{ id: "turn-old" }] },
    });
    await expect(
      sendUserMessage("workspace-1", "thread-1", "打开网页", {
        cwd: "C:\\repo",
        model: "gpt-test",
        effort: "high",
        serviceTier: "fast",
        accessMode: "current",
        images: ["https://example.test/image.png"],
        appMentions: [{ name: "calendar", path: "app://calendar" }],
      }),
    ).resolves.toEqual({ turn: { id: "turn-1" } });
    await expect(
      steerTurn("workspace-1", "thread-1", "turn-1", "继续"),
    ).resolves.toEqual({ turnId: "turn-1" });
    await expect(
      interruptTurn("workspace-1", "thread-1", "turn-1"),
    ).resolves.toEqual({ threadId: "thread-1", turnId: "turn-1" });

    expect(host.startThread).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      cwd: "C:\\repo",
    });
    expect(host.listThreads).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      cursor: "cursor-1",
      limit: 25,
      sortKey: "updated_at",
    });
    expect(host.startTurn).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-1",
      prompt: "打开网页",
      cwd: "C:\\repo",
      accessMode: "current",
    }));
    expect(host.steerTurn).toHaveBeenCalledWith({
      threadId: "thread-1",
      turnId: "turn-1",
      prompt: "继续",
      images: undefined,
      appMentions: undefined,
    });
    expect(host.interruptTurn).toHaveBeenCalledWith({
      threadId: "thread-1",
      turnId: "turn-1",
    });
  });

});
