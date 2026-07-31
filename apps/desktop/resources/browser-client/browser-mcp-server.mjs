import { createInterface } from "node:readline";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SERVER_NAME = "blackrain-browser";
const SERVER_VERSION = "1.0.0";
const SUPPORTED_PROTOCOLS = new Set([
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
  "2025-11-25",
]);

const clientConfig = readClientConfig(process.env);
delete process.env.BLACKRAIN_BROWSER_CAPABILITY_TOKEN;

let browserClient;
let browserClientPromise;
const pending = new Map();

const tools = [
  tool("browser_tabs_list", "列出当前 thread 的内嵌浏览器标签页。", emptySchema(), "list_tabs", {
    readOnlyHint: true,
  }),
  tool(
    "browser_tab_open",
    "在当前 thread 的内嵌浏览器中打开标签页。",
    objectSchema({ url: { type: "string", maxLength: 4096 } }),
    "new_tab",
    { openWorldHint: true },
  ),
  tool(
    "browser_navigate",
    "让现有内嵌浏览器标签页导航到 http 或 https 地址。",
    tabSchema({ url: { type: "string", maxLength: 4096 } }, ["url"]),
    "goto",
    { openWorldHint: true },
  ),
  ...["back", "forward", "reload", "stop"].map((name) =>
    tool(
      `browser_${name}`,
      `控制当前内嵌浏览器标签页执行 ${name}。`,
      tabSchema(),
      name,
      { idempotentHint: name === "reload" || name === "stop" },
    ),
  ),
  tool(
    "browser_snapshot",
    "读取当前页面的有界 accessibility snapshot，并返回短期可操作 ref。",
    tabSchema(),
    "snapshot",
    { readOnlyHint: true },
  ),
  tool(
    "browser_locate",
    "按可访问角色和名称严格定位当前页面中唯一的可操作元素。",
    tabSchema(
      {
        role: { type: "string", maxLength: 64 },
        name: { type: "string", maxLength: 1024 },
        exact: { type: "boolean" },
        state: {
          type: "string",
          enum: ["attached", "visible", "actionable"],
        },
        timeoutMs: { type: "integer", minimum: 0, maximum: 10000 },
      },
      ["name"],
    ),
    "locate",
    { readOnlyHint: true },
  ),
  tool(
    "browser_click",
    "点击当前页面 snapshot 中的可操作 ref。",
    refSchema(),
    "click",
    { openWorldHint: true },
  ),
  tool(
    "browser_hover",
    "移动指针到 snapshot 中可操作且可见的 ref。",
    refSchema(),
    "hover",
  ),
  tool(
    "browser_type",
    "替换当前页面 snapshot 中可编辑 ref 的文本。",
    refSchema({ text: { type: "string", maxLength: 16384 } }, ["text"]),
    "type_text",
    { openWorldHint: true },
  ),
  tool(
    "browser_press_key",
    "向当前页面发送一个有界键盘按键。",
    tabSchema({ key: { type: "string", maxLength: 64 } }, ["key"]),
    "press_key",
    { openWorldHint: true },
  ),
  tool(
    "browser_scroll",
    "在当前页面执行有界的水平或垂直滚动。",
    tabSchema(
      {
        deltaX: { type: "number", minimum: -10000, maximum: 10000 },
        deltaY: { type: "number", minimum: -10000, maximum: 10000 },
      },
      ["deltaY"],
    ),
    "scroll",
  ),
  tool(
    "browser_screenshot",
    "截取当前页面 viewport 或完整页面。",
    tabSchema({ fullPage: { type: "boolean" } }),
    "screenshot",
    { readOnlyHint: true },
  ),
  tool(
    "browser_finalize",
    "结束当前 Browser 工作并只保留明确交付给用户的标签页。",
    objectSchema({
      keep: { type: "array", items: { type: "string" }, maxItems: 64 },
    }),
    "finalize",
    { destructiveHint: true },
  ),
];

const toolByName = new Map(tools.map((entry) => [entry.name, entry]));
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  void handleLine(line);
});
input.on("close", shutdown);
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

async function handleLine(line) {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    writeError(null, -32700, "MCP JSON 解析失败");
    return;
  }
  if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    writeError(request?.id ?? null, -32600, "MCP 请求非法");
    return;
  }
  if (request.id === undefined) {
    handleNotification(request);
    return;
  }
  try {
    const result = await handleRequest(request);
    write({ jsonrpc: "2.0", id: request.id, result });
  } catch (error) {
    writeError(
      request.id,
      Number.isInteger(error?.code) ? error.code : -32603,
      errorMessage(error),
    );
  }
}

async function handleRequest(request) {
  if (request.method === "initialize") {
    const requested = String(request.params?.protocolVersion ?? "");
    if (!SUPPORTED_PROTOCOLS.has(requested)) {
      throw new Error(`不支持的 MCP protocolVersion: ${requested}`);
    }
    await ensureBrowserClient();
    return {
      protocolVersion: requested,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      instructions: "仅控制 BlackRain 当前 thread 的同一内嵌浏览器页面。",
    };
  }
  if (request.method === "ping") return {};
  if (request.method === "tools/list") return { tools: tools.map(publicTool) };
  if (request.method !== "tools/call") {
    const error = new Error(`未知 MCP 方法: ${request.method}`);
    error.code = -32601;
    throw error;
  }

  const name = String(request.params?.name ?? "");
  const definition = toolByName.get(name);
  if (!definition) {
    return toolError(`未知 Browser tool: ${name}`);
  }
  const route = parseTrustedRoute(request.params?._meta);
  const controller = new AbortController();
  pending.set(String(request.id), controller);
  try {
    const client = await ensureBrowserClient();
    const result = await callWithCancellation(
      client,
      {
        sessionId: route.threadId,
        turnId: route.turnId,
        tool: definition.backendName,
        arguments: request.params?.arguments ?? {},
      },
      controller.signal,
    );
    return toolResult(result, definition.backendName === "screenshot");
  } catch (error) {
    return toolError(errorMessage(error));
  } finally {
    pending.delete(String(request.id));
  }
}

function handleNotification(request) {
  if (
    request.method !== "notifications/cancelled" &&
    request.method !== "$/cancelRequest"
  ) {
    return;
  }
  const requestId = request.params?.requestId ?? request.params?.id;
  pending
    .get(String(requestId))
    ?.abort(new Error(String(request.params?.reason ?? "MCP request 已取消")));
}

async function ensureBrowserClient() {
  if (browserClient) return browserClient;
  if (!browserClientPromise) {
    browserClientPromise = import(pathToFileURL(clientConfig.clientPath).href)
      .then((module) => {
        if (typeof module.connectBrowserClient !== "function") {
          throw new Error("Browser client 制品缺少 connectBrowserClient 导出");
        }
        return module.connectBrowserClient(clientConfig);
      })
      .then((client) => {
        browserClient = client;
        return client;
      })
      .finally(() => {
        browserClientPromise = undefined;
      });
  }
  return browserClientPromise;
}

function callWithCancellation(client, call, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => {
      browserClient = undefined;
      client.close();
      reject(signal.reason ?? new Error("MCP request 已取消"));
    };
    signal.addEventListener("abort", abort, { once: true });
    client.call(call).then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}

function parseTrustedRoute(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    throw new Error("Browser MCP 缺少可信 request _meta");
  }
  const threadId = identifier(meta.threadId, "_meta.threadId");
  const turnMeta = parseTurnMetadata(meta["x-codex-turn-metadata"]);
  const sessionId = identifier(turnMeta.session_id, "session_id");
  const metadataThreadId = identifier(turnMeta.thread_id, "thread_id");
  const turnId = identifier(turnMeta.turn_id, "turn_id");
  if (threadId !== sessionId || threadId !== metadataThreadId) {
    throw new Error("Browser MCP 的 session/thread metadata 不一致");
  }
  return { threadId, turnId };
}

function parseTurnMetadata(value) {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error("x-codex-turn-metadata 不是有效 JSON");
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Browser MCP 缺少 x-codex-turn-metadata");
  }
  return value;
}

function readClientConfig(env) {
  const config = {
    endpoint: requiredEnv(env, "BLACKRAIN_BROWSER_ENDPOINT"),
    capabilityToken: requiredEnv(env, "BLACKRAIN_BROWSER_CAPABILITY_TOKEN"),
    protocolVersion: positiveInteger(env.BLACKRAIN_BROWSER_PROTOCOL_VERSION),
    appBuild: requiredEnv(env, "BLACKRAIN_BROWSER_APP_BUILD"),
    codexSessionId: requiredEnv(env, "BLACKRAIN_BROWSER_BROKER_ID"),
    backendGeneration: positiveInteger(env.BLACKRAIN_BROWSER_BACKEND_GENERATION),
    clientPath: requiredEnv(env, "BLACKRAIN_BROWSER_CLIENT_PATH"),
  };
  if (!path.isAbsolute(config.clientPath)) {
    throw new Error("BLACKRAIN_BROWSER_CLIENT_PATH 必须是绝对路径");
  }
  return Object.freeze(config);
}

function requiredEnv(env, name) {
  const value = String(env[name] ?? "").trim();
  if (!value) throw new Error(`${name} 缺失`);
  return value;
}

function positiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("Browser MCP 数字配置非法");
  }
  return parsed;
}

function identifier(value, label) {
  if (typeof value !== "string" || value.trim().length < 1 || value.length > 128) {
    throw new Error(`Browser MCP ${label} 非法`);
  }
  return value.trim();
}

function tool(name, description, inputSchema, backendName, annotations = {}) {
  return Object.freeze({
    name,
    description,
    inputSchema,
    backendName,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
      ...annotations,
    },
  });
}

function publicTool({ backendName: _backendName, ...definition }) {
  return definition;
}

function emptySchema() {
  return objectSchema({});
}

function objectSchema(properties, required = []) {
  return {
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  };
}

function tabSchema(extra = {}, required = []) {
  return objectSchema(
    {
      browserTabId: { type: "string", minLength: 1, maxLength: 128 },
      viewGeneration: { type: "integer", minimum: 1 },
      ...extra,
    },
    ["browserTabId", "viewGeneration", ...required],
  );
}

function refSchema(extra = {}, required = []) {
  return tabSchema(
    {
      snapshotId: { type: "string", minLength: 1, maxLength: 128 },
      ref: { type: "string", pattern: "^ref-[1-9][0-9]*$" },
      ...extra,
    },
    ["snapshotId", "ref", ...required],
  );
}

function toolResult(result, screenshot) {
  if (screenshot) {
    const match = /^data:(image\/png);base64,([A-Za-z0-9+/=]+)$/.exec(
      String(result?.imageUrl ?? ""),
    );
    if (!match) return toolError("Browser screenshot 返回非法 PNG");
    const { imageUrl: _imageUrl, ...metadata } = result;
    return {
      content: [
        { type: "image", mimeType: match[1], data: match[2] },
        { type: "text", text: JSON.stringify(metadata) },
      ],
      structuredContent: metadata,
    };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    structuredContent: result,
  };
}

function toolError(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

function writeError(id, code, message) {
  write({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
}

function write(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function shutdown() {
  for (const controller of pending.values()) {
    controller.abort(new Error("Browser MCP server 已停止"));
  }
  pending.clear();
  browserClient?.close();
  browserClient = undefined;
}
