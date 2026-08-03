// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTerminalController } from "./useTerminalController";

const mocks = vi.hoisted(() => ({
  closeTerminal: vi.fn(),
  ensureTerminal: vi.fn(),
  terminalTabs: [],
  useTerminalSession: vi.fn((_options: {
    onSessionExit?: (workspaceId: string, terminalId: string) => void;
  }) => ({
    status: "idle" as const,
    message: "",
    containerRef: { current: null },
    hasSession: false,
    readyKey: null,
    cleanupTerminalSession: vi.fn(),
  })),
}));

vi.mock("./useTerminalSession", () => ({
  useTerminalSession: mocks.useTerminalSession,
}));

vi.mock("./useTerminalTabs", () => ({
  useTerminalTabs: () => ({
    terminals: mocks.terminalTabs,
    activeTerminalId: null,
    createTerminal: vi.fn(),
    ensureTerminalWithTitle: vi.fn(),
    closeTerminal: mocks.closeTerminal,
    setActiveTerminal: vi.fn(),
    ensureTerminal: mocks.ensureTerminal,
  }),
}));

describe("useTerminalController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the terminal exit callback stable across unrelated rerenders", () => {
    const onDebug = vi.fn();
    const { rerender } = renderHook(
      ({ terminalOpen }) =>
        useTerminalController({
          activeWorkspaceId: null,
          activeWorkspace: null,
          terminalOpen,
          onDebug,
        }),
      { initialProps: { terminalOpen: false } },
    );

    const firstCall = mocks.useTerminalSession.mock.calls[
      mocks.useTerminalSession.mock.calls.length - 1
    ];
    const firstCallback = firstCall?.[0].onSessionExit;
    rerender({ terminalOpen: false });
    const secondCall = mocks.useTerminalSession.mock.calls[
      mocks.useTerminalSession.mock.calls.length - 1
    ];
    const secondCallback = secondCall?.[0].onSessionExit;

    expect(secondCallback).toBe(firstCallback);
  });
});
