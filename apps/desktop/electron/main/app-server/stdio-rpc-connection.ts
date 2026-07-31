import type { Readable, Writable } from "node:stream";
import {
  AppServerConnectionError,
  AppServerRpcError,
} from "./errors";
import type {
  AppServerRequestOptions,
  AppServerRpcConnectionOptions,
  AppServerRpcErrorPayload,
  AppServerRpcId,
} from "./rpc-types";

const defaultRequestTimeoutMs = 300_000;
const defaultServerRequestTimeoutMs = 60_000;
const defaultMaxLineBytes = 8 * 1024 * 1024;
const defaultMaxPendingRequests = 128;
const defaultMaxQueuedWrites = 256;
const defaultMaxConcurrentServerRequests = 64;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timeout: NodeJS.Timeout;
  abortCleanup?: () => void;
};

type RpcObject = Record<string, unknown>;

export class AppServerStdioRpcConnection {
  readonly #stdout: Readable;
  readonly #stdin: Writable;
  readonly #stderr?: Readable;
  readonly #options: Required<
    Pick<
      AppServerRpcConnectionOptions,
      | "maxConcurrentServerRequests"
      | "maxLineBytes"
      | "maxPendingRequests"
      | "maxQueuedWrites"
      | "requestTimeoutMs"
      | "serverRequestTimeoutMs"
    >
  > &
    Omit<
      AppServerRpcConnectionOptions,
      | "maxConcurrentServerRequests"
      | "maxLineBytes"
      | "maxPendingRequests"
      | "maxQueuedWrites"
      | "requestTimeoutMs"
      | "serverRequestTimeoutMs"
    >;
  readonly #pending = new Map<AppServerRpcId, PendingRequest>();
  readonly #activeServerRequests = new Map<string, AbortController>();
  #stdoutBuffer = Buffer.alloc(0);
  #stderrBuffer = Buffer.alloc(0);
  #nextId = 1;
  #queuedWrites = 0;
  #writeTail: Promise<void> = Promise.resolve();
  #started = false;
  #closedError?: AppServerConnectionError;

  constructor(
    streams: { stdin: Writable; stdout: Readable; stderr?: Readable },
    options: AppServerRpcConnectionOptions = {},
  ) {
    this.#stdin = streams.stdin;
    this.#stdout = streams.stdout;
    this.#stderr = streams.stderr;
    this.#options = {
      ...options,
      requestTimeoutMs: options.requestTimeoutMs ?? defaultRequestTimeoutMs,
      serverRequestTimeoutMs:
        options.serverRequestTimeoutMs ?? defaultServerRequestTimeoutMs,
      maxLineBytes: options.maxLineBytes ?? defaultMaxLineBytes,
      maxPendingRequests:
        options.maxPendingRequests ?? defaultMaxPendingRequests,
      maxQueuedWrites: options.maxQueuedWrites ?? defaultMaxQueuedWrites,
      maxConcurrentServerRequests:
        options.maxConcurrentServerRequests ??
        defaultMaxConcurrentServerRequests,
    };
  }

  start(): void {
    if (this.#started) {
      return;
    }
    if (this.#closedError) {
      throw this.#closedError;
    }
    this.#started = true;
    this.#stdout.on("data", this.#handleStdoutData);
    this.#stdout.once("end", this.#handleStdoutEnd);
    this.#stdout.once("error", this.#handleStdoutError);
    this.#stdin.once("error", this.#handleStdinError);
    this.#stderr?.on("data", this.#handleStderrData);
    this.#stderr?.once("end", this.#handleStderrEnd);
  }

  request(
    method: string,
    params?: unknown,
    options: AppServerRequestOptions = {},
  ): Promise<unknown> {
    this.#assertOpen();
    assertRpcMethod(method);
    if (this.#pending.size >= this.#options.maxPendingRequests) {
      return Promise.reject(
        new AppServerConnectionError(
          "LIMIT_EXCEEDED",
          "App Server pending request 数量已达到上限",
        ),
      );
    }
    if (options.signal?.aborted) {
      return Promise.reject(
        new AppServerConnectionError("ABORTED", "App Server request 已取消"),
      );
    }

    const id = this.#nextId++;
    const timeoutMs = options.timeoutMs ?? this.#options.requestTimeoutMs;
    let resolveRequest!: (value: unknown) => void;
    let rejectRequest!: (reason: unknown) => void;
    const result = new Promise<unknown>((resolve, reject) => {
      resolveRequest = resolve;
      rejectRequest = reject;
    });
    const timeout = setTimeout(() => {
      this.#cancelPending(
        id,
        new AppServerConnectionError(
          "TIMEOUT",
          `App Server request 超时（${timeoutMs}ms）`,
        ),
      );
    }, timeoutMs);
    timeout.unref?.();

    const pending: PendingRequest = {
      resolve: resolveRequest,
      reject: rejectRequest,
      timeout,
    };
    if (options.signal) {
      const handleAbort = () => {
        this.#cancelPending(
          id,
          new AppServerConnectionError("ABORTED", "App Server request 已取消"),
        );
      };
      options.signal.addEventListener("abort", handleAbort, { once: true });
      pending.abortCleanup = () =>
        options.signal?.removeEventListener("abort", handleAbort);
    }
    this.#pending.set(id, pending);

    void this.#enqueue({ id, method, ...(params === undefined ? {} : { params }) }).catch(
      (error: unknown) => this.#rejectPending(id, error),
    );
    return result;
  }

  sendNotification(method: string, params?: unknown): Promise<void> {
    this.#assertOpen();
    assertRpcMethod(method);
    return this.#enqueue({
      method,
      ...(params === undefined ? {} : { params }),
    });
  }

  close(reason = "App Server connection 已关闭"): void {
    this.#fail(new AppServerConnectionError("CLOSED", reason));
  }

  readonly #handleStdoutData = (chunk: Buffer | string): void => {
    if (this.#closedError) {
      return;
    }
    this.#stdoutBuffer = Buffer.concat([
      this.#stdoutBuffer,
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
    ]);
    let newlineIndex = this.#stdoutBuffer.indexOf(0x0a);
    while (newlineIndex >= 0) {
      const line = this.#stdoutBuffer.subarray(0, newlineIndex);
      this.#stdoutBuffer = this.#stdoutBuffer.subarray(newlineIndex + 1);
      if (line.length > this.#options.maxLineBytes) {
        this.#fail(
          new AppServerConnectionError(
            "PROTOCOL_ERROR",
            "App Server stdout JSONL frame 超过大小上限",
          ),
        );
        return;
      }
      this.#handleLine(line);
      if (this.#closedError) {
        return;
      }
      newlineIndex = this.#stdoutBuffer.indexOf(0x0a);
    }
    if (this.#stdoutBuffer.length > this.#options.maxLineBytes) {
      this.#fail(
        new AppServerConnectionError(
          "PROTOCOL_ERROR",
          "App Server stdout JSONL frame 超过大小上限",
        ),
      );
    }
  };

  readonly #handleStdoutEnd = (): void => {
    if (this.#closedError) {
      return;
    }
    if (this.#stdoutBuffer.toString("utf8").trim().length > 0) {
      this.#fail(
        new AppServerConnectionError(
          "PROTOCOL_ERROR",
          "App Server stdout 在不完整 JSONL frame 中结束",
        ),
      );
      return;
    }
    this.#fail(
      new AppServerConnectionError("CLOSED", "App Server stdout 已到达 EOF"),
    );
  };

  readonly #handleStdoutError = (error: Error): void => {
    this.#fail(
      new AppServerConnectionError("CLOSED", "读取 App Server stdout 失败", {
        cause: error,
      }),
    );
  };

  readonly #handleStdinError = (error: Error): void => {
    this.#fail(
      new AppServerConnectionError("CLOSED", "写入 App Server stdin 失败", {
        cause: error,
      }),
    );
  };

  readonly #handleStderrData = (chunk: Buffer | string): void => {
    this.#stderrBuffer = Buffer.concat([
      this.#stderrBuffer,
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
    ]);
    let newlineIndex = this.#stderrBuffer.indexOf(0x0a);
    while (newlineIndex >= 0) {
      const line = this.#stderrBuffer.subarray(0, newlineIndex);
      this.#stderrBuffer = this.#stderrBuffer.subarray(newlineIndex + 1);
      this.#emitDiagnostic(line);
      newlineIndex = this.#stderrBuffer.indexOf(0x0a);
    }
    if (this.#stderrBuffer.length > this.#options.maxLineBytes) {
      this.#emitDiagnostic(this.#stderrBuffer.subarray(0, this.#options.maxLineBytes));
      this.#stderrBuffer = Buffer.alloc(0);
    }
  };

  readonly #handleStderrEnd = (): void => {
    if (this.#stderrBuffer.length > 0) {
      this.#emitDiagnostic(this.#stderrBuffer);
      this.#stderrBuffer = Buffer.alloc(0);
    }
  };

  #handleLine(rawLine: Buffer): void {
    const line = rawLine.toString("utf8").replace(/\r$/, "");
    if (line.trim().length === 0) {
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      this.#fail(
        new AppServerConnectionError(
          "PROTOCOL_ERROR",
          "App Server stdout 包含畸形 JSON",
          { cause: error },
        ),
      );
      return;
    }
    if (!isRpcObject(value)) {
      this.#fail(
        new AppServerConnectionError(
          "PROTOCOL_ERROR",
          "App Server JSONL 消息必须是对象",
        ),
      );
      return;
    }
    this.#dispatch(value);
  }

  #dispatch(message: RpcObject): void {
    const hasId = isRpcId(message.id);
    const hasMethod = isRpcMethod(message.method);
    const hasResult = Object.hasOwn(message, "result");
    const hasError = Object.hasOwn(message, "error");

    if (hasId && !hasMethod && hasResult !== hasError) {
      this.#handleResponse(message.id as AppServerRpcId, message);
      return;
    }
    if (hasMethod && hasId && !hasResult && !hasError) {
      this.#handleServerRequest(
        message.id as AppServerRpcId,
        message.method as string,
        message.params,
      );
      return;
    }
    if (hasMethod && !hasId && !hasResult && !hasError) {
      this.#handleNotification(message.method as string, message.params);
      return;
    }
    this.#fail(
      new AppServerConnectionError(
        "PROTOCOL_ERROR",
        "App Server JSONL 消息不符合 request/response/notification 合同",
      ),
    );
  }

  #handleResponse(id: AppServerRpcId, message: RpcObject): void {
    const pending = this.#pending.get(id);
    if (!pending) {
      return;
    }
    this.#pending.delete(id);
    this.#cleanPending(pending);
    if (Object.hasOwn(message, "error")) {
      pending.reject(new AppServerRpcError(normalizeRpcError(message.error)));
      return;
    }
    pending.resolve(message.result);
  }

  #handleNotification(method: string, params: unknown): void {
    if (method === "$/cancelRequest" && isRpcObject(params) && isRpcId(params.id)) {
      this.#activeServerRequests.get(rpcIdKey(params.id))?.abort();
    }
    this.#options.onNotification?.(method, params);
  }

  #handleServerRequest(
    id: AppServerRpcId,
    method: string,
    params: unknown,
  ): void {
    if (
      this.#activeServerRequests.size >=
      this.#options.maxConcurrentServerRequests
    ) {
      void this.#sendError(id, {
        code: -32000,
        message: "并发 server request 已达到上限",
      });
      return;
    }
    const handler = this.#options.onServerRequest;
    if (!handler) {
      void this.#sendError(id, {
        code: -32601,
        message: `未注册 server request handler: ${method}`,
      });
      return;
    }

    const controller = new AbortController();
    const key = rpcIdKey(id);
    if (this.#activeServerRequests.has(key)) {
      this.#fail(
        new AppServerConnectionError(
          "PROTOCOL_ERROR",
          "App Server 使用了重复的 active request id",
        ),
      );
      return;
    }
    this.#activeServerRequests.set(key, controller);
    const timeout = setTimeout(
      () => controller.abort(),
      this.#options.serverRequestTimeoutMs,
    );
    timeout.unref?.();
    const aborted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener(
        "abort",
        () => reject(new Error("App Server request 已取消或超时")),
        { once: true },
      );
    });
    let handling: Promise<unknown>;
    try {
      handling = Promise.resolve(
        handler({ id, method, params, signal: controller.signal }),
      );
    } catch (error) {
      handling = Promise.reject(error);
    }
    void Promise.race([handling, aborted])
      .then((result) => this.#enqueue({ id, result: result ?? null }))
      .catch(() =>
        this.#sendError(id, {
          code: -32603,
          message: "处理 App Server request 失败",
        }),
      )
      .finally(() => {
        clearTimeout(timeout);
        this.#activeServerRequests.delete(key);
      })
      .catch(() => undefined);
  }

  #sendError(id: AppServerRpcId, error: AppServerRpcErrorPayload): Promise<void> {
    return this.#enqueue({ id, error });
  }

  #cancelPending(id: AppServerRpcId, error: AppServerConnectionError): void {
    if (!this.#rejectPending(id, error)) {
      return;
    }
    void this.#enqueue({ method: "$/cancelRequest", params: { id } }).catch(
      () => undefined,
    );
  }

  #rejectPending(id: AppServerRpcId, error: unknown): boolean {
    const pending = this.#pending.get(id);
    if (!pending) {
      return false;
    }
    this.#pending.delete(id);
    this.#cleanPending(pending);
    pending.reject(error);
    return true;
  }

  #cleanPending(pending: PendingRequest): void {
    clearTimeout(pending.timeout);
    pending.abortCleanup?.();
  }

  #enqueue(message: RpcObject): Promise<void> {
    this.#assertOpen();
    if (this.#queuedWrites >= this.#options.maxQueuedWrites) {
      return Promise.reject(
        new AppServerConnectionError(
          "LIMIT_EXCEEDED",
          "App Server outbound 队列已达到上限",
        ),
      );
    }
    let line: string;
    try {
      line = `${JSON.stringify(message)}\n`;
    } catch (error) {
      return Promise.reject(
        new AppServerConnectionError(
          "PROTOCOL_ERROR",
          "App Server outbound 消息无法序列化",
          { cause: error },
        ),
      );
    }
    if (Buffer.byteLength(line) > this.#options.maxLineBytes) {
      return Promise.reject(
        new AppServerConnectionError(
          "LIMIT_EXCEEDED",
          "App Server outbound JSONL frame 超过大小上限",
        ),
      );
    }

    this.#queuedWrites += 1;
    const write = this.#writeTail
      .catch(() => undefined)
      .then(() => this.#writeLine(line))
      .finally(() => {
        this.#queuedWrites -= 1;
      });
    this.#writeTail = write.catch(() => undefined);
    return write;
  }

  #writeLine(line: string): Promise<void> {
    if (this.#closedError) {
      return Promise.reject(this.#closedError);
    }
    return new Promise((resolve, reject) => {
      this.#stdin.write(line, "utf8", (error) => {
        if (error) {
          const connectionError = new AppServerConnectionError(
            "CLOSED",
            "写入 App Server stdin 失败",
            { cause: error },
          );
          this.#fail(connectionError);
          reject(connectionError);
          return;
        }
        resolve();
      });
    });
  }

  #emitDiagnostic(rawLine: Buffer): void {
    const line = rawLine.toString("utf8").replace(/\r$/, "");
    if (line.trim().length > 0) {
      this.#options.onDiagnostic?.(line);
    }
  }

  #assertOpen(): void {
    if (!this.#started) {
      throw new AppServerConnectionError(
        "CLOSED",
        "App Server connection 尚未启动",
      );
    }
    if (this.#closedError) {
      throw this.#closedError;
    }
  }

  #fail(error: AppServerConnectionError): void {
    if (this.#closedError) {
      return;
    }
    this.#closedError = error;
    this.#stdout.off("data", this.#handleStdoutData);
    this.#stdout.off("end", this.#handleStdoutEnd);
    this.#stderr?.off("data", this.#handleStderrData);
    this.#stderr?.off("end", this.#handleStderrEnd);
    for (const [id] of this.#pending) {
      this.#rejectPending(id, error);
    }
    for (const controller of this.#activeServerRequests.values()) {
      controller.abort();
    }
    this.#activeServerRequests.clear();
    this.#options.onProtocolError?.(error);
  }
}

function isRpcObject(value: unknown): value is RpcObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRpcId(value: unknown): value is AppServerRpcId {
  return (
    (typeof value === "number" && Number.isSafeInteger(value)) ||
    (typeof value === "string" && value.length > 0 && value.length <= 128)
  );
}

function isRpcMethod(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function assertRpcMethod(method: string): void {
  if (!isRpcMethod(method)) {
    throw new AppServerConnectionError(
      "PROTOCOL_ERROR",
      "App Server RPC method 必须是 1 到 256 字符的字符串",
    );
  }
}

function rpcIdKey(id: AppServerRpcId): string {
  return `${typeof id}:${id}`;
}

function normalizeRpcError(value: unknown): AppServerRpcErrorPayload {
  if (!isRpcObject(value)) {
    return { code: -32000, message: "App Server 返回未知错误" };
  }
  return {
    code:
      typeof value.code === "number" && Number.isSafeInteger(value.code)
        ? value.code
        : -32000,
    message:
      typeof value.message === "string" && value.message.length > 0
        ? value.message
        : "App Server 返回未知错误",
    ...(Object.hasOwn(value, "data") ? { data: value.data } : {}),
  };
}
