import { z } from "zod";
import {
  BrowserControlActionSchema,
  BrowserTabStateSchema,
  type BrowserRouteScope,
} from "../../shared/browser-tabs";
import type {
  BrowserActionResult,
  BrowserScreenshotResult,
  BrowserSnapshotResult,
} from "./browser-cdp-controller";
import type { BrowserAgentBackend } from "./browser-dynamic-tool-adapter";

const identifierSchema = z.string().trim().min(1).max(128);
const generationSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const EmptyArgumentsSchema = z.object({}).strict();
const NewTabArgumentsSchema = z
  .object({ url: z.string().trim().min(1).max(4096).optional() })
  .strict();
const TabArgumentsSchema = z
  .object({
    browserTabId: identifierSchema,
    viewGeneration: generationSchema,
  })
  .strict();
const GotoArgumentsSchema = TabArgumentsSchema.extend({
  url: z.string().trim().min(1).max(4096),
}).strict();
const SnapshotRefArgumentsSchema = TabArgumentsSchema.extend({
  snapshotId: identifierSchema,
  ref: z.string().trim().regex(/^ref-[1-9][0-9]*$/),
}).strict();
const TypeTextArgumentsSchema = SnapshotRefArgumentsSchema.extend({
  text: z.string().max(16 * 1024),
}).strict();
const ScreenshotArgumentsSchema = TabArgumentsSchema.extend({
  fullPage: z.boolean().optional(),
}).strict();
const SnapshotResultSchema = z.object({
  snapshotId: identifierSchema,
  url: z.string().max(4096),
  text: z.string().max(64 * 1024),
});
const ActionResultSchema = z.object({
  browserTabId: identifierSchema,
  viewGeneration: generationSchema,
  url: z.string().max(4096),
});
const ScreenshotResultSchema = ActionResultSchema.extend({
  mimeType: z.literal("image/png"),
  imageUrl: z
    .string()
    .max(7 * 1024 * 1024)
    .refine((value) => value.startsWith("data:image/png;base64,")),
});

export const BrowserToolCallSchema = z.object({
  threadId: identifierSchema,
  turnId: identifierSchema,
  tool: z.string().trim().min(1).max(128),
  arguments: z.unknown(),
});

export type BrowserToolCall = z.infer<typeof BrowserToolCallSchema>;

export type BrowserToolResult = {
  result: unknown;
  screenshot?: BrowserScreenshotResult;
};

export async function dispatchBrowserTool(
  backend: BrowserAgentBackend,
  input: BrowserToolCall,
  signal: AbortSignal,
): Promise<BrowserToolResult> {
  const call = BrowserToolCallSchema.parse(input);
  throwIfAborted(signal);
  const scope: BrowserRouteScope = {
    threadId: call.threadId,
    routeKey: "browser-sidebar",
  };

  let result: unknown;
  let screenshot: BrowserScreenshotResult | undefined;
  if (call.tool === "list_tabs") {
    EmptyArgumentsSchema.parse(call.arguments);
    result = z
      .array(BrowserTabStateSchema)
      .max(64)
      .parse(backend.listTabsForAgent(scope));
  } else if (call.tool === "new_tab") {
    const args = NewTabArgumentsSchema.parse(call.arguments);
    result = BrowserTabStateSchema.parse(
      await backend.createTabForAgent(
        { ...scope, ...args, turnId: call.turnId },
        signal,
      ),
    );
  } else if (call.tool === "goto") {
    const args = GotoArgumentsSchema.parse(call.arguments);
    result = BrowserTabStateSchema.parse(
      await backend.navigateForAgent(
        { ...scope, ...args, turnId: call.turnId },
        signal,
      ),
    );
  } else if (["back", "forward", "reload", "stop"].includes(call.tool)) {
    const action = BrowserControlActionSchema.parse(call.tool);
    const args = TabArgumentsSchema.parse(call.arguments);
    result = BrowserTabStateSchema.parse(
      backend.controlForAgent({
        ...scope,
        ...args,
        action,
        turnId: call.turnId,
      }),
    );
  } else if (call.tool === "snapshot") {
    const args = TabArgumentsSchema.parse(call.arguments);
    result = SnapshotResultSchema.parse(
      await backend.snapshotForAgent(
        { ...scope, ...args, turnId: call.turnId },
        signal,
      ),
    ) satisfies BrowserSnapshotResult;
  } else if (call.tool === "click") {
    const args = SnapshotRefArgumentsSchema.parse(call.arguments);
    result = ActionResultSchema.parse(
      await backend.clickForAgent(
        { ...scope, ...args, turnId: call.turnId },
        signal,
      ),
    ) satisfies BrowserActionResult;
  } else if (call.tool === "type_text") {
    const args = TypeTextArgumentsSchema.parse(call.arguments);
    result = ActionResultSchema.parse(
      await backend.typeTextForAgent(
        { ...scope, ...args, turnId: call.turnId },
        signal,
      ),
    ) satisfies BrowserActionResult;
  } else if (call.tool === "screenshot") {
    const args = ScreenshotArgumentsSchema.parse(call.arguments);
    screenshot = ScreenshotResultSchema.parse(
      await backend.screenshotForAgent(
        { ...scope, ...args, turnId: call.turnId },
        signal,
      ),
    );
    result = screenshot;
  } else {
    throw new Error(`未知 Browser tool: ${call.tool}`);
  }

  throwIfAborted(signal);
  return { result, screenshot };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("Browser tool 已取消");
  }
}
