import { z } from "zod";

const identifierSchema = z.string().trim().min(1).max(128);
const absolutePathCandidateSchema = z.string().trim().min(1).max(32_768);

export const AgentThreadStartInputSchema = z.object({
  cwd: absolutePathCandidateSchema,
});

export const AgentThreadResumeInputSchema = z.object({
  threadId: identifierSchema,
  cwd: absolutePathCandidateSchema.optional(),
});

export const AgentTurnStartInputSchema = z.object({
  threadId: identifierSchema,
  prompt: z.string().min(1).max(1_000_000),
  cwd: absolutePathCandidateSchema.optional(),
});

export const AgentTurnInterruptInputSchema = z.object({
  threadId: identifierSchema,
  turnId: identifierSchema,
});

export const AgentThreadAckSchema = z.object({ threadId: identifierSchema });
export const AgentTurnAckSchema = z.object({
  threadId: identifierSchema,
  turnId: identifierSchema,
});

export const AgentRuntimeStatusSchema = z.object({
  state: z.enum([
    "idle",
    "starting",
    "ready",
    "stopping",
    "stopped",
    "failed",
  ]),
});

export type AgentThreadStartInput = z.infer<typeof AgentThreadStartInputSchema>;
export type AgentThreadResumeInput = z.infer<typeof AgentThreadResumeInputSchema>;
export type AgentTurnStartInput = z.infer<typeof AgentTurnStartInputSchema>;
export type AgentTurnInterruptInput = z.infer<typeof AgentTurnInterruptInputSchema>;
export type AgentThreadAck = z.infer<typeof AgentThreadAckSchema>;
export type AgentTurnAck = z.infer<typeof AgentTurnAckSchema>;
export type AgentRuntimeStatus = z.infer<typeof AgentRuntimeStatusSchema>;
