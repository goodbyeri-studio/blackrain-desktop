import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  BrowserAgentBackend,
  BrowserToolLifecycle,
} from "./browser-dynamic-tool-adapter";
import {
  BrowserClientTransportServer,
  type BrowserClientBootstrap,
} from "./browser-client-transport";

export const BROWSER_MCP_SERVER_NAME = "blackrain_browser";
export const BROWSER_MCP_SHELL_ENV_FILTER = "BLACKRAIN_BROWSER_*";

const ENV = Object.freeze({
  endpoint: "BLACKRAIN_BROWSER_ENDPOINT",
  token: "BLACKRAIN_BROWSER_CAPABILITY_TOKEN",
  protocol: "BLACKRAIN_BROWSER_PROTOCOL_VERSION",
  appBuild: "BLACKRAIN_BROWSER_APP_BUILD",
  brokerId: "BLACKRAIN_BROWSER_BROKER_ID",
  generation: "BLACKRAIN_BROWSER_BACKEND_GENERATION",
  clientPath: "BLACKRAIN_BROWSER_CLIENT_PATH",
});
const BROWSER_MCP_ENV_NAMES = Object.freeze(Object.values(ENV));

export type BrowserMcpRuntimeOptions = {
  backend: BrowserAgentBackend;
  appBuild: string;
  resolveNodeExecutablePath: () => string;
  resolveAdapterPath: () => string;
  resolveClientPath: () => string;
};

export type BrowserMcpLaunch = Readonly<{
  codexArgs: readonly string[];
  environment: NodeJS.ProcessEnv;
}>;

let nextBackendGeneration = 1;

export class BrowserMcpRuntime implements BrowserToolLifecycle {
  readonly #options: BrowserMcpRuntimeOptions;
  readonly #brokerId = `blackrain-${randomUUID()}`;
  readonly #registeredThreads = new Set<string>();
  readonly #activeTurns = new Map<string, string>();
  #transport?: BrowserClientTransportServer;
  #launch?: BrowserMcpLaunch;
  #startPromise?: Promise<BrowserMcpLaunch>;

  constructor(options: BrowserMcpRuntimeOptions) {
    this.#options = options;
  }

  start(): Promise<BrowserMcpLaunch> {
    if (this.#launch) return Promise.resolve(this.#launch);
    if (this.#startPromise) return this.#startPromise;
    this.#startPromise = this.#start().finally(() => {
      this.#startPromise = undefined;
    });
    return this.#startPromise;
  }

  registerThread(threadId: string): void {
    this.#registeredThreads.add(threadId);
    this.#transport?.registerThread(threadId);
  }

  unregisterThread(threadId: string): void {
    this.#registeredThreads.delete(threadId);
    this.#activeTurns.delete(threadId);
    this.#transport?.unregisterThread(threadId);
  }

  setActiveTurn(threadId: string, turnId: string): void {
    this.#activeTurns.set(threadId, turnId);
    this.#transport?.setActiveTurn(threadId, turnId);
  }

  completeTurn(threadId: string, turnId: string): void {
    if (this.#activeTurns.get(threadId) !== turnId) return;
    this.#activeTurns.delete(threadId);
    this.#transport?.completeTurn(threadId, turnId);
  }

  async stop(): Promise<void> {
    const transport = this.#transport;
    this.#transport = undefined;
    this.#launch = undefined;
    this.#registeredThreads.clear();
    this.#activeTurns.clear();
    await transport?.stop();
  }

  async #start(): Promise<BrowserMcpLaunch> {
    const nodeExecutablePath = this.#options.resolveNodeExecutablePath();
    const adapterPath = assertAbsoluteFilePath(
      this.#options.resolveAdapterPath(),
      "Browser MCP adapter",
    );
    const clientPath = assertAbsoluteFilePath(
      this.#options.resolveClientPath(),
      "Browser client",
    );
    const transport = new BrowserClientTransportServer({
      backend: this.#options.backend,
      appBuild: this.#options.appBuild,
      codexSessionId: this.#brokerId,
      backendGeneration: nextBackendGeneration++,
      multiSession: true,
    });
    this.#transport = transport;
    for (const threadId of this.#registeredThreads) {
      transport.registerThread(threadId);
    }
    for (const [threadId, turnId] of this.#activeTurns) {
      transport.setActiveTurn(threadId, turnId);
    }
    try {
      const bootstrap = await transport.start();
      const launch = Object.freeze({
        codexArgs: buildBrowserMcpCodexArguments(
          nodeExecutablePath,
          adapterPath,
        ),
        environment: buildBrowserMcpEnvironment(bootstrap, clientPath),
      });
      this.#launch = launch;
      return launch;
    } catch (error) {
      this.#transport = undefined;
      await transport.stop();
      throw error;
    }
  }
}

export function buildBrowserMcpCodexArguments(
  nodeExecutablePath: string,
  adapterPath: string,
): string[] {
  if (!nodeExecutablePath.trim()) {
    throw new Error("Browser MCP Node executable 缺失");
  }
  assertAbsoluteFilePath(adapterPath, "Browser MCP adapter");
  const prefix = `mcp_servers.${BROWSER_MCP_SERVER_NAME}`;
  return [
    "-c",
    `shell_environment_policy.filters.${tomlString(BROWSER_MCP_SHELL_ENV_FILTER)}="exclude"`,
    "-c",
    `${prefix}.command=${tomlString(nodeExecutablePath)}`,
    "-c",
    `${prefix}.args=[${tomlString(adapterPath)}]`,
    "-c",
    `${prefix}.env_vars=[${BROWSER_MCP_ENV_NAMES.map(tomlString).join(",")}]`,
    "-c",
    `${prefix}.required=true`,
    "-c",
    `${prefix}.startup_timeout_sec=20`,
    "-c",
    `${prefix}.tool_timeout_sec=35`,
    "-c",
    `${prefix}.supports_parallel_tool_calls=false`,
  ];
}

function buildBrowserMcpEnvironment(
  bootstrap: BrowserClientBootstrap,
  clientPath: string,
): NodeJS.ProcessEnv {
  return {
    [ENV.endpoint]: bootstrap.endpoint,
    [ENV.token]: bootstrap.capabilityToken,
    [ENV.protocol]: String(bootstrap.protocolVersion),
    [ENV.appBuild]: bootstrap.appBuild,
    [ENV.brokerId]: bootstrap.codexSessionId,
    [ENV.generation]: String(bootstrap.backendGeneration),
    [ENV.clientPath]: clientPath,
  };
}

function assertAbsoluteFilePath(value: string, label: string): string {
  if (!path.isAbsolute(value)) {
    throw new Error(`${label} 必须是绝对路径`);
  }
  return value;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}
