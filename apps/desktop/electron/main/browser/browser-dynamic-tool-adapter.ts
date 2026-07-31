import { z } from "zod";
import {
  BROWSER_SIDEBAR_ROUTE_KEY,
  type BrowserControlInput,
  type BrowserNavigateInput,
  type BrowserRouteScope,
  type BrowserTabRequest,
  type BrowserTabState,
} from "../../shared/browser-tabs";
import type { AppServerServerRequest } from "../app-server/rpc-types";
import type {
  BrowserActionResult,
  BrowserScreenshotResult,
  BrowserSnapshotResult,
} from "./browser-cdp-controller";
import { dispatchBrowserTool } from "./browser-tool-dispatcher";

export const BROWSER_DYNAMIC_TOOL_NAMESPACE = "blackrain_browser";

const identifierSchema = z.string().trim().min(1).max(128);
const DynamicToolCallParamsSchema = z.object({
  threadId: identifierSchema,
  turnId: identifierSchema,
  callId: identifierSchema,
  namespace: z.string().nullable(),
  tool: z.string().trim().min(1).max(128),
  arguments: z.unknown(),
});

export const BROWSER_DYNAMIC_TOOLS = [
  {
    type: "namespace",
    name: BROWSER_DYNAMIC_TOOL_NAMESPACE,
    description: "控制 BlackRain 中当前对话绑定的可见浏览器页面。",
    tools: [
      {
        type: "function",
        name: "list_tabs",
        description: "列出当前对话 Browser 侧栏中的标签页。",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
      {
        type: "function",
        name: "new_tab",
        description: "在当前对话 Browser 侧栏中新建可见标签页。",
        inputSchema: {
          type: "object",
          properties: { url: { type: "string" } },
          additionalProperties: false,
        },
      },
      {
        type: "function",
        name: "goto",
        description: "让现有标签页导航到 http 或 https 地址。",
        inputSchema: {
          type: "object",
          properties: {
            browserTabId: { type: "string" },
            viewGeneration: { type: "integer", minimum: 1 },
            url: { type: "string" },
          },
          required: ["browserTabId", "viewGeneration", "url"],
          additionalProperties: false,
        },
      },
      ...(["back", "forward", "reload", "stop"] as const).map((name) => ({
        type: "function",
        name,
        description: `控制当前标签页执行 ${name}。`,
        inputSchema: {
          type: "object",
          properties: {
            browserTabId: { type: "string" },
            viewGeneration: { type: "integer", minimum: 1 },
          },
          required: ["browserTabId", "viewGeneration"],
          additionalProperties: false,
        },
      })),
      {
        type: "function",
        name: "snapshot",
        description: "读取当前页面有界的 accessibility snapshot，并返回短期可操作 ref。",
        inputSchema: tabInputSchema(),
      },
      {
        type: "function",
        name: "click",
        description: "点击当前页面 snapshot 中的可操作 ref。",
        inputSchema: snapshotRefInputSchema(),
      },
      {
        type: "function",
        name: "type_text",
        description: "替换当前页面 snapshot 中可编辑 ref 的文本。",
        inputSchema: {
          ...snapshotRefInputSchema(),
          properties: {
            ...snapshotRefInputSchema().properties,
            text: { type: "string", maxLength: 16 * 1024 },
          },
          required: [
            "browserTabId",
            "viewGeneration",
            "snapshotId",
            "ref",
            "text",
          ],
        },
      },
      {
        type: "function",
        name: "screenshot",
        description: "截取当前页面 viewport 或完整页面，返回有界 PNG。",
        inputSchema: {
          ...tabInputSchema(),
          properties: {
            ...tabInputSchema().properties,
            fullPage: { type: "boolean" as const },
          },
        },
      },
    ],
  },
] as const;

function tabInputSchema() {
  return {
    type: "object" as const,
    properties: {
      browserTabId: { type: "string" as const },
      viewGeneration: { type: "integer" as const, minimum: 1 },
    },
    required: ["browserTabId", "viewGeneration"],
    additionalProperties: false,
  };
}

function snapshotRefInputSchema() {
  return {
    type: "object" as const,
    properties: {
      ...tabInputSchema().properties,
      snapshotId: { type: "string" as const },
      ref: { type: "string" as const, pattern: "^ref-[1-9][0-9]*$" },
    },
    required: ["browserTabId", "viewGeneration", "snapshotId", "ref"],
    additionalProperties: false,
  };
}

export type BrowserAgentTabInput = BrowserTabRequest & { turnId: string };

export type BrowserAgentCreateTabInput = BrowserRouteScope & {
  turnId: string;
  url?: string;
};

export type BrowserAgentNavigateInput = BrowserNavigateInput & {
  turnId: string;
};

export type BrowserAgentControlInput = BrowserControlInput & {
  turnId: string;
};

export type BrowserSnapshotRefInput = BrowserAgentTabInput & {
  snapshotId: string;
  ref: string;
};

export type BrowserTypeTextInput = BrowserSnapshotRefInput & { text: string };

export type BrowserAgentScreenshotInput = BrowserAgentTabInput & {
  fullPage?: boolean;
};

export interface BrowserAgentBackend {
  listTabsForAgent(scope: BrowserRouteScope): BrowserTabState[];
  createTabForAgent(
    input: BrowserAgentCreateTabInput,
    signal: AbortSignal,
  ): Promise<BrowserTabState>;
  navigateForAgent(
    input: BrowserAgentNavigateInput,
    signal: AbortSignal,
  ): Promise<BrowserTabState>;
  controlForAgent(input: BrowserAgentControlInput): BrowserTabState;
  completeAgentTurn?(scope: BrowserRouteScope, turnId: string): void;
  snapshotForAgent(
    input: BrowserAgentTabInput,
    signal: AbortSignal,
  ): Promise<BrowserSnapshotResult>;
  clickForAgent(
    input: BrowserSnapshotRefInput,
    signal: AbortSignal,
  ): Promise<BrowserActionResult>;
  typeTextForAgent(
    input: BrowserTypeTextInput,
    signal: AbortSignal,
  ): Promise<BrowserActionResult>;
  screenshotForAgent(
    input: BrowserAgentScreenshotInput,
    signal: AbortSignal,
  ): Promise<BrowserScreenshotResult>;
}

export class BrowserDynamicToolAdapter {
  readonly #backend: BrowserAgentBackend;
  readonly #threads = new Set<string>();
  readonly #activeTurns = new Map<string, string>();

  constructor(backend: BrowserAgentBackend) {
    this.#backend = backend;
  }

  registerThread(threadId: string): void {
    this.#threads.add(identifierSchema.parse(threadId));
  }

  reset(): void {
    for (const [threadId, turnId] of this.#activeTurns) {
      this.#backend.completeAgentTurn?.(
        { threadId, routeKey: BROWSER_SIDEBAR_ROUTE_KEY },
        turnId,
      );
    }
    this.#activeTurns.clear();
    this.#threads.clear();
  }

  handleNotification(method: string, params: unknown): void {
    if (method !== "turn/started" && method !== "turn/completed") {
      return;
    }
    const event = z
      .object({
        threadId: identifierSchema,
        turn: z.object({ id: identifierSchema }).passthrough(),
      })
      .parse(params);
    if (!this.#threads.has(event.threadId)) {
      return;
    }
    if (method === "turn/started") {
      this.#activeTurns.set(event.threadId, event.turn.id);
    } else if (this.#activeTurns.get(event.threadId) === event.turn.id) {
      this.#activeTurns.delete(event.threadId);
      this.#backend.completeAgentTurn?.(
        {
          threadId: event.threadId,
          routeKey: BROWSER_SIDEBAR_ROUTE_KEY,
        },
        event.turn.id,
      );
    }
  }

  async handleServerRequest(request: AppServerServerRequest): Promise<unknown> {
    if (request.method !== "item/tool/call") {
      throw new Error(`未支持的 App Server request: ${request.method}`);
    }
    const call = DynamicToolCallParamsSchema.parse(request.params);
    if (
      call.namespace !== BROWSER_DYNAMIC_TOOL_NAMESPACE ||
      !this.#threads.has(call.threadId) ||
      this.#activeTurns.get(call.threadId) !== call.turnId
    ) {
      throw new Error("Browser dynamic tool 的 thread/turn/namespace 已失效");
    }
    throwIfAborted(request.signal);

    const { result, screenshot } = await dispatchBrowserTool(
      this.#backend,
      {
        threadId: call.threadId,
        turnId: call.turnId,
        tool: call.tool,
        arguments: call.arguments,
      },
      request.signal,
    );

    if (screenshot) {
      return {
        contentItems: [{ type: "inputImage", imageUrl: screenshot.imageUrl }],
        success: true,
      };
    }
    return {
      contentItems: [{ type: "inputText", text: JSON.stringify(result) }],
      success: true,
    };
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("Browser dynamic tool 已取消");
  }
}
