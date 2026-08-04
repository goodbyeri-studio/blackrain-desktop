import { z } from "zod";

const identifierSchema = z.string().trim().min(1).max(128);
const absolutePathCandidateSchema = z.string().trim().min(1).max(32_768);

export const LaunchScriptIconSchema = z.enum([
  "play",
  "build",
  "debug",
  "wrench",
  "server",
  "terminal",
  "code",
  "database",
  "package",
  "test",
  "lint",
  "dev",
  "git",
  "config",
  "logs",
]);

export const LaunchScriptEntrySchema = z.object({
  id: identifierSchema,
  script: z.string().max(32_768),
  icon: LaunchScriptIconSchema,
  label: z.string().trim().max(512).nullable().optional(),
});

export const WorkspaceSettingsSchema = z.object({
  sidebarCollapsed: z.boolean(),
  sortOrder: z.number().int().nonnegative().nullable().optional(),
  groupId: identifierSchema.nullable().optional(),
  cloneSourceWorkspaceId: identifierSchema.nullable().optional(),
  gitRoot: absolutePathCandidateSchema.nullable().optional(),
  launchScript: z.string().max(32_768).nullable().optional(),
  launchScripts: z.array(LaunchScriptEntrySchema).max(64).nullable().optional(),
  worktreeSetupScript: z.string().max(32_768).nullable().optional(),
  worktreesFolder: absolutePathCandidateSchema.nullable().optional(),
});

export const WorkspaceInfoSchema = z.object({
  id: identifierSchema,
  codexHomeId: identifierSchema.optional(),
  profileId: identifierSchema.optional(),
  name: z.string().trim().min(1).max(512),
  path: absolutePathCandidateSchema,
  connected: z.boolean(),
  kind: z.enum(["main", "worktree"]).optional(),
  parentId: identifierSchema.nullable().optional(),
  worktree: z.object({ branch: z.string().max(1024) }).nullable().optional(),
  settings: WorkspaceSettingsSchema,
});

export const WorkspaceListSchema = z.array(WorkspaceInfoSchema).max(512);
export const WorkspacePathInputSchema = z.object({ path: absolutePathCandidateSchema });
export const WorkspaceIdInputSchema = z.object({ id: identifierSchema });
export const WorkspaceUpdateInputSchema = z.object({
  id: identifierSchema,
  settings: WorkspaceSettingsSchema,
});
export const WorkspacePickInputSchema = z.object({ multiple: z.boolean() });
export const WorkspacePathListSchema = z.array(absolutePathCandidateSchema).max(512);
export const WorkspaceAckSchema = z.object({ ok: z.literal(true) });

export type WorkspaceInfo = z.infer<typeof WorkspaceInfoSchema>;
export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>;
export type WorkspacePathInput = z.infer<typeof WorkspacePathInputSchema>;
export type WorkspaceIdInput = z.infer<typeof WorkspaceIdInputSchema>;
export type WorkspaceUpdateInput = z.infer<typeof WorkspaceUpdateInputSchema>;
export type WorkspacePickInput = z.infer<typeof WorkspacePickInputSchema>;
