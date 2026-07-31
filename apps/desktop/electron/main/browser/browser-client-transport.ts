import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { unlinkSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import type { BrowserAgentBackend } from "./browser-dynamic-tool-adapter";
import { dispatchBrowserTool } from "./browser-tool-dispatcher";

export const BROWSER_CLIENT_PROTOCOL_VERSION = 1;
export const BROWSER_CLIENT_MAX_FRAME_BYTES = 8 * 1024 * 1024;
const BROWSER_CLIENT_MAX_CONNECTIONS = 4;
const BROWSER_CLIENT_REQUEST_TIMEOUT_MS = 30_000;

const identifierSchema = z.string().trim().min(1).max(128);
const rpcIdSchema = z.union([
  z.string().min(1).max(128),
  z.number().int().safe(),
]);
const RpcRequestSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: rpcIdSchema,
    method: z.string().trim().min(1).max(128),
    params: z.unknown().optional(),
  })
  .strict();
const HandshakeParamsSchema = z
  .object({
    protocolVersion: z.literal(BROWSER_CLIENT_PROTOCOL_VERSION),
    appBuild: z.string().trim().min(1).max(128),
    codexSessionId: identifierSchema,
    backendGeneration: z.number().int().positive().safe(),
    capabilityToken: z.string().min(32).max(128),
  })
  .strict();
const ToolCallParamsSchema = z
  .object({
    session_id: identifierSchema,
    turn_id: identifierSchema,
    tool: z.string().trim().min(1).max(128),
    arguments: z.unknown(),
  })
  .strict();

type RpcId = z.infer<typeof rpcIdSchema>;

type ConnectionState = {
  socket: Socket;
  clientId: string;
  buffer: Buffer;
  handshaken: boolean;
  requestIds: Set<string>;
  pending: Map<string, AbortController>;
};

export type BrowserClientBootstrap = Readonly<{
  endpoint: string;
  capabilityToken: string;
  protocolVersion: number;
  appBuild: string;
  codexSessionId: string;
  backendGeneration: number;
}>;

export type BrowserClientTransportOptions = {
  backend: BrowserAgentBackend;
  appBuild: string;
  codexSessionId: string;
  backendGeneration: number;
  endpoint?: string;
  capabilityToken?: string;
  requestTimeoutMs?: number;
};

export class BrowserClientTransportServer {
  readonly #backend: BrowserAgentBackend;
  readonly #appBuild: string;
  readonly #codexSessionId: string;
  readonly #backendGeneration: number;
  readonly #endpoint: string;
  readonly #capabilityToken: string;
  readonly #requestTimeoutMs: number;
  readonly #connections = new Set<ConnectionState>();
  #activeTurnId: string | null = null;
  #server?: Server;
  #startPromise?: Promise<BrowserClientBootstrap>;

  constructor(options: BrowserClientTransportOptions) {
    this.#backend = options.backend;
    this.#appBuild = identifierSchema.parse(options.appBuild);
    this.#codexSessionId = identifierSchema.parse(options.codexSessionId);
    this.#backendGeneration = z
      .number()
      .int()
      .positive()
      .safe()
      .parse(options.backendGeneration);
    this.#endpoint = options.endpoint ?? createRandomEndpoint();
    this.#capabilityToken =
      options.capabilityToken ?? randomBytes(32).toString("base64url");
    if (Buffer.byteLength(this.#capabilityToken, "utf8") < 32) {
      throw new Error("Browser client capability token 强度不足");
    }
    this.#requestTimeoutMs =
      options.requestTimeoutMs ?? BROWSER_CLIENT_REQUEST_TIMEOUT_MS;
  }

  start(): Promise<BrowserClientBootstrap> {
    if (this.#server?.listening) return Promise.resolve(this.#bootstrap());
    if (this.#startPromise) return this.#startPromise;
    const startPromise = new Promise<BrowserClientBootstrap>((resolve, reject) => {
      const server = createServer((socket) => this.#accept(socket));
      this.#server = server;
      const handleError = (error: Error) => {
        server.off("listening", handleListening);
        this.#server = undefined;
        reject(error);
      };
      const handleListening = () => {
        server.off("error", handleError);
        server.on("error", () => undefined);
        resolve(this.#bootstrap());
      };
      server.once("error", handleError);
      server.once("listening", handleListening);
      server.listen(this.#endpoint);
    }).finally(() => {
      this.#startPromise = undefined;
    });
    this.#startPromise = startPromise;
    return startPromise;
  }

  setActiveTurn(turnId: string): void {
    const nextTurnId = identifierSchema.parse(turnId);
    if (this.#activeTurnId && this.#activeTurnId !== nextTurnId) {
      const previousTurnId = this.#activeTurnId;
      for (const connection of this.#connections) {
        for (const controller of connection.pending.values()) {
          controller.abort(new Error("Browser client turn 已被新 turn 替代"));
        }
      }
      this.#backend.completeAgentTurn?.(
        { threadId: this.#codexSessionId, routeKey: "browser-sidebar" },
        previousTurnId,
      );
    }
    this.#activeTurnId = nextTurnId;
  }

  completeTurn(turnId: string): void {
    const parsedTurnId = identifierSchema.parse(turnId);
    if (this.#activeTurnId !== parsedTurnId) return;
    this.#activeTurnId = null;
    for (const connection of this.#connections) {
      for (const controller of connection.pending.values()) {
        controller.abort(new Error("Browser client turn 已完成"));
      }
    }
    this.#backend.completeAgentTurn?.(
      { threadId: this.#codexSessionId, routeKey: "browser-sidebar" },
      parsedTurnId,
    );
  }

  async stop(): Promise<void> {
    const server = this.#server;
    this.#server = undefined;
    const activeTurnId = this.#activeTurnId;
    if (activeTurnId) {
      this.#backend.completeAgentTurn?.(
        { threadId: this.#codexSessionId, routeKey: "browser-sidebar" },
        activeTurnId,
      );
    }
    this.#activeTurnId = null;
    for (const connection of this.#connections) {
      this.#closeConnection(connection, "Browser client backend 已停止");
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    cleanupEndpoint(this.#endpoint);
  }

  #bootstrap(): BrowserClientBootstrap {
    return Object.freeze({
      endpoint: this.#endpoint,
      capabilityToken: this.#capabilityToken,
      protocolVersion: BROWSER_CLIENT_PROTOCOL_VERSION,
      appBuild: this.#appBuild,
      codexSessionId: this.#codexSessionId,
      backendGeneration: this.#backendGeneration,
    });
  }

  #accept(socket: Socket): void {
    if (this.#connections.size >= BROWSER_CLIENT_MAX_CONNECTIONS) {
      socket.destroy();
      return;
    }
    socket.setNoDelay(true);
    const connection: ConnectionState = {
      socket,
      clientId: randomUUID(),
      buffer: Buffer.alloc(0),
      handshaken: false,
      requestIds: new Set(),
      pending: new Map(),
    };
    this.#connections.add(connection);
    socket.on("data", (chunk: Buffer) => this.#receive(connection, chunk));
    socket.on("error", () => undefined);
    socket.on("close", () =>
      this.#closeConnection(connection, "Browser client 已断开"),
    );
  }

  #receive(connection: ConnectionState, chunk: Buffer): void {
    if (connection.socket.destroyed) return;
    connection.buffer = Buffer.concat([connection.buffer, chunk]);
    while (connection.buffer.length >= 4) {
      const payloadLength = connection.buffer.readUInt32LE(0);
      if (
        payloadLength === 0 ||
        payloadLength > BROWSER_CLIENT_MAX_FRAME_BYTES
      ) {
        this.#fatal(connection, "Browser client frame 大小非法");
        return;
      }
      if (connection.buffer.length < payloadLength + 4) return;
      const payload = connection.buffer.subarray(4, payloadLength + 4);
      connection.buffer = connection.buffer.subarray(payloadLength + 4);
      void this.#handlePayload(connection, payload);
    }
    if (connection.buffer.length > BROWSER_CLIENT_MAX_FRAME_BYTES + 4) {
      this.#fatal(connection, "Browser client buffer 超出上限");
    }
  }

  async #handlePayload(
    connection: ConnectionState,
    payload: Buffer,
  ): Promise<void> {
    let request: z.infer<typeof RpcRequestSchema>;
    try {
      request = RpcRequestSchema.parse(JSON.parse(payload.toString("utf8")));
    } catch {
      this.#fatal(connection, "Browser client JSON-RPC 请求非法");
      return;
    }

    const requestKey = String(request.id);
    if (connection.requestIds.has(requestKey)) {
      this.#sendError(connection, request.id, -32600, "重复的 request id");
      return;
    }
    connection.requestIds.add(requestKey);
    try {
      if (!connection.handshaken) {
        await this.#handleHandshake(connection, request);
        return;
      }
      if (request.method !== "browser.call") {
        this.#sendError(connection, request.id, -32601, "未知 Browser RPC 方法");
        return;
      }
      const params = ToolCallParamsSchema.parse(request.params);
      if (
        params.session_id !== this.#codexSessionId ||
        params.turn_id !== this.#activeTurnId
      ) {
        this.#sendError(connection, request.id, -32003, "Browser session/turn 已失效");
        return;
      }
      const controller = new AbortController();
      connection.pending.set(requestKey, controller);
      const timeout = setTimeout(
        () => controller.abort(new Error("Browser client request 超时")),
        this.#requestTimeoutMs,
      );
      try {
        const { result } = await dispatchBrowserTool(
          this.#backend,
          {
            threadId: params.session_id,
            turnId: params.turn_id,
            tool: params.tool,
            arguments: params.arguments,
          },
          controller.signal,
        );
        if (!controller.signal.aborted && !connection.socket.destroyed) {
          this.#sendResult(connection, request.id, result);
        }
      } catch (error) {
        if (!connection.socket.destroyed) {
          this.#sendError(connection, request.id, -32000, errorMessage(error));
        }
      } finally {
        clearTimeout(timeout);
        connection.pending.delete(requestKey);
      }
    } catch (error) {
      this.#sendError(connection, request.id, -32602, errorMessage(error));
    } finally {
      connection.requestIds.delete(requestKey);
    }
  }

  async #handleHandshake(
    connection: ConnectionState,
    request: z.infer<typeof RpcRequestSchema>,
  ): Promise<void> {
    if (request.method !== "browser.handshake") {
      this.#fatal(connection, "Browser client 必须先握手", request.id);
      return;
    }
    const params = HandshakeParamsSchema.parse(request.params);
    if (
      !constantTimeEqual(params.capabilityToken, this.#capabilityToken) ||
      params.appBuild !== this.#appBuild ||
      params.codexSessionId !== this.#codexSessionId ||
      params.backendGeneration !== this.#backendGeneration
    ) {
      this.#fatal(connection, "Browser client 握手失败", request.id);
      return;
    }
    connection.handshaken = true;
    this.#sendResult(connection, request.id, {
      clientId: connection.clientId,
      protocolVersion: BROWSER_CLIENT_PROTOCOL_VERSION,
      codexSessionId: this.#codexSessionId,
      backendGeneration: this.#backendGeneration,
    });
  }

  #sendResult(connection: ConnectionState, id: RpcId, result: unknown): void {
    this.#send(connection, { jsonrpc: "2.0", id, result });
  }

  #sendError(
    connection: ConnectionState,
    id: RpcId,
    code: number,
    message: string,
  ): void {
    this.#send(connection, { jsonrpc: "2.0", id, error: { code, message } });
  }

  #send(connection: ConnectionState, response: unknown): void {
    if (connection.socket.destroyed) return;
    const payload = Buffer.from(JSON.stringify(response), "utf8");
    if (payload.length > BROWSER_CLIENT_MAX_FRAME_BYTES) {
      this.#fatal(connection, "Browser client response 超出 frame 上限");
      return;
    }
    const frame = Buffer.allocUnsafe(payload.length + 4);
    frame.writeUInt32LE(payload.length, 0);
    payload.copy(frame, 4);
    connection.socket.write(frame);
  }

  #fatal(connection: ConnectionState, message: string, id?: RpcId): void {
    if (id !== undefined && !connection.socket.destroyed) {
      const payload = Buffer.from(
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          error: { code: -32001, message },
        }),
        "utf8",
      );
      const frame = Buffer.allocUnsafe(payload.length + 4);
      frame.writeUInt32LE(payload.length, 0);
      payload.copy(frame, 4);
      connection.socket.end(frame);
    } else {
      connection.socket.destroy();
    }
    this.#closeConnection(connection, message);
  }

  #closeConnection(connection: ConnectionState, reason: string): void {
    if (!this.#connections.delete(connection)) return;
    for (const controller of connection.pending.values()) {
      controller.abort(new Error(reason));
    }
    connection.pending.clear();
    connection.requestIds.clear();
    if (!connection.socket.destroyed) connection.socket.destroy();
  }
}

function createRandomEndpoint(): string {
  const suffix = `${process.pid}-${randomUUID()}`;
  return process.platform === "win32"
    ? `\\\\.\\pipe\\blackrain-browser-${suffix}`
    : path.join(tmpdir(), `blackrain-browser-${suffix}.sock`);
}

function cleanupEndpoint(endpoint: string): void {
  if (process.platform === "win32") return;
  try {
    unlinkSync(endpoint);
  } catch {
    // net.Server 通常已删除 Unix socket；这里只处理异常退出后的残留。
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return (
    leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
