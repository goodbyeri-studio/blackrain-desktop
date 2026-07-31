import path from "node:path";
import { z } from "zod";
import {
  AgentThreadListInputSchema,
  AgentThreadListResponseSchema,
  AgentThreadResumeInputSchema,
  AgentThreadStartInputSchema,
  AgentTurnInterruptInputSchema,
  AgentTurnSteerInputSchema,
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
import { AgentEventStream } from "./agent-event-stream";
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
const TurnSteerResponseSchema = z
  .object({ turnId: identifierSchema })
  .passthrough();
const THREAD_LIST_SOURCE_KINDS = [
  "cli",
  "vscode",
  "appServer",
  "subAgentReview",
  "subAgentCompact",
  "subAgentThreadSpawn",
  "unknown",
] as const;

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
  readonly #events = new AgentEventStream();
  readonly #threads = new Set<string>();
  readonly #threadWorkspaces = new Map<string, string>();
  readonly #threadCwds = new Map<string, string>();
  readonly #workspaceCwds = new Map<string, string>();
  #process?: AppServerProcess;
  #startPromise?: Promise<void>;

  constructor(options: AppServerRuntimeOptions) {
    this.#options = options;
    this.#browserTools = new BrowserDynamicToolAdapter(options.browserBackend);
  }

  status(): AgentRuntimeStatus {
    return { state: this.#process?.state ?? "idle" };
  }

  async listThreads(input: unknown) {
    const request = AgentThreadListInputSchema.parse(input);
    const client = await this.#ensureStarted();
    const response = AgentThreadListResponseSchema.parse(
      await client.request("thread/list", {
        cursor: request.cursor ?? null,
        limit: request.limit ?? null,
        sortKey: request.sortKey ?? null,
        sourceKinds: THREAD_LIST_SOURCE_KINDS,
      }),
    );
    return response;
  }

  async startThread(input: unknown): Promise<AgentThreadAck> {
    const request = AgentThreadStartInputSchema.parse(input);
    assertAbsolutePath(request.cwd, "thread cwd");
    if (request.workspaceId) this.#workspaceCwds.set(request.workspaceId, request.cwd);
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
    this.#threadCwds.set(response.thread.id, request.cwd);
    if (request.workspaceId) {
      this.#threadWorkspaces.set(response.thread.id, request.workspaceId);
    }
    this.#browserTools.registerThread(response.thread.id);
    return { threadId: response.thread.id, thread: response.thread };
  }

  async resumeThread(input: unknown): Promise<AgentThreadAck> {
    const request = AgentThreadResumeInputSchema.parse(input);
    if (request.cwd) assertAbsolutePath(request.cwd, "thread cwd");
    if (request.workspaceId && request.cwd) this.#workspaceCwds.set(request.workspaceId, request.cwd);
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
    const resumedCwd = request.cwd ?? getThreadCwd(response.thread);
    if (resumedCwd) this.#threadCwds.set(response.thread.id, resumedCwd);
    if (request.workspaceId) {
      this.#threadWorkspaces.set(response.thread.id, request.workspaceId);
    }
    this.#browserTools.registerThread(response.thread.id);
    return { threadId: response.thread.id, thread: response.thread };
  }

  async startTurn(input: unknown): Promise<AgentTurnAck> {
    const request = AgentTurnStartInputSchema.parse(input);
    this.#requireThread(request.threadId);
    if (request.cwd) assertAbsolutePath(request.cwd, "turn cwd");
    const client = await this.#ensureStarted();
    const cwd = request.cwd ?? this.#threadCwds.get(request.threadId);
    const response = TurnResponseSchema.parse(
      await client.request("turn/start", buildTurnStartParams(request, cwd)),
    );
    return { threadId: request.threadId, turnId: response.turn.id };
  }

  async steerTurn(input: unknown): Promise<AgentTurnAck> {
    const request = AgentTurnSteerInputSchema.parse(input);
    this.#requireThread(request.threadId);
    if (request.cwd) assertAbsolutePath(request.cwd, "turn cwd");
    const client = await this.#ensureStarted();
    const response = TurnSteerResponseSchema.parse(
      await client.request("turn/steer", {
        threadId: request.threadId,
        expectedTurnId: request.turnId,
        input: buildUserInput(request),
      }),
    );
    return { threadId: request.threadId, turnId: response.turnId };
  }

  async interruptTurn(input: unknown): Promise<AgentTurnAck> {
    const request = AgentTurnInterruptInputSchema.parse(input);
    this.#requireThread(request.threadId);
    const client = await this.#ensureStarted();
    await client.request("turn/interrupt", request);
    return request;
  }

  async stop(): Promise<void> {
    if (!this.#process) {
      this.#resetRuntimeOwnership();
      return;
    }
    await this.#process.stop();
    this.#resetRuntimeOwnership();
  }

  getEvents(input: unknown) {
    return this.#events.read(input);
  }

  subscribeEvents(listener: Parameters<AgentEventStream["subscribe"]>[0]) {
    return this.#events.subscribe(listener);
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
    if (
      this.#process &&
      !["idle", "stopped", "failed"].includes(this.#process.state)
    ) {
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
      onExit: () => {
        if (this.#process !== processSupervisor) return;
        this.#resetRuntimeOwnership();
      },
      connection: {
        serverRequestTimeoutMs: 30_000,
        onServerRequest: (request) =>
          this.#browserTools.handleServerRequest(request),
        onNotification: (method, params) => {
          this.#registerThreadNotification(method, params);
          this.#browserTools.handleNotification(method, params);
          this.#events.publish(
            method,
            params,
            this.#workspaceForNotification(params),
          );
          this.#options.onNotification?.(method, params);
        },
        onDiagnostic: this.#options.onDiagnostic,
      },
    });
    this.#process = processSupervisor;
    await processSupervisor.start();
  }

  #resetRuntimeOwnership(): void {
    this.#browserTools.reset();
    this.#threads.clear();
    this.#threadWorkspaces.clear();
    this.#threadCwds.clear();
    this.#workspaceCwds.clear();
  }

  #workspaceForNotification(params: unknown): string | null {
    if (!params || typeof params !== "object" || Array.isArray(params)) {
      return null;
    }
    const record = params as Record<string, unknown>;
    const thread =
      record.thread && typeof record.thread === "object"
        ? (record.thread as Record<string, unknown>)
        : undefined;
    const turn =
      record.turn && typeof record.turn === "object"
        ? (record.turn as Record<string, unknown>)
        : undefined;
    const threadId = String(
      record.threadId ??
        record.thread_id ??
        thread?.id ??
        turn?.threadId ??
        turn?.thread_id ??
        "",
    ).trim();
    const direct = threadId ? this.#threadWorkspaces.get(threadId) : undefined;
    if (direct) return direct;
    const cwd = getNotificationCwd(record, thread, turn);
    return cwd ? this.#workspaceForCwd(cwd) : null;
  }

  #registerThreadNotification(method: string, params: unknown): void {
    if (method !== "thread/started" || !params || typeof params !== "object") return;
    const record = params as Record<string, unknown>;
    const thread = record.thread;
    if (!thread || typeof thread !== "object" || Array.isArray(thread)) return;
    const threadRecord = thread as Record<string, unknown>;
    const threadId = typeof threadRecord.id === "string" ? threadRecord.id.trim() : "";
    if (!threadId) return;
    const cwd = getThreadCwd(threadRecord);
    if (cwd) this.#threadCwds.set(threadId, cwd);
    const workspaceId = cwd ? this.#workspaceForCwd(cwd) : null;
    if (workspaceId) this.#threadWorkspaces.set(threadId, workspaceId);
    this.#threads.add(threadId);
    this.#browserTools.registerThread(threadId);
  }

  #workspaceForCwd(cwd: string): string | null {
    const normalized = path.resolve(cwd).toLowerCase();
    let match: { workspaceId: string; length: number } | null = null;
    for (const [workspaceId, workspaceCwd] of this.#workspaceCwds) {
      const root = path.resolve(workspaceCwd).toLowerCase();
      if (normalized === root || normalized.startsWith(`${root}${path.sep}`)) {
        if (!match || root.length > match.length) match = { workspaceId, length: root.length };
      }
    }
    return match?.workspaceId ?? null;
  }
}

function assertAbsolutePath(value: string, label: string): void {
  if (!path.isAbsolute(value)) {
    throw new Error(`${label} 必须是绝对路径`);
  }
}

type ParsedTurnInput = z.infer<typeof AgentTurnStartInputSchema>;

function buildTurnStartParams(request: ParsedTurnInput, cwd?: string) {
  const accessMode = request.accessMode ?? "current";
  return {
    threadId: request.threadId,
    input: buildUserInput(request),
    ...(cwd ? { cwd } : {}),
    approvalPolicy: accessMode === "full-access" ? "never" : "on-request",
    sandboxPolicy: buildSandboxPolicy(accessMode, cwd),
    ...(request.model !== undefined ? { model: request.model } : {}),
    ...(request.effort !== undefined ? { effort: request.effort } : {}),
    ...(request.serviceTier !== undefined
      ? { serviceTier: request.serviceTier }
      : {}),
  };
}

function buildSandboxPolicy(
  accessMode: ParsedTurnInput["accessMode"],
  cwd?: string,
) {
  if (accessMode === "full-access") {
    return { type: "dangerFullAccess" };
  }
  if (accessMode === "read-only") {
    return { type: "readOnly", networkAccess: true };
  }
  if (!cwd) {
    throw new Error("current 访问模式要求 turn cwd");
  }
  return {
    type: "workspaceWrite",
    writableRoots: [cwd],
    networkAccess: true,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false,
  };
}

function buildUserInput(request: Pick<ParsedTurnInput, "prompt" | "images" | "appMentions">) {
  const input: Array<Record<string, unknown>> = [];
  const prompt = request.prompt.trim();
  if (prompt) {
    input.push({ type: "text", text: prompt, text_elements: [] });
  }
  for (const image of request.images ?? []) {
    if (isInlineImageUrl(image)) {
      input.push({ type: "image", url: image });
      continue;
    }
    assertAbsolutePath(image, "local image path");
    input.push({ type: "localImage", path: image });
  }
  const mentionPaths = new Set<string>();
  for (const mention of request.appMentions ?? []) {
    if (!mention.path.startsWith("app://") || mention.path.length <= 6) {
      throw new Error("Agent app mention path 必须使用 app://");
    }
    if (mentionPaths.has(mention.path)) continue;
    mentionPaths.add(mention.path);
    input.push({ type: "mention", name: mention.name, path: mention.path });
  }
  return input;
}

function isInlineImageUrl(value: string): boolean {
  return /^(?:data:|https?:\/\/)/i.test(value);
}

function getThreadCwd(thread: Record<string, unknown>): string | undefined {
  const cwd = typeof thread.cwd === "string" ? thread.cwd : undefined;
  return cwd && path.isAbsolute(cwd) ? cwd : undefined;
}

function getNotificationCwd(
  record: Record<string, unknown>,
  thread: Record<string, unknown> | undefined,
  turn: Record<string, unknown> | undefined,
): string | undefined {
  for (const candidate of [record.cwd, thread?.cwd, turn?.cwd]) {
    if (typeof candidate === "string" && path.isAbsolute(candidate)) return candidate;
  }
  return undefined;
}
