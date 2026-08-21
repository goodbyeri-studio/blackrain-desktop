import path from "node:path";
import * as nodePty from "node-pty";
import {
  TerminalCloseInputSchema,
  TerminalOpenInputSchema,
  TerminalResizeInputSchema,
  TerminalWriteInputSchema,
  type TerminalEvent,
} from "../../shared/terminal";
import type { WorkspaceStore } from "../workspaces/workspace-store";

type PtyProcess = Pick<nodePty.IPty, "write" | "resize" | "kill" | "onData" | "onExit">;
type PtyFactory = (
  executable: string,
  args: string[],
  options: nodePty.IPtyForkOptions | nodePty.IWindowsPtyForkOptions,
) => PtyProcess;

type TerminalSession = {
  workspaceId: string;
  process: PtyProcess;
};

export class TerminalService {
  readonly #workspaces: WorkspaceStore;
  readonly #spawn: PtyFactory;
  readonly #sessions = new Map<string, TerminalSession>();
  readonly #listeners = new Set<(event: TerminalEvent) => void>();

  constructor(
    workspaces: WorkspaceStore,
    spawnPty: PtyFactory = nodePty.spawn,
  ) {
    this.#workspaces = workspaces;
    this.#spawn = spawnPty;
  }

  open(input: unknown): { ok: true } {
    const request = TerminalOpenInputSchema.parse(input);
    if (this.#sessions.has(request.terminalId)) {
      throw new Error("terminalId 已存在");
    }
    const workspace = this.#workspaces.require(request.workspaceId);
    const executable = resolveShellExecutable();
    const terminal = this.#spawn(executable, ["-NoLogo"], {
      name: "xterm-256color",
      cwd: workspace.path,
      cols: request.cols,
      rows: request.rows,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
      },
      useConpty: process.platform === "win32",
    });
    this.#sessions.set(request.terminalId, {
      workspaceId: request.workspaceId,
      process: terminal,
    });
    terminal.onData((data) => {
      this.#emit({
        kind: "data",
        workspaceId: request.workspaceId,
        terminalId: request.terminalId,
        data: data.slice(0, 1024 * 1024),
      });
    });
    terminal.onExit(({ exitCode, signal }) => {
      this.#sessions.delete(request.terminalId);
      this.#emit({
        kind: "exit",
        workspaceId: request.workspaceId,
        terminalId: request.terminalId,
        exitCode: Number.isInteger(exitCode) ? exitCode : null,
        signal: Number.isInteger(signal) ? signal! : null,
      });
    });
    return { ok: true };
  }

  write(input: unknown): { ok: true } {
    const request = TerminalWriteInputSchema.parse(input);
    this.#require(request.workspaceId, request.terminalId).process.write(request.data);
    return { ok: true };
  }

  resize(input: unknown): { ok: true } {
    const request = TerminalResizeInputSchema.parse(input);
    this.#require(request.workspaceId, request.terminalId).process.resize(
      request.cols,
      request.rows,
    );
    return { ok: true };
  }

  close(input: unknown): { ok: true } {
    const request = TerminalCloseInputSchema.parse(input);
    const session = this.#require(request.workspaceId, request.terminalId);
    this.#sessions.delete(request.terminalId);
    session.process.kill();
    return { ok: true };
  }

  subscribe(listener: (event: TerminalEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  dispose(): void {
    for (const session of this.#sessions.values()) session.process.kill();
    this.#sessions.clear();
    this.#listeners.clear();
  }

  #require(workspaceId: string, terminalId: string): TerminalSession {
    this.#workspaces.require(workspaceId);
    const session = this.#sessions.get(terminalId);
    if (!session || session.workspaceId !== workspaceId) {
      throw new Error("terminal 不存在或不属于当前 workspace");
    }
    return session;
  }

  #emit(event: TerminalEvent): void {
    for (const listener of this.#listeners) listener(event);
  }
}

export function resolveShellExecutable(): string {
  if (process.platform !== "win32") return process.env.SHELL?.trim() || "/bin/sh";
  return path.join(
    process.env.ProgramFiles || "C:\\Program Files",
    "PowerShell",
    "7",
    "pwsh.exe",
  );
}
