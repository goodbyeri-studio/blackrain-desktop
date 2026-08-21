import { describe, expect, it, vi } from "vitest";
import { TerminalService } from "./terminal-service";

describe("TerminalService", () => {
  it("绑定 workspace ownership 并转发 ConPTY data/exit", () => {
    let dataListener: (data: string) => void = () => undefined;
    let exitListener: (event: { exitCode: number; signal: number }) => void = () => undefined;
    const pty = {
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn((listener) => {
        dataListener = listener;
        return { dispose: vi.fn() };
      }),
      onExit: vi.fn((listener) => {
        exitListener = listener;
        return { dispose: vi.fn() };
      }),
    };
    const spawn = vi.fn(() => pty);
    const workspaces = {
      require: vi.fn((id: string) => ({ id, path: "C:\\work\\repo" })),
    };
    const service = new TerminalService(workspaces as never, spawn as never);
    const events: unknown[] = [];
    service.subscribe((event) => events.push(event));

    expect(service.open({ workspaceId: "ws", terminalId: "term", cols: 80, rows: 24 })).toEqual({ ok: true });
    service.write({ workspaceId: "ws", terminalId: "term", data: "git status\r" });
    service.resize({ workspaceId: "ws", terminalId: "term", cols: 120, rows: 40 });
    dataListener("output");
    exitListener({ exitCode: 0, signal: 0 });

    expect(pty.write).toHaveBeenCalledWith("git status\r");
    expect(pty.resize).toHaveBeenCalledWith(120, 40);
    expect(events).toEqual([
      { kind: "data", workspaceId: "ws", terminalId: "term", data: "output" },
      { kind: "exit", workspaceId: "ws", terminalId: "term", exitCode: 0, signal: 0 },
    ]);
  });

  it("拒绝跨 workspace 访问 terminal", () => {
    const pty = {
      write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
      onData: vi.fn(() => ({ dispose: vi.fn() })),
      onExit: vi.fn(() => ({ dispose: vi.fn() })),
    };
    const service = new TerminalService(
      { require: vi.fn((id: string) => ({ id, path: "C:\\work\\repo" })) } as never,
      vi.fn(() => pty) as never,
    );
    service.open({ workspaceId: "ws-1", terminalId: "term", cols: 80, rows: 24 });
    expect(() => service.write({ workspaceId: "ws-2", terminalId: "term", data: "x" })).toThrow("不属于");
  });
});
