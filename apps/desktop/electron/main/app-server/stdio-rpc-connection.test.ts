import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { AppServerClient } from "./app-server-client";
import { AppServerConnectionError } from "./errors";
import type { AppServerRpcConnectionOptions } from "./rpc-types";
import { AppServerStdioRpcConnection } from "./stdio-rpc-connection";

describe("AppServerStdioRpcConnection", () => {
  it("按 JSONL 分派 client request、response 和 notification", async () => {
    const harness = createHarness();
    harness.connection.start();

    const responsePromise = harness.connection.request("thread/list", {
      limit: 10,
    });
    const request = await harness.outbound.next();
    expect(request).toMatchObject({
      id: 1,
      method: "thread/list",
      params: { limit: 10 },
    });

    harness.stdout.write('{"id":1,"result":{"data":');
    harness.stdout.write("[]}}\r\n");
    await expect(responsePromise).resolves.toEqual({ data: [] });

    await harness.connection.sendNotification("initialized");
    await expect(harness.outbound.next()).resolves.toEqual({
      method: "initialized",
    });
    harness.connection.close();
  });

  it("处理 app-server 发起的 request 并返回 response", async () => {
    const handler = vi.fn(async ({ method, params }) => ({ method, params }));
    const harness = createHarness({ onServerRequest: handler });
    harness.connection.start();

    harness.stdout.write(
      `${JSON.stringify({
        id: "approval-1",
        method: "item/commandExecution/requestApproval",
        params: { command: "git status" },
      })}\n`,
    );

    await expect(harness.outbound.next()).resolves.toEqual({
      id: "approval-1",
      result: {
        method: "item/commandExecution/requestApproval",
        params: { command: "git status" },
      },
    });
    expect(handler).toHaveBeenCalledOnce();
    harness.connection.close();
  });

  it("取消超时的 server request 并只返回一次错误", async () => {
    const handler = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    );
    const harness = createHarness({
      onServerRequest: handler,
      serverRequestTimeoutMs: 20,
    });
    harness.connection.start();
    harness.stdout.write(
      `${JSON.stringify({ id: "tool-1", method: "item/tool/call", params: {} })}\n`,
    );

    await expect(harness.outbound.next()).resolves.toEqual({
      id: "tool-1",
      error: { code: -32603, message: "处理 App Server request 失败" },
    });
    expect(handler).toHaveBeenCalledOnce();
    harness.connection.close();
  });

  it("在 request 超时后拒绝 pending 并发送取消通知", async () => {
    const harness = createHarness({ requestTimeoutMs: 20 });
    harness.connection.start();

    const responsePromise = harness.connection.request("thread/read");
    await expect(harness.outbound.next()).resolves.toMatchObject({
      id: 1,
      method: "thread/read",
    });
    await expect(responsePromise).rejects.toMatchObject({ code: "TIMEOUT" });
    await expect(harness.outbound.next()).resolves.toEqual({
      method: "$/cancelRequest",
      params: { id: 1 },
    });
    harness.connection.close();
  });

  it("将 stderr 作为独立诊断流而不是协议消息", async () => {
    const onDiagnostic = vi.fn();
    const onNotification = vi.fn();
    const harness = createHarness({ onDiagnostic, onNotification });
    harness.connection.start();

    harness.stderr.write("first diagnostic\nsecond diagnostic");
    harness.stderr.end();
    await new Promise((resolve) => setImmediate(resolve));

    expect(onDiagnostic).toHaveBeenNthCalledWith(1, "first diagnostic");
    expect(onDiagnostic).toHaveBeenNthCalledWith(2, "second diagnostic");
    expect(onNotification).not.toHaveBeenCalled();
    harness.connection.close();
  });

  it("畸形 JSON 会 fail closed 并拒绝全部 pending request", async () => {
    const onProtocolError = vi.fn();
    const harness = createHarness({ onProtocolError });
    harness.connection.start();
    const responsePromise = harness.connection.request("thread/list");
    await harness.outbound.next();

    harness.stdout.write("{not-json}\n");

    await expect(responsePromise).rejects.toMatchObject({
      code: "PROTOCOL_ERROR",
    });
    expect(onProtocolError).toHaveBeenCalledOnce();
    expect(() => harness.connection.request("thread/read")).toThrow(
      AppServerConnectionError,
    );
  });

  it("stdout EOF 会确定性拒绝 pending request", async () => {
    const harness = createHarness();
    harness.connection.start();
    const responsePromise = harness.connection.request("thread/list");
    await harness.outbound.next();

    harness.stdout.end();

    await expect(responsePromise).rejects.toMatchObject({ code: "CLOSED" });
  });

  it("拒绝同时携带 result 和 error 的非法 response envelope", async () => {
    const harness = createHarness();
    harness.connection.start();
    const responsePromise = harness.connection.request("thread/list");
    await harness.outbound.next();

    harness.stdout.write(
      '{"id":1,"result":{},"error":{"code":-1,"message":"bad"}}\n',
    );

    await expect(responsePromise).rejects.toMatchObject({
      code: "PROTOCOL_ERROR",
    });
  });
});

describe("AppServerClient", () => {
  it("完成 initialize/initialized 后才进入 ready", async () => {
    const harness = createHarness();
    const client = new AppServerClient(harness.connection);

    const initializePromise = client.initialize("0.7.68");
    expect(client.state).toBe("initializing");
    await expect(harness.outbound.next()).resolves.toEqual({
      id: 1,
      method: "initialize",
      params: {
        clientInfo: {
          name: "blackrain",
          title: "BlackRain",
          version: "0.7.68",
        },
        capabilities: {
          experimentalApi: true,
          requestAttestation: false,
        },
      },
    });
    harness.stdout.write('{"id":1,"result":{"serverInfo":{"name":"codex"}}}\n');
    await expect(harness.outbound.next()).resolves.toEqual({
      method: "initialized",
    });

    await expect(initializePromise).resolves.toEqual({
      serverInfo: { name: "codex" },
    });
    expect(client.state).toBe("ready");
    client.close();
  });
});

function createHarness(options: AppServerRpcConnectionOptions = {}) {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  return {
    connection: new AppServerStdioRpcConnection(
      { stdin, stdout, stderr },
      options,
    ),
    stdin,
    stdout,
    stderr,
    outbound: new JsonlFrameReader(stdin),
  };
}

class JsonlFrameReader {
  readonly #frames: unknown[] = [];
  readonly #waiters: Array<(value: unknown) => void> = [];
  #buffer = "";

  constructor(stream: PassThrough) {
    stream.on("data", (chunk: Buffer | string) => {
      this.#buffer += chunk.toString();
      let newlineIndex = this.#buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = this.#buffer.slice(0, newlineIndex);
        this.#buffer = this.#buffer.slice(newlineIndex + 1);
        if (line.trim().length > 0) {
          this.#push(JSON.parse(line));
        }
        newlineIndex = this.#buffer.indexOf("\n");
      }
    });
  }

  next(): Promise<unknown> {
    const frame = this.#frames.shift();
    if (frame !== undefined) {
      return Promise.resolve(frame);
    }
    return new Promise((resolve) => this.#waiters.push(resolve));
  }

  #push(frame: unknown): void {
    const waiter = this.#waiters.shift();
    if (waiter) {
      waiter(frame);
    } else {
      this.#frames.push(frame);
    }
  }
}
