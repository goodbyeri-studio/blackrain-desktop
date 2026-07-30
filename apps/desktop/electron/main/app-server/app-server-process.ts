import {
  spawn,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
} from "node:child_process";
import { AppServerClient } from "./app-server-client";
import {
  applyCodexHomeSelection,
  type CodexHomeSelection,
} from "./codex-home";
import type { AppServerRpcConnectionOptions } from "./rpc-types";
import { AppServerStdioRpcConnection } from "./stdio-rpc-connection";

export type AppServerProcessState =
  | "idle"
  | "starting"
  | "ready"
  | "stopping"
  | "stopped"
  | "failed";

export type AppServerExit = {
  code: number | null;
  signal: NodeJS.Signals | null;
  expected: boolean;
};

export type AppServerProcessOptions = {
  executablePath: string;
  cwd: string;
  clientVersion: string;
  extraCodexArgs?: readonly string[];
  launchArguments?: readonly string[];
  environment?: NodeJS.ProcessEnv;
  codexHome?: CodexHomeSelection;
  stopGraceMs?: number;
  connection?: AppServerRpcConnectionOptions;
  onExit?: (exit: AppServerExit) => void;
};

export class AppServerProcess {
  readonly #options: AppServerProcessOptions;
  #state: AppServerProcessState = "idle";
  #child?: ChildProcessWithoutNullStreams;
  #connection?: AppServerStdioRpcConnection;
  #client?: AppServerClient;
  #exitPromise?: Promise<AppServerExit>;
  #lastExit?: AppServerExit;

  constructor(options: AppServerProcessOptions) {
    this.#options = options;
  }

  get state(): AppServerProcessState {
    return this.#state;
  }

  get client(): AppServerClient {
    if (this.#state !== "ready" || !this.#client) {
      throw new Error(`App Server process 当前不可用：${this.#state}`);
    }
    return this.#client;
  }

  async start(): Promise<AppServerClient> {
    if (this.#state !== "idle") {
      throw new Error(`App Server process 无法从 ${this.#state} 状态启动`);
    }
    this.#state = "starting";

    const spawnOptions: SpawnOptionsWithoutStdio = {
      cwd: this.#options.cwd,
      env: applyCodexHomeSelection(
        { ...process.env, ...this.#options.environment },
        this.#options.codexHome,
      ),
      shell: false,
      windowsHide: true,
    };
    const child = spawn(
      this.#options.executablePath,
      this.#options.launchArguments
        ? [...this.#options.launchArguments]
        : buildAppServerArguments(this.#options.extraCodexArgs),
      { ...spawnOptions, stdio: ["pipe", "pipe", "pipe"] },
    );
    this.#child = child;
    this.#exitPromise = new Promise((resolve) => {
      let settled = false;
      const settle = (
        code: number | null,
        signal: NodeJS.Signals | null,
        reason?: string,
      ) => {
        if (settled) {
          return;
        }
        settled = true;
        const expected = this.#state === "stopping";
        const exit = { code, signal, expected };
        this.#lastExit = exit;
        if (this.#state !== "stopped") {
          this.#state = expected ? "stopped" : "failed";
        }
        this.#connection?.close(
          reason ??
            `App Server process 已退出（code=${code ?? "null"}, signal=${signal ?? "null"}）`,
        );
        this.#options.onExit?.(exit);
        resolve(exit);
      };
      child.once("exit", (code, signal) => settle(code, signal));
      child.once("close", (code, signal) => settle(code, signal));
      child.once("error", (error) =>
        settle(null, null, `App Server process 错误：${error.message}`),
      );
    });

    try {
      await waitForSpawn(child);
      const connection = new AppServerStdioRpcConnection(
        {
          stdin: child.stdin,
          stdout: child.stdout,
          stderr: child.stderr,
        },
        this.#options.connection,
      );
      this.#connection = connection;
      const client = new AppServerClient(connection);
      this.#client = client;
      await client.initialize(this.#options.clientVersion);
      if (this.#state !== "starting") {
        throw new Error("App Server process 在 initialize 期间退出");
      }
      this.#state = "ready";
      return client;
    } catch (error) {
      this.#state = "failed";
      this.#connection?.close("App Server process 启动失败");
      child.kill();
      throw error;
    }
  }

  async stop(): Promise<AppServerExit | undefined> {
    if (this.#state === "idle" || this.#state === "stopped") {
      this.#state = "stopped";
      return this.#exitPromise ? await this.#exitPromise : undefined;
    }
    if (this.#state === "stopping") {
      return this.#exitPromise ? await this.#exitPromise : undefined;
    }
    if (this.#state === "failed" && this.#lastExit) {
      return this.#lastExit;
    }

    this.#state = "stopping";
    this.#client?.close();
    this.#child?.stdin.end();
    const exitPromise = this.#exitPromise;
    if (!exitPromise || !this.#child) {
      this.#state = "stopped";
      return undefined;
    }

    const graceMs = this.#options.stopGraceMs ?? 2_000;
    const gracefulExit = await Promise.race([
      exitPromise.then((exit) => ({ exit })),
      new Promise<{ exit?: undefined }>((resolve) => {
        const timeout = setTimeout(() => resolve({}), graceMs);
        timeout.unref?.();
      }),
    ]);
    if (gracefulExit.exit) {
      return gracefulExit.exit;
    }

    this.#child.kill();
    return await exitPromise;
  }
}

export function buildAppServerArguments(
  extraCodexArgs: readonly string[] = [],
): string[] {
  return [
    "-c",
    "features.code_mode_host=true",
    ...extraCodexArgs,
    "app-server",
    "--analytics-default-enabled",
  ];
}

function waitForSpawn(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleSpawn = () => {
      child.off("error", handleError);
      resolve();
    };
    const handleError = (error: Error) => {
      child.off("spawn", handleSpawn);
      reject(error);
    };
    child.once("spawn", handleSpawn);
    child.once("error", handleError);
  });
}
