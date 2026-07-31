import { z } from "zod";

export const BROWSER_SIDEBAR_ROUTE_KEY = "browser-sidebar";

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
const generationSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const BrowserRouteScopeSchema = z.object({
  threadId: identifierSchema,
  routeKey: identifierSchema,
});

export const BrowserCreateTabInputSchema = BrowserRouteScopeSchema.extend({
  url: z.string().trim().min(1).max(4096).optional(),
});

export const BrowserTabRequestSchema = BrowserRouteScopeSchema.extend({
  browserTabId: identifierSchema,
  viewGeneration: generationSchema,
});

export const BrowserNavigateInputSchema = BrowserTabRequestSchema.extend({
  url: z.string().trim().min(1).max(4096),
});

export const BrowserControlActionSchema = z.enum([
  "back",
  "forward",
  "reload",
  "stop",
]);

export const BrowserControlInputSchema = BrowserTabRequestSchema.extend({
  action: BrowserControlActionSchema,
});

export const BrowserNavigationErrorSchema = z.object({
  code: z.number().int(),
  description: z.string().max(1024),
  url: z.string().max(4096),
});

export const BrowserControlOwnerSchema = z.enum(["user", "agent"]);
export const BrowserDebuggerStatusSchema = z.enum([
  "attached",
  "recovering",
  "unavailable",
]);

export const BrowserDialogStateSchema = z.object({
  requestId: identifierSchema,
  type: z.enum(["alert", "confirm", "prompt", "beforeunload"]),
  message: z.string().max(2048),
  defaultPrompt: z.string().max(1024),
  origin: z.string().max(4096),
});

export const BrowserConsoleMessageSchema = z.object({
  id: identifierSchema,
  level: z.enum(["info", "warning", "error", "debug"]),
  message: z.string().max(1024),
  source: z.string().max(4096),
  lineNumber: z.number().int().nonnegative(),
  timestamp: z.number().int().nonnegative(),
});

export const BrowserPermissionRequestSchema = z.object({
  requestId: identifierSchema,
  permission: z.string().trim().min(1).max(128),
  origin: z.string().trim().min(1).max(4096),
});

export const BrowserDownloadStateSchema = z.object({
  requestId: identifierSchema,
  status: z.enum(["pending", "in-progress", "completed", "failed"]),
  filename: z.string().trim().min(1).max(255),
  receivedBytes: z.number().int().nonnegative(),
  totalBytes: z.number().int().min(-1),
  error: z.string().max(1024).nullable(),
});

export const BrowserTabStateSchema = BrowserTabRequestSchema.extend({
  url: z.string().max(4096),
  title: z.string().max(1024),
  loading: z.boolean(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  crashed: z.boolean(),
  error: BrowserNavigationErrorSchema.nullable(),
  controlOwner: BrowserControlOwnerSchema,
  agentTurnId: identifierSchema.nullable(),
  permissionRequest: BrowserPermissionRequestSchema.nullable(),
  download: BrowserDownloadStateSchema.nullable(),
  dialog: BrowserDialogStateSchema.nullable(),
  consoleMessages: z.array(BrowserConsoleMessageSchema).max(20),
  debuggerStatus: BrowserDebuggerStatusSchema,
});

export const BrowserTabListSchema = z.array(BrowserTabStateSchema).max(64);

export const BrowserTabsChangedEventSchema = z.object({
  scope: BrowserRouteScopeSchema,
  tabs: BrowserTabListSchema,
});

export const BrowserCloseTabAckSchema = z.object({
  closed: z.literal(true),
  browserTabId: identifierSchema,
});

export const BrowserTakeControlInputSchema = BrowserTabRequestSchema;

export const BrowserPermissionDecisionInputSchema = BrowserTabRequestSchema.extend({
  requestId: identifierSchema,
  allow: z.boolean(),
});

export const BrowserDownloadDecisionInputSchema = BrowserTabRequestSchema.extend({
  requestId: identifierSchema,
  action: z.enum(["save", "cancel"]),
});

export const BrowserDialogDecisionInputSchema = BrowserTabRequestSchema.extend({
  requestId: identifierSchema,
  accept: z.boolean(),
  promptText: z.string().max(4096).optional(),
});

export type BrowserRouteScope = z.infer<typeof BrowserRouteScopeSchema>;
export type BrowserCreateTabInput = z.infer<typeof BrowserCreateTabInputSchema>;
export type BrowserTabRequest = z.infer<typeof BrowserTabRequestSchema>;
export type BrowserNavigateInput = z.infer<typeof BrowserNavigateInputSchema>;
export type BrowserControlInput = z.infer<typeof BrowserControlInputSchema>;
export type BrowserTabState = z.infer<typeof BrowserTabStateSchema>;
export type BrowserTakeControlInput = z.infer<typeof BrowserTakeControlInputSchema>;
export type BrowserPermissionDecisionInput = z.infer<typeof BrowserPermissionDecisionInputSchema>;
export type BrowserDownloadDecisionInput = z.infer<typeof BrowserDownloadDecisionInputSchema>;
export type BrowserDialogDecisionInput = z.infer<typeof BrowserDialogDecisionInputSchema>;
export type BrowserCloseTabAck = z.infer<typeof BrowserCloseTabAckSchema>;
export type BrowserTabsChangedEvent = z.infer<typeof BrowserTabsChangedEventSchema>;
