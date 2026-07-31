import { createConnection } from "node:net";

// 此 client 需要受信任 Node runtime；Codex code-mode V8 isolate 不能直接加载它。

const PROTOCOL_VERSION = 1;
const MAX_FRAME_BYTES = 8 * 1024 * 1024;

export async function connectBrowserClient(config) {
  validateConfig(config);
  const socket = createConnection(config.endpoint);
  socket.setNoDelay(true);
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });

  let nextId = 1;
  let buffer = Buffer.alloc(0);
  let closed = false;
  const pending = new Map();

  const rejectPending = (error) => {
    if (closed) return;
    closed = true;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const length = buffer.readUInt32LE(0);
      if (length === 0 || length > MAX_FRAME_BYTES) {
        socket.destroy(new Error("Browser client response frame 大小非法"));
        return;
      }
      if (buffer.length < length + 4) return;
      const payload = buffer.subarray(4, length + 4);
      buffer = buffer.subarray(length + 4);
      let response;
      try {
        response = JSON.parse(payload.toString("utf8"));
      } catch {
        socket.destroy(new Error("Browser client response 不是有效 JSON"));
        return;
      }
      const request = pending.get(String(response?.id));
      if (!request) continue;
      pending.delete(String(response.id));
      clearTimeout(request.timeout);
      if (response.error) {
        request.reject(new Error(String(response.error.message ?? "Browser RPC 失败")));
      } else {
        request.resolve(response.result);
      }
    }
  });
  socket.on("error", rejectPending);
  socket.on("close", () => rejectPending(new Error("Browser client transport 已断开")));

  const request = (method, params) => {
    if (closed || socket.destroyed) {
      return Promise.reject(new Error("Browser client transport 已关闭"));
    }
    const id = nextId++;
    const payload = Buffer.from(
      JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      "utf8",
    );
    if (payload.length > MAX_FRAME_BYTES) {
      return Promise.reject(new Error("Browser client request 超过 8 MiB 上限"));
    }
    const frame = Buffer.allocUnsafe(payload.length + 4);
    frame.writeUInt32LE(payload.length, 0);
    payload.copy(frame, 4);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(String(id));
        reject(new Error("Browser client request 超时"));
      }, config.requestTimeoutMs ?? 30_000);
      pending.set(String(id), { resolve, reject, timeout });
      socket.write(frame, (error) => {
        if (!error) return;
        clearTimeout(timeout);
        pending.delete(String(id));
        reject(error);
      });
    });
  };

  const handshake = await request("browser.handshake", {
    protocolVersion: PROTOCOL_VERSION,
    appBuild: config.appBuild,
    codexSessionId: config.codexSessionId,
    backendGeneration: config.backendGeneration,
    capabilityToken: config.capabilityToken,
  });
  if (
    handshake?.protocolVersion !== PROTOCOL_VERSION ||
    handshake?.codexSessionId !== config.codexSessionId ||
    handshake?.backendGeneration !== config.backendGeneration ||
    typeof handshake?.clientId !== "string"
  ) {
    socket.destroy();
    throw new Error("Browser client 握手响应非法");
  }

  return Object.freeze({
    clientId: handshake.clientId,
    call({ sessionId, turnId, tool, arguments: args }) {
      return request("browser.call", {
        session_id: sessionId,
        turn_id: turnId,
        tool,
        arguments: args,
      });
    },
    close() {
      if (closed) return;
      closed = true;
      for (const request of pending.values()) {
        clearTimeout(request.timeout);
        request.reject(new Error("Browser client 已关闭"));
      }
      pending.clear();
      socket.destroy();
    },
  });
}

function validateConfig(config) {
  if (!config || typeof config !== "object") throw new Error("Browser client config 缺失");
  for (const field of ["endpoint", "capabilityToken", "appBuild", "codexSessionId"]) {
    if (typeof config[field] !== "string" || config[field].length === 0) {
      throw new Error(`Browser client ${field} 非法`);
    }
  }
  if (!Number.isSafeInteger(config.backendGeneration) || config.backendGeneration < 1) {
    throw new Error("Browser client backendGeneration 非法");
  }
}
