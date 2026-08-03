import path from "node:path";
import { z } from "zod";
import {
  AgentThreadListInputSchema,
  AgentThreadListResponseSchema,
  AgentThreadResumeInputSchema,
  AgentServerRequestResponseInputSchema,
  AgentThreadStartInputSchema,
  AgentThreadUnsubscribeInputSchema,
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
import { BrowserClientRuntime } from "../browser/browser-client-runtime";
import { BrowserMcpRuntime } from "../browser/browser-mcp-runtime";
import { AppServerProcess } from "./app-server-process";
import { AgentEventStream } from "./agent-event-stream";
import type { CodexHomeSelection } from "./codex-home";
import type { AppServerServerRequest } from "./rpc-types";
import {
  AgentAppsListInputSchema,
  AgentThreadMutationInputSchema,
  AgentThreadNameInputSchema,
  AgentThreadReadInputSchema,
  AgentWorkspaceInputSchema,
} from "../../shared/desktop";

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
const ThreadUnsubscribeResponseSchema = z
  .object({ status: z.enum(["unsubscribed", "notSubscribed"]) })
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
const FORWARDED_SERVER_REQUESTS = new Set([
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/permissions/requestApproval",
  "item/tool/requestUserInput",
]);

type PendingServerRequest = {
  workspaceId: string;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  abortCleanup: () => void;
};

type SuspendedRuntimeOwnership = {
  threads: Array<{
    threadId: string;
    cwd?: string;
    workspaceId?: string;
  }>;
  workspaceCwds: Array<[workspaceId: string, cwd: string]>;
};

export type AppServerRuntimeOptions = {
  resolveExecutablePath: () => string;
  cwd: string;
  clientVersion: string;
  browserBackend: BrowserAgentBackend;
  resolveBrowserClientPath?: () => string;
  resolveBrowserMcpAdapterPath?: () => string;
  resolveBrowserMcpNodePath?: () => string;
  enableBrowserDynamicToolsBootstrap?: boolean;
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
  readonly #browserMcp?: BrowserMcpRuntime;
  readonly #dynamicToolsBootstrapEnabled: boolean;
  readonly #events = new AgentEventStream();
  readonly #threads = new Set<string>();
  readonly #threadWorkspaces = new Map<string, string>();
  readonly #threadCwds = new Map<string, string>();
  readonly #workspaceCwds = new Map<string, string>();
  readonly #pendingServerRequests = new Map<string, PendingServerRequest>();
  #process?: AppServerProcess;
  #startPromise?: Promise<void>;
  #restartAfterSystemResume = false;
  #suspendedRuntimeOwnership?: SuspendedRuntimeOwnership;

  constructor(options: AppServerRuntimeOptions) {
    this.#options = options;
    const hasMcpConfiguration = Boolean(
      options.resolveBrowserClientPath &&
        options.resolveBrowserMcpAdapterPath &&
        options.resolveBrowserMcpNodePath,
    );
    const dynamicToolsBootstrapEnabled =
      options.enableBrowserDynamicToolsBootstrap === true;
    const hasAnyBrowserRuntimeResolver = Boolean(
      options.resolveBrowserClientPath ||
        options.resolveBrowserMcpAdapterPath ||
        options.resolveBrowserMcpNodePath,
    );
    if (hasMcpConfiguration && dynamicToolsBootstrapEnabled) {
      throw new Error("Browser MCP 与 dynamic tools bootstrap 不能同时启用");
    }
    if (
      hasAnyBrowserRuntimeResolver &&
      !hasMcpConfiguration &&
      !dynamicToolsBootstrapEnabled
    ) {
      throw new Error("Browser MCP 配置不完整，拒绝静默降级到 dynamic tools");
    }
    this.#dynamicToolsBootstrapEnabled = dynamicToolsBootstrapEnabled;
    this.#browserMcp = hasMcpConfiguration
      ? new BrowserMcpRuntime({
          backend: options.browserBackend,
          appBuild: options.clientVersion,
          resolveClientPath: options.resolveBrowserClientPath!,
          resolveAdapterPath: options.resolveBrowserMcpAdapterPath!,
          resolveNodeExecutablePath: options.resolveBrowserMcpNodePath!,
        })
      : undefined;
    const bootstrapClientRuntime =
      dynamicToolsBootstrapEnabled && options.resolveBrowserClientPath
      ? new BrowserClientRuntime({
          backend: options.browserBackend,
          appBuild: options.clientVersion,
          resolveClientModulePath: options.resolveBrowserClientPath,
        })
      : undefined;
    this.#browserTools = new BrowserDynamicToolAdapter(
      options.browserBackend,
      this.#browserMcp ?? bootstrapClientRuntime,
    );
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
        ...(this.#dynamicToolsBootstrapEnabled
          ? { dynamicTools: BROWSER_DYNAMIC_TOOLS }
          : {}),
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

  async listModels(): Promise<Record<string, unknown>> {
    const client = await this.#ensureStarted();
    return requireObject(await client.request("model/list", {
      cursor: null,
      limit: 100,
      includeHidden: false,
    }));
  }

  async readConfig(input: unknown): Promise<Record<string, unknown>> {
    const request = AgentWorkspaceInputSchema.extend({ cwd: z.string() }).parse(input);
    assertAbsolutePath(request.cwd, "config cwd");
    const client = await this.#ensureStarted();
    return requireObject(await client.request("config/read", {
      cwd: request.cwd,
      includeLayers: false,
    }));
  }

  async listCollaborationModes(): Promise<Record<string, unknown>> {
    const client = await this.#ensureStarted();
    return requireObject(await client.request("collaborationMode/list", {}));
  }

  async listSkills(input: unknown): Promise<Record<string, unknown>> {
    const request = AgentWorkspaceInputSchema.extend({ cwd: z.string() }).parse(input);
    assertAbsolutePath(request.cwd, "skills cwd");
    const client = await this.#ensureStarted();
    return requireObject(await client.request("skills/list", {
      cwds: [request.cwd],
      forceReload: false,
    }));
  }

  async listApps(input: unknown): Promise<Record<string, unknown>> {
    const request = AgentAppsListInputSchema.parse(input);
    const client = await this.#ensureStarted();
    return requireObject(await client.request("app/list", {
      cursor: request.cursor ?? null,
      limit: request.limit ?? 100,
      ...(request.threadId ? { threadId: request.threadId } : {}),
    }));
  }

  async readAccount(): Promise<Record<string, unknown>> {
    const client = await this.#ensureStarted();
    return requireObject(await client.request("account/read", {
      refreshToken: false,
    }));
  }

  async readAccountRateLimits(): Promise<Record<string, unknown>> {
    const client = await this.#ensureStarted();
    return requireObject(await client.request("account/rateLimits/read"));
  }

  async readThread(input: unknown): Promise<Record<string, unknown>> {
    const request = AgentThreadReadInputSchema.parse(input);
    const client = await this.#ensureStarted();
    return requireObject(await client.request("thread/read", {
      threadId: request.threadId,
      includeTurns: request.includeTurns ?? true,
    }));
  }

  async archiveThread(input: unknown): Promise<Record<string, unknown>> {
    const request = AgentThreadMutationInputSchema.parse(input);
    const client = await this.#ensureStarted();
    const response = requireObject(await client.request("thread/archive", {
      threadId: request.threadId,
    }));
    await this.#browserTools.unregisterThread(request.threadId);
    this.#threads.delete(request.threadId);
    this.#threadCwds.delete(request.threadId);
    this.#threadWorkspaces.delete(request.threadId);
    return response;
  }

  async setThreadName(input: unknown): Promise<Record<string, unknown>> {
    const request = AgentThreadNameInputSchema.parse(input);
    const client = await this.#ensureStarted();
    return requireObject(await client.request("thread/name/set", {
      threadId: request.threadId,
      name: request.name,
    }));
  }

  respondToServerRequest(input: unknown): { ok: true } {
    const response = AgentServerRequestResponseInputSchema.parse(input);
    const key = rpcIdKey(response.requestId);
    const pending = this.#pendingServerRequests.get(key);
    if (!pending || pending.workspaceId !== response.workspaceId) {
      throw new Error("App Server request 已失效或不属于当前 workspace");
    }
    this.#pendingServerRequests.delete(key);
    pending.abortCleanup();
    pending.resolve(response.result);
    return { ok: true };
  }

  async prepareForSystemSuspend(): Promise<void> {
    const shouldRestart =
      this.#process?.state === "starting" ||
      this.#process?.state === "ready" ||
      Boolean(this.#startPromise);
    this.#restartAfterSystemResume ||= shouldRestart;
    if (this.#startPromise) {
      await this.#startPromise.catch(() => undefined);
    }
    const ownership = shouldRestart ? this.#snapshotRuntimeOwnership() : undefined;
    await this.stop();
    if (ownership) this.#suspendedRuntimeOwnership = ownership;
  }

  async resumeFromSystemSleep(): Promise<void> {
    if (!this.#restartAfterSystemResume) return;
    const ownership = this.#suspendedRuntimeOwnership;
    try {
      await this.#ensureStarted();
      if (ownership) {
        for (const [workspaceId, cwd] of ownership.workspaceCwds) {
          this.#workspaceCwds.set(workspaceId, cwd);
        }
        for (const thread of ownership.threads) {
          const resumed = await this.resumeThread({
            threadId: thread.threadId,
            ...(thread.cwd ? { cwd: thread.cwd } : {}),
            ...(thread.workspaceId ? { workspaceId: thread.workspaceId } : {}),
          });
          if (resumed.threadId !== thread.threadId) {
            throw new Error("系统唤醒后 App Server 恢复了不一致的 thread");
          }
        }
      }
      this.#suspendedRuntimeOwnership = undefined;
      this.#restartAfterSystemResume = false;
    } catch (error) {
      await this.stop().catch(() => undefined);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.#restartAfterSystemResume) {
      this.#suspendedRuntimeOwnership = undefined;
    }
    if (!this.#process) {
      await this.#browserTools.stop();
      this.#resetRuntimeOwnership();
      return;
    }
    await this.#process.stop();
    await this.#browserTools.stop();
    this.#resetRuntimeOwnership();
  }

  async unsubscribeThread(input: unknown) {
    const request = AgentThreadUnsubscribeInputSchema.parse(input);
    this.#requireThread(request.threadId);
    const client = await this.#ensureStarted();
    const response = ThreadUnsubscribeResponseSchema.parse(
      await client.request("thread/unsubscribe", request),
    );
    await this.#browserTools.unregisterThread(request.threadId);
    this.#threads.delete(request.threadId);
    this.#threadCwds.delete(request.threadId);
    this.#threadWorkspaces.delete(request.threadId);
    return { threadId: request.threadId, status: response.status };
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
    const browserMcpLaunch = await this.#browserMcp?.start();
    const processSupervisor = new AppServerProcess({
      executablePath: this.#options.resolveExecutablePath(),
      cwd: this.#options.cwd,
      clientVersion: this.#options.clientVersion,
      environment: {
        ...this.#options.environment,
        ...browserMcpLaunch?.environment,
      },
      codexHome: this.#options.codexHome,
      extraCodexArgs: [
        ...(browserMcpLaunch?.codexArgs ?? []),
        ...(this.#options.extraCodexArgs ?? []),
      ],
      launchArguments: this.#options.launchArguments,
      onExit: () => {
        if (this.#process !== processSupervisor) return;
        this.#resetRuntimeOwnership();
        void this.#browserTools.stop();
      },
      connection: {
        serverRequestTimeoutMs: 30_000,
        onServerRequest: (request) => this.#handleServerRequest(request),
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
    try {
      await processSupervisor.start();
    } catch (error) {
      await this.#browserTools.stop();
      throw error;
    }
  }

  #resetRuntimeOwnership(): void {
    this.#rejectPendingServerRequests("App Server runtime 已停止或重启");
    this.#browserTools.reset();
    this.#threads.clear();
    this.#threadWorkspaces.clear();
    this.#threadCwds.clear();
    this.#workspaceCwds.clear();
  }

  #snapshotRuntimeOwnership(): SuspendedRuntimeOwnership {
    return {
      threads: [...this.#threads].map((threadId) => ({
        threadId,
        ...(this.#threadCwds.get(threadId)
          ? { cwd: this.#threadCwds.get(threadId) }
          : {}),
        ...(this.#threadWorkspaces.get(threadId)
          ? { workspaceId: this.#threadWorkspaces.get(threadId) }
          : {}),
      })),
      workspaceCwds: [...this.#workspaceCwds],
    };
  }

  #handleServerRequest(request: AppServerServerRequest): Promise<unknown> {
    if (request.method === "item/tool/call") {
      if (!this.#dynamicToolsBootstrapEnabled) {
        return Promise.reject(new Error("发布态不接受 dynamic Browser tool request"));
      }
      return this.#browserTools.handleServerRequest(request);
    }
    if (!FORWARDED_SERVER_REQUESTS.has(request.method)) {
      return Promise.reject(new Error(`未支持的 App Server request: ${request.method}`));
    }
    const workspaceId = this.#workspaceForNotification(request.params);
    if (!workspaceId) {
      return Promise.reject(new Error("App Server request 无法绑定到已注册 workspace"));
    }
    const key = rpcIdKey(request.id);
    if (this.#pendingServerRequests.has(key)) {
      return Promise.reject(new Error("App Server request id 重复"));
    }
    return new Promise((resolve, reject) => {
      const handleAbort = () => {
        const pending = this.#pendingServerRequests.get(key);
        if (!pending) return;
        this.#pendingServerRequests.delete(key);
        pending.abortCleanup();
        reject(new Error("App Server request 已取消或超时"));
      };
      request.signal.addEventListener("abort", handleAbort, { once: true });
      const pending: PendingServerRequest = {
        workspaceId,
        resolve,
        reject,
        abortCleanup: () => request.signal.removeEventListener("abort", handleAbort),
      };
      this.#pendingServerRequests.set(key, pending);
      if (request.signal.aborted) {
        handleAbort();
        return;
      }
      const published = this.#events.publish(
        request.method,
        request.params,
        workspaceId,
        request.id,
      );
      if (!published) {
        this.#pendingServerRequests.delete(key);
        pending.abortCleanup();
        reject(new Error("App Server request 超出事件大小上限"));
      }
    });
  }

  #rejectPendingServerRequests(reason: string): void {
    const pendingRequests = [...this.#pendingServerRequests.values()];
    this.#pendingServerRequests.clear();
    for (const pending of pendingRequests) {
      pending.abortCleanup();
      pending.reject(new Error(reason));
    }
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

function rpcIdKey(id: string | number): string {
  return `${typeof id}:${id}`;
}

function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("App Server 返回了非对象响应");
  }
  return value as Record<string, unknown>;
}
