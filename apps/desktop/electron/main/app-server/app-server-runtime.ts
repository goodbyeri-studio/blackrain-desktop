import path from "node:path";
import { z } from "zod";
import {
  AgentThreadResumeInputSchema,
  AgentThreadStartInputSchema,
  AgentTurnInterruptInputSchema,
  AgentTurnStartInputSchema,
  type AgentRuntimeStatus,
  type AgentThreadAck,
  type AgentTurnAck,
} from "../../shared/agent";
import {
  BROWSER_DYNAMIC_TOOLS,
  BrowserDynamicToolAdapter,
  type BrowserAgentBackend,
} from "../browser/browser-dynamic-tool-adapter";
import { AppServerProcess } from "./app-server-process";
import type { CodexHomeSelection } from "./codex-home";

const identifierSchema = z.string().trim().min(1).max(128);
const ThreadResponseSchema = z
  .object({
    thread: z.object({ id: identifierSchema }).passthrough(),
  })
  .passthrough();
const TurnResponseSchema = z
  .object({
    turn: z.object({ id: identifierSchema }).passthrough(),
  })
  .passthrough();

export type AppServerRuntimeOptions = {
  resolveExecutablePath: () => string;
  cwd: string;
  clientVersion: string;
  browserBackend: BrowserAgentBackend;
  environment?: NodeJS.ProcessEnv;
  codexHome?: CodexHomeSelection;
  extraCodexArgs?: readonly string[];
  launchArguments?: readonly string[];
  onNotification?: (method: string, params: unknown) => void;
  onDiagnostic?: (line: string) => void;
};

export class AppServerRuntime {
  readonly #options: AppServerRuntimeOptions;
  readonly #browserTools: BrowserDynamicToolAdapter;
  readonly #threads = new Set<string>();
  #process?: AppServerProcess;
  #startPromise?: Promise<void>;

  constructor(options: AppServerRuntimeOptions) {
    this.#options = options;
    this.#browserTools = new BrowserDynamicToolAdapter(options.browserBackend);
  }

  status(): AgentRuntimeStatus {
    return { state: this.#process?.state ?? "idle" };
  }

  async startThread(input: unknown): Promise<AgentThreadAck> {
    const request = AgentThreadStartInputSchema.parse(input);
    assertAbsolutePath(request.cwd, "thread cwd");
    const client = await this.#ensureStarted();
    const response = ThreadResponseSchema.parse(
      await client.request("thread/start", {
        cwd: request.cwd,
        runtimeWorkspaceRoots: [request.cwd],
        approvalPolicy: "on-request",
        sandbox: "workspace-write",
        threadSource: "blackrain",
        dynamicTools: BROWSER_DYNAMIC_TOOLS,
      }),
    );
    this.#threads.add(response.thread.id);
    this.#browserTools.registerThread(response.thread.id);
    return { threadId: response.thread.id };
  }

  async resumeThread(input: unknown): Promise<AgentThreadAck> {
    const request = AgentThreadResumeInputSchema.parse(input);
    if (request.cwd) assertAbsolutePath(request.cwd, "thread cwd");
    const client = await this.#ensureStarted();
    const response = ThreadResponseSchema.parse(
      await client.request("thread/resume", {
        threadId: request.threadId,
        ...(request.cwd
          ? { cwd: request.cwd, runtimeWorkspaceRoots: [request.cwd] }
          : {}),
      }),
    );
    this.#threads.add(response.thread.id);
    this.#browserTools.registerThread(response.thread.id);
    return { threadId: response.thread.id };
  }

  async startTurn(input: unknown): Promise<AgentTurnAck> {
    const request = AgentTurnStartInputSchema.parse(input);
    this.#requireThread(request.threadId);
    if (request.cwd) assertAbsolutePath(request.cwd, "turn cwd");
    const client = await this.#ensureStarted();
    const response = TurnResponseSchema.parse(
      await client.request("turn/start", {
        threadId: request.threadId,
        input: [{ type: "text", text: request.prompt }],
        ...(request.cwd ? { cwd: request.cwd } : {}),
      }),
    );
    return { threadId: request.threadId, turnId: response.turn.id };
  }

  async interruptTurn(input: unknown): Promise<AgentTurnAck> {
    const request = AgentTurnInterruptInputSchema.parse(input);
    this.#requireThread(request.threadId);
    const client = await this.#ensureStarted();
    await client.request("turn/interrupt", request);
    return request;
  }

  async stop(): Promise<void> {
    if (!this.#process) return;
    await this.#process.stop();
  }

  async #ensureStarted() {
    if (this.#process?.state === "ready") return this.#process.client;
    if (!this.#startPromise) {
      this.#startPromise = this.#startProcess();
    }
    try {
      await this.#startPromise;
    } finally {
      this.#startPromise = undefined;
    }
    return this.#requireReadyClient();
  }

  #requireReadyClient() {
    if (!this.#process || this.#process.state !== "ready") {
      throw new Error("App Server runtime 启动后未进入 ready");
    }
    return this.#process.client;
  }

  #requireThread(threadId: string): void {
    if (!this.#threads.has(threadId)) {
      throw new Error("Agent thread 未由当前 App Server runtime start/resume");
    }
  }

  async #startProcess(): Promise<void> {
    if (this.#process && this.#process.state !== "idle") {
      throw new Error(`App Server runtime 当前不可启动: ${this.#process.state}`);
    }
    const processSupervisor = new AppServerProcess({
      executablePath: this.#options.resolveExecutablePath(),
      cwd: this.#options.cwd,
      clientVersion: this.#options.clientVersion,
      environment: this.#options.environment,
      codexHome: this.#options.codexHome,
      extraCodexArgs: this.#options.extraCodexArgs,
      launchArguments: this.#options.launchArguments,
      connection: {
        serverRequestTimeoutMs: 30_000,
        onServerRequest: (request) =>
          this.#browserTools.handleServerRequest(request),
        onNotification: (method, params) => {
          this.#browserTools.handleNotification(method, params);
          this.#options.onNotification?.(method, params);
        },
        onDiagnostic: this.#options.onDiagnostic,
      },
    });
    this.#process = processSupervisor;
    await processSupervisor.start();
  }
}

function assertAbsolutePath(value: string, label: string): void {
  if (!path.isAbsolute(value)) {
    throw new Error(`${label} 必须是绝对路径`);
  }
}
