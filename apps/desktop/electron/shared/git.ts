import { z } from "zod";

const identifier = z.string().trim().min(1).max(128);
const workspaceInput = z.object({ workspaceId: identifier });
const relativePath = z.string().trim().min(1).max(32_768);

export const GitWorkspaceInputSchema = workspaceInput;
export const GitFileInputSchema = workspaceInput.extend({ path: relativePath });
export const GitLimitInputSchema = workspaceInput.extend({
  limit: z.number().int().min(1).max(500).optional(),
});
export const GitShaInputSchema = workspaceInput.extend({
  sha: z.string().trim().regex(/^[a-f0-9]{4,64}$/i),
});
export const GitCommitInputSchema = workspaceInput.extend({
  message: z.string().trim().min(1).max(32_768),
});
export const GitBranchInputSchema = workspaceInput.extend({
  name: z.string().trim().min(1).max(512),
});
export const GitRootsInputSchema = workspaceInput.extend({
  depth: z.number().int().min(0).max(12).optional(),
});
export const GitPullRequestInputSchema = workspaceInput.extend({
  prNumber: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
export const GitInitInputSchema = workspaceInput.extend({
  branch: z.string().trim().min(1).max(512),
  force: z.boolean().optional(),
});
export const GitCreateRepositoryInputSchema = workspaceInput.extend({
  repo: z.string().trim().min(1).max(512),
  visibility: z.enum(["private", "public"]),
  branch: z.string().trim().min(1).max(512).nullable().optional(),
});
export const GitJsonSchema = z.unknown();
export const GitAckSchema = z.object({ ok: z.literal(true) });

export type GitWorkspaceInput = z.infer<typeof GitWorkspaceInputSchema>;
export type GitFileInput = z.infer<typeof GitFileInputSchema>;
export type GitLimitInput = z.infer<typeof GitLimitInputSchema>;
export type GitShaInput = z.infer<typeof GitShaInputSchema>;
export type GitCommitInput = z.infer<typeof GitCommitInputSchema>;
export type GitBranchInput = z.infer<typeof GitBranchInputSchema>;
export type GitRootsInput = z.infer<typeof GitRootsInputSchema>;
export type GitPullRequestInput = z.infer<typeof GitPullRequestInputSchema>;
export type GitInitInput = z.infer<typeof GitInitInputSchema>;
export type GitCreateRepositoryInput = z.infer<typeof GitCreateRepositoryInputSchema>;
