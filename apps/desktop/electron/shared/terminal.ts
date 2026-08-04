import { z } from "zod";

const identifier = z.string().trim().min(1).max(128);
const dimension = z.number().int().min(2).max(1_000);

export const TerminalOpenInputSchema = z.object({
  workspaceId: identifier,
  terminalId: identifier,
  cols: dimension,
  rows: dimension,
});
export const TerminalWriteInputSchema = z.object({
  workspaceId: identifier,
  terminalId: identifier,
  data: z.string().max(1024 * 1024),
});
export const TerminalResizeInputSchema = TerminalOpenInputSchema;
export const TerminalCloseInputSchema = z.object({
  workspaceId: identifier,
  terminalId: identifier,
});
export const TerminalAckSchema = z.object({ ok: z.literal(true) });
export const TerminalEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("data"),
    workspaceId: identifier,
    terminalId: identifier,
    data: z.string().max(1024 * 1024),
  }),
  z.object({
    kind: z.literal("exit"),
    workspaceId: identifier,
    terminalId: identifier,
    exitCode: z.number().int().nullable(),
    signal: z.number().int().nullable(),
  }),
]);

export type TerminalOpenInput = z.infer<typeof TerminalOpenInputSchema>;
export type TerminalWriteInput = z.infer<typeof TerminalWriteInputSchema>;
export type TerminalResizeInput = z.infer<typeof TerminalResizeInputSchema>;
export type TerminalCloseInput = z.infer<typeof TerminalCloseInputSchema>;
export type TerminalEvent = z.infer<typeof TerminalEventSchema>;
