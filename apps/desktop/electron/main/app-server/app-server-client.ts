import type { AppServerRequestOptions } from "./rpc-types";
import { AppServerStdioRpcConnection } from "./stdio-rpc-connection";

export type AppServerClientState =
  | "created"
  | "initializing"
  | "ready"
  | "closed";

export class AppServerClient {
  #state: AppServerClientState = "created";

  constructor(readonly connection: AppServerStdioRpcConnection) {}

  get state(): AppServerClientState {
    return this.#state;
  }

  async initialize(clientVersion: string): Promise<unknown> {
    if (this.#state !== "created") {
      throw new Error(`App Server client 无法从 ${this.#state} 状态初始化`);
    }
    this.#state = "initializing";
    this.connection.start();
    try {
      const result = await this.connection.request(
        "initialize",
        {
          clientInfo: {
            name: "blackrain",
            title: "BlackRain",
            version: clientVersion,
          },
          capabilities: {
            experimentalApi: true,
            requestAttestation: false,
          },
        },
        { timeoutMs: 15_000 },
      );
      await this.connection.sendNotification("initialized");
      this.#state = "ready";
      return result;
    } catch (error) {
      this.#state = "closed";
      this.connection.close("App Server initialize 失败");
      throw error;
    }
  }

  request(
    method: string,
    params?: unknown,
    options?: AppServerRequestOptions,
  ): Promise<unknown> {
    this.#assertReady();
    return this.connection.request(method, params, options);
  }

  sendNotification(method: string, params?: unknown): Promise<void> {
    this.#assertReady();
    return this.connection.sendNotification(method, params);
  }

  close(): void {
    if (this.#state === "closed") {
      return;
    }
    this.#state = "closed";
    this.connection.close();
  }

  #assertReady(): void {
    if (this.#state !== "ready") {
      throw new Error(`App Server client 当前不可用：${this.#state}`);
    }
  }
}
