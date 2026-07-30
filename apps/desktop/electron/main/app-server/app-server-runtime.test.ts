import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { BrowserAgentBackend } from "../browser/browser-dynamic-tool-adapter";
import { AppServerRuntime } from "./app-server-runtime";

describe("AppServerRuntime", () => {
  it("跑通 thread/turn/dynamic tool 到唯一 Browser backend", async () => {
    const fixturePath = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const browser: BrowserAgentBackend = {
      listTabsForAgent: vi.fn(() => []),
      navigateForAgent: vi.fn(async () => {
        throw new Error("not used");
      }),
      controlForAgent: vi.fn(() => {
        throw new Error("not used");
      }),
      snapshotForAgent: vi.fn(async () => {
        throw new Error("not used");
      }),
      clickForAgent: vi.fn(async () => {
        throw new Error("not used");
      }),
      typeTextForAgent: vi.fn(async () => {
        throw new Error("not used");
      }),
      screenshotForAgent: vi.fn(async () => {
        throw new Error("not used");
      }),
    };
    let resolveToolResult!: (value: unknown) => void;
    const toolResult = new Promise<unknown>((resolve) => {
      resolveToolResult = resolve;
    });
    const runtime = new AppServerRuntime({
      resolveExecutablePath: () => process.execPath,
      cwd: process.cwd(),
      clientVersion: "0.7.68",
      browserBackend: browser,
      launchArguments: [fixturePath],
      onNotification: (method, params) => {
        if (method === "test/browser-tool-result") resolveToolResult(params);
      },
    });

    await expect(
      runtime.startTurn({ threadId: "thread-other", prompt: "不允许" }),
    ).rejects.toThrow(/未由当前/);
    await expect(runtime.startThread({ cwd: process.cwd() })).resolves.toEqual({
      threadId: "thread-browser-1",
    });
    await expect(
      runtime.startTurn({
        threadId: "thread-browser-1",
        prompt: "列出浏览器标签页",
      }),
    ).resolves.toEqual({
      threadId: "thread-browser-1",
      turnId: "turn-browser-1",
    });
    await expect(toolResult).resolves.toEqual({
      contentItems: [{ type: "inputText", text: "[]" }],
      success: true,
    });
    expect(browser.listTabsForAgent).toHaveBeenCalledWith({
      threadId: "thread-browser-1",
      routeKey: "browser-sidebar",
    });
    await runtime.stop();
    expect(runtime.status().state).toBe("stopped");
  });
});
