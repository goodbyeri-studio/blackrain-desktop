// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkTask } from "../types";
import { WorkTerminalPanel } from "./WorkTerminalPanel";
import { hermesTerminalClose } from "@/services/tauri";
import { useTerminalSession } from "@/features/terminal/hooks/useTerminalSession";

const terminalState = vi.hoisted(() => ({
  cleanup: vi.fn(),
}));

vi.mock("@/features/terminal/hooks/useTerminalSession", () => ({
  useTerminalSession: vi.fn(() => ({
    status: "ready",
    message: "Terminal ready.",
    containerRef: { current: null },
    hasSession: true,
    readyKey: "work:task-1:work-shell",
    cleanupTerminalSession: terminalState.cleanup,
  })),
}));

vi.mock("@/services/tauri", () => ({
  hermesTerminalOpen: vi.fn(),
  hermesTerminalWrite: vi.fn(),
  hermesTerminalResize: vi.fn(),
  hermesTerminalClose: vi.fn().mockResolvedValue(undefined),
}));

const task = {
  taskId: "task-1",
  projectPath: "C:\\Users\\demo\\Office Project",
} as WorkTask;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WorkTerminalPanel", () => {
  it("requires an explicit start and scopes the reused terminal transport to the task", async () => {
    render(<WorkTerminalPanel task={task} />);

    expect(vi.mocked(useTerminalSession).mock.lastCall?.[0]).toMatchObject({
      activeWorkspace: { id: "work:task-1" },
      activeTerminalId: "work-shell",
      isVisible: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "启动终端" }));
    await waitFor(() =>
      expect(vi.mocked(useTerminalSession).mock.lastCall?.[0]).toMatchObject({
        activeWorkspace: { id: "work:task-1" },
        activeTerminalId: "work-shell",
        isVisible: true,
      }),
    );
  });

  it("stops the task terminal and clears its local xterm buffer", async () => {
    render(<WorkTerminalPanel task={task} />);
    fireEvent.click(screen.getByRole("button", { name: "启动终端" }));
    fireEvent.click(await screen.findByRole("button", { name: "停止 WORK 终端" }));

    await waitFor(() =>
      expect(hermesTerminalClose).toHaveBeenCalledWith("task-1", "work-shell"),
    );
    expect(terminalState.cleanup).toHaveBeenCalledWith("work:task-1", "work-shell");
  });
});
