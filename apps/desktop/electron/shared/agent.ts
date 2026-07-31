import { z } from "zod";

const identifierSchema = z.string().trim().min(1).max(128);
const absolutePathCandidateSchema = z.string().trim().min(1).max(32_768);
const optionalIdentifierSchema = z.string().trim().min(1).max(256).nullable().optional();
const agentImageSchema = z.string().trim().min(1).max(16 * 1024 * 1024);
const agentMentionSchema = z.object({
  name: z.string().trim().min(1).max(256),
  path: z.string().trim().min(1).max(4_096),
});

export const AgentThreadStartInputSchema = z.object({
  cwd: absolutePathCandidateSchema,
  workspaceId: identifierSchema.optional(),
});

export const AgentThreadResumeInputSchema = z.object({
  threadId: identifierSchema,
  cwd: absolutePathCandidateSchema.optional(),
  workspaceId: identifierSchema.optional(),
});

export const AgentThreadListInputSchema = z.object({
  workspaceId: identifierSchema,
  cursor: z.string().trim().min(1).max(4_096).nullable().optional(),
  limit: z.number().int().min(1).max(100).nullable().optional(),
  sortKey: z.enum(["created_at", "updated_at"]).nullable().optional(),
});

export const AgentThreadListResponseSchema = z
  .object({
    data: z.array(z.record(z.string(), z.unknown())).max(1_000),
    nextCursor: z.string().max(4_096).nullable().optional(),
  })
  .passthrough();

const AgentTurnInputSchema = z.object({
  threadId: identifierSchema,
  prompt: z.string().max(1_000_000),
  cwd: absolutePathCandidateSchema.optional(),
  model: optionalIdentifierSchema,
  effort: optionalIdentifierSchema,
  serviceTier: optionalIdentifierSchema,
  accessMode: z.enum(["read-only", "current", "full-access"]).optional(),
  images: z.array(agentImageSchema).max(32).optional(),
  appMentions: z.array(agentMentionSchema).max(64).optional(),
}).superRefine((input, context) => {
  if (!input.prompt.trim() && (input.images?.length ?? 0) === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["prompt"],
      message: "Agent turn 需要文本或图片输入",
    });
  }
});

export const AgentTurnStartInputSchema = AgentTurnInputSchema;

export const AgentTurnSteerInputSchema = AgentTurnInputSchema.and(z.object({
  turnId: identifierSchema,
}));

export const AgentTurnInterruptInputSchema = z.object({
  threadId: identifierSchema,
  turnId: identifierSchema,
});

export const AgentThreadAckSchema = z.object({
  threadId: identifierSchema,
  thread: z.record(z.string(), z.unknown()).optional(),
});
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

export const AgentEventCursorInputSchema = z.object({
  afterSequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

export const AgentEventSchema = z.object({
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  workspaceId: identifierSchema.nullable(),
  method: z.string().trim().min(1).max(256),
  params: z.unknown(),
});

export const AgentEventBatchSchema = z.object({
  events: z.array(AgentEventSchema).max(512),
  latestSequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  resetRequired: z.boolean(),
});

export type AgentThreadStartInput = z.infer<typeof AgentThreadStartInputSchema>;
export type AgentThreadResumeInput = z.infer<typeof AgentThreadResumeInputSchema>;
export type AgentThreadListInput = z.infer<typeof AgentThreadListInputSchema>;
export type AgentThreadListResponse = z.infer<typeof AgentThreadListResponseSchema>;
export type AgentTurnStartInput = z.infer<typeof AgentTurnStartInputSchema>;
export type AgentTurnSteerInput = z.infer<typeof AgentTurnSteerInputSchema>;
export type AgentTurnInterruptInput = z.infer<typeof AgentTurnInterruptInputSchema>;
export type AgentThreadAck = z.infer<typeof AgentThreadAckSchema>;
export type AgentTurnAck = z.infer<typeof AgentTurnAckSchema>;
export type AgentRuntimeStatus = z.infer<typeof AgentRuntimeStatusSchema>;
export type AgentEventCursorInput = z.infer<typeof AgentEventCursorInputSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type AgentEventBatch = z.infer<typeof AgentEventBatchSchema>;
