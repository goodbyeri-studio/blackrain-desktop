import { z } from "zod";

const menuIdentifierSchema = z.string().trim().min(1).max(128);

export const ContextMenuItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("item"),
    id: menuIdentifierSchema,
    label: z.string().trim().min(1).max(512),
    enabled: z.boolean().optional(),
  }),
  z.object({ kind: z.literal("separator") }),
]);

export const ContextMenuInputSchema = z.object({
  x: z.number().int().min(-32_768).max(32_768),
  y: z.number().int().min(-32_768).max(32_768),
  items: z.array(ContextMenuItemSchema).min(1).max(128),
});

export const ContextMenuResultSchema = menuIdentifierSchema.nullable();

export const NotificationInputSchema = z.object({
  title: z.string().trim().min(1).max(256),
  body: z.string().max(2_048),
  silent: z.boolean().optional(),
});

export const MenuAcceleratorInputSchema = z.array(z.object({
  id: menuIdentifierSchema,
  accelerator: z.string().trim().min(1).max(128).nullable(),
})).max(64);

export const TrayRecentThreadEntrySchema = z.object({
  workspaceId: menuIdentifierSchema,
  workspaceLabel: z.string().trim().min(1).max(256),
  threadId: menuIdentifierSchema,
  threadLabel: z.string().trim().min(1).max(512),
  updatedAt: z.number().finite(),
});
export const TrayRecentThreadsInputSchema = z.array(TrayRecentThreadEntrySchema).max(100);
export const TraySessionUsageSchema = z.object({
  sessionLabel: z.string().max(256),
  weeklyLabel: z.string().max(256).nullable(),
}).nullable();

export const SystemUiEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("menu-command"), id: menuIdentifierSchema }),
  z.object({
    kind: z.literal("tray-open-thread"),
    workspaceId: menuIdentifierSchema,
    threadId: menuIdentifierSchema,
  }),
]);

export type ContextMenuInput = z.infer<typeof ContextMenuInputSchema>;
export type ContextMenuResult = z.infer<typeof ContextMenuResultSchema>;
export type NotificationInput = z.infer<typeof NotificationInputSchema>;
export type MenuAcceleratorInput = z.infer<typeof MenuAcceleratorInputSchema>;
export type TrayRecentThreadEntry = z.infer<typeof TrayRecentThreadEntrySchema>;
export type TraySessionUsage = z.infer<typeof TraySessionUsageSchema>;
export type SystemUiEvent = z.infer<typeof SystemUiEventSchema>;
