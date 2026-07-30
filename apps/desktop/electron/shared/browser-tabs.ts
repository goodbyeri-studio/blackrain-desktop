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

export const BrowserTabStateSchema = BrowserTabRequestSchema.extend({
  url: z.string().max(4096),
  title: z.string().max(1024),
  loading: z.boolean(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  crashed: z.boolean(),
  error: BrowserNavigationErrorSchema.nullable(),
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

export type BrowserRouteScope = z.infer<typeof BrowserRouteScopeSchema>;
export type BrowserCreateTabInput = z.infer<typeof BrowserCreateTabInputSchema>;
export type BrowserTabRequest = z.infer<typeof BrowserTabRequestSchema>;
export type BrowserNavigateInput = z.infer<typeof BrowserNavigateInputSchema>;
export type BrowserControlInput = z.infer<typeof BrowserControlInputSchema>;
export type BrowserTabState = z.infer<typeof BrowserTabStateSchema>;
export type BrowserCloseTabAck = z.infer<typeof BrowserCloseTabAckSchema>;
export type BrowserTabsChangedEvent = z.infer<typeof BrowserTabsChangedEventSchema>;
