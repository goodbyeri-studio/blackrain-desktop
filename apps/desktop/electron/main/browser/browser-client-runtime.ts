import { pathToFileURL } from "node:url";
import type { BrowserAgentBackend } from "./browser-dynamic-tool-adapter";
import { BrowserClientTransportServer } from "./browser-client-transport";

type BrowserClient = {
  call(input: {
    sessionId: string;
    turnId: string;
    tool: string;
    arguments: unknown;
  }): Promise<unknown>;
  close(): void;
};

type BrowserClientModule = {
  connectBrowserClient(config: {
    endpoint: string;
    capabilityToken: string;
    protocolVersion: number;
    appBuild: string;
    codexSessionId: string;
    backendGeneration: number;
  }): Promise<BrowserClient>;
};

type BrowserClientSession = {
  client: BrowserClient;
  transport: BrowserClientTransportServer;
};

export type BrowserClientRuntimeOptions = {
  backend: BrowserAgentBackend;
  appBuild: string;
  resolveClientModulePath: () => string;
};

let nextBackendGeneration = 1;

export class BrowserClientRuntime {
  readonly #options: BrowserClientRuntimeOptions;
  readonly #backendGeneration = nextBackendGeneration++;
  readonly #registeredThreads = new Set<string>();
  readonly #sessions = new Map<string, BrowserClientSession>();
  readonly #sessionPromises = new Map<string, Promise<BrowserClientSession>>();
  #modulePromise?: Promise<BrowserClientModule>;

  constructor(options: BrowserClientRuntimeOptions) {
    this.#options = options;
  }

  registerThread(threadId: string): void {
    this.#registeredThreads.add(threadId);
  }

  async unregisterThread(threadId: string): Promise<void> {
    this.#registeredThreads.delete(threadId);
    const session = this.#sessions.get(threadId);
    this.#sessions.delete(threadId);
    this.#sessionPromises.delete(threadId);
    if (!session) return;
    session.client.close();
    await session.transport.stop();
  }

  setActiveTurn(threadId: string, turnId: string): void {
    const session = this.#sessions.get(threadId);
    if (session) session.transport.setActiveTurn(turnId);
  }

  async call(
    threadId: string,
    turnId: string,
    tool: string,
    args: unknown,
    signal: AbortSignal,
  ): Promise<unknown> {
    if (!this.#registeredThreads.has(threadId)) {
      throw new Error("Browser client thread 未注册或已失效");
    }
    const session = await this.#ensureSession(threadId);
    session.transport.setActiveTurn(turnId);
    if (signal.aborted) throw new Error("Browser client request 已取消");
    const handleAbort = () => {
      // 断开单 thread client 会让 transport 取消该连接上的所有 pending 调用；
      // 后续调用按新连接重新握手，不复用旧 request/generation 状态。
      this.#sessions.delete(threadId);
      session.client.close();
      void session.transport.stop();
    };
    signal.addEventListener("abort", handleAbort, { once: true });
    try {
      return await session.client.call({
        sessionId: threadId,
        turnId,
        tool,
        arguments: args,
      });
    } finally {
      signal.removeEventListener("abort", handleAbort);
    }
  }

  completeTurn(threadId: string, turnId: string): void {
    this.#sessions.get(threadId)?.transport.completeTurn(turnId);
  }

  async stop(): Promise<void> {
    this.#registeredThreads.clear();
    const sessions = [...this.#sessions.values()];
    this.#sessions.clear();
    this.#sessionPromises.clear();
    for (const session of sessions) session.client.close();
    await Promise.all(sessions.map((session) => session.transport.stop()));
  }

  async #ensureSession(threadId: string): Promise<BrowserClientSession> {
    const current = this.#sessions.get(threadId);
    if (current) return current;
    const pending = this.#sessionPromises.get(threadId);
    if (pending) return pending;
    const promise = this.#createSession(threadId).finally(() => {
      this.#sessionPromises.delete(threadId);
    });
    this.#sessionPromises.set(threadId, promise);
    return promise;
  }

  async #createSession(threadId: string): Promise<BrowserClientSession> {
    const transport = new BrowserClientTransportServer({
      backend: this.#options.backend,
      appBuild: this.#options.appBuild,
      codexSessionId: threadId,
      backendGeneration: this.#backendGeneration,
    });
    try {
      const [bootstrap, clientModule] = await Promise.all([
        transport.start(),
        this.#loadModule(),
      ]);
      const client = await clientModule.connectBrowserClient(bootstrap);
      const session = { client, transport };
      if (!this.#registeredThreads.has(threadId)) {
        client.close();
        await transport.stop();
        throw new Error("Browser client thread 在握手期间已失效");
      }
      this.#sessions.set(threadId, session);
      return session;
    } catch (error) {
      await transport.stop();
      throw error;
    }
  }

  #loadModule(): Promise<BrowserClientModule> {
    if (!this.#modulePromise) {
      const moduleUrl = pathToFileURL(this.#options.resolveClientModulePath()).href;
      this.#modulePromise = import(moduleUrl).then((loaded: unknown) => {
        const candidate = loaded as Partial<BrowserClientModule>;
        if (typeof candidate.connectBrowserClient !== "function") {
          throw new Error("Browser client 制品缺少 connectBrowserClient 导出");
        }
        return candidate as BrowserClientModule;
      });
    }
    return this.#modulePromise;
  }
}
