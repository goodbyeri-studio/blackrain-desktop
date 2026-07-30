import { z } from "zod";

const generationSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const revisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const tabIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const routeIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/);

export const BrowserBoundsSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().nonnegative().max(16384),
  height: z.number().int().nonnegative().max(16384),
});

export const BrowserViewLayoutSchema = z.object({
  browserTabId: tabIdSchema,
  viewGeneration: generationSchema,
  bounds: BrowserBoundsSchema,
  visible: z.boolean(),
  occluded: z.boolean(),
});

export const BrowserLayoutUpdateSchema = z
  .object({
    windowGeneration: generationSchema,
    layoutRevision: revisionSchema,
    threadId: routeIdSchema,
    routeKey: routeIdSchema,
    activeTabId: tabIdSchema.nullable(),
    views: z.array(BrowserViewLayoutSchema).max(64),
  })
  .superRefine((value, context) => {
    const ids = new Set<string>();
    for (const view of value.views) {
      if (ids.has(view.browserTabId)) {
        context.addIssue({
          code: "custom",
          message: `重复的 Browser tab: ${view.browserTabId}`,
          path: ["views"],
        });
      }
      ids.add(view.browserTabId);
    }
    if (value.activeTabId !== null && !ids.has(value.activeTabId)) {
      context.addIssue({
        code: "custom",
        message: "activeTabId 必须引用当前布局中的 tab",
        path: ["activeTabId"],
      });
    }
  });

export const BrowserLayoutAckSchema = z.object({
  accepted: z.literal(true),
  layoutRevision: revisionSchema,
});

export type BrowserLayoutUpdate = z.infer<typeof BrowserLayoutUpdateSchema>;
export type BrowserLayoutAck = z.infer<typeof BrowserLayoutAckSchema>;
