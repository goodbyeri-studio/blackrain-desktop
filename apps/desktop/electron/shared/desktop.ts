import { z } from "zod";

const identifierSchema = z.string().trim().min(1).max(128);

export const HostJsonObjectSchema = z
  .record(z.string(), z.unknown())
  .refine(
    (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= 1024 * 1024,
    "宿主 JSON 数据超过 1 MiB",
  );

export const SettingsUpdateInputSchema = z.object({
  settings: HostJsonObjectSchema,
});

export const AgentWorkspaceInputSchema = z.object({
  workspaceId: identifierSchema,
});

export const AgentAppsListInputSchema = AgentWorkspaceInputSchema.extend({
  cursor: z.string().nullable().optional(),
  limit: z.number().int().positive().max(1000).nullable().optional(),
  threadId: identifierSchema.nullable().optional(),
});

export const AgentThreadReadInputSchema = AgentWorkspaceInputSchema.extend({
  threadId: identifierSchema,
  includeTurns: z.boolean().optional(),
});

export const AgentThreadMutationInputSchema = AgentWorkspaceInputSchema.extend({
  threadId: identifierSchema,
});

export const AgentThreadNameInputSchema = AgentThreadMutationInputSchema.extend({
  name: z.string().trim().min(1).max(256),
});

export const FilePickInputSchema = z.object({
  kind: z.enum(["image", "file", "directory"]),
  multiple: z.boolean(),
  defaultPath: z.string().trim().max(32_768).optional(),
  title: z.string().trim().min(1).max(512).optional(),
});

export const DialogKindSchema = z.enum(["info", "warning", "error"]);

export const DialogConfirmInputSchema = z.object({
  message: z.string().min(1).max(32_768),
  title: z.string().trim().min(1).max(512).optional(),
  kind: DialogKindSchema.optional(),
  okLabel: z.string().trim().min(1).max(128).optional(),
  cancelLabel: z.string().trim().min(1).max(128).optional(),
});

export const DialogMessageInputSchema = DialogConfirmInputSchema.omit({
  okLabel: true,
  cancelLabel: true,
});

export const FilePathInputSchema = z.object({
  path: z.string().trim().min(1).max(32_768),
});

export const ExternalUrlInputSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1)
    .max(8_192)
    .refine((value) => {
      try {
        return ["http:", "https:", "mailto:"].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    }, "只允许 http、https 或 mailto 外部链接"),
});

export const FileSaveTextInputSchema = z.object({
  defaultFileName: z.string().trim().min(1).max(255),
  content: z.string().max(8 * 1024 * 1024),
});

export const WorkspaceFileInputSchema = AgentWorkspaceInputSchema.extend({
  path: z.string().trim().min(1).max(32_768),
});

export const AccountSessionKeyInputSchema = z.object({
  key: z.string().trim().min(1).max(512),
});

export const AccountSessionSetInputSchema = AccountSessionKeyInputSchema.extend({
  value: z.string().max(2 * 1024 * 1024),
});

export const FilePathListSchema = z.array(z.string().max(32_768)).max(512);
export const WorkspaceFileListSchema = z.array(z.string().max(32_768)).max(20_000);
export const FileReadResponseSchema = z.object({
  content: z.string(),
  truncated: z.boolean(),
});
export const OptionalFilePathSchema = z.string().max(32_768).nullable();
export const OptionalStringSchema = z.string().nullable();

export type HostJsonObject = z.infer<typeof HostJsonObjectSchema>;
export type SettingsUpdateInput = z.infer<typeof SettingsUpdateInputSchema>;
export type AgentWorkspaceInput = z.infer<typeof AgentWorkspaceInputSchema>;
export type AgentAppsListInput = z.infer<typeof AgentAppsListInputSchema>;
export type AgentThreadReadInput = z.infer<typeof AgentThreadReadInputSchema>;
export type AgentThreadMutationInput = z.infer<typeof AgentThreadMutationInputSchema>;
export type AgentThreadNameInput = z.infer<typeof AgentThreadNameInputSchema>;
export type FilePickInput = z.infer<typeof FilePickInputSchema>;
export type DialogConfirmInput = z.infer<typeof DialogConfirmInputSchema>;
export type DialogMessageInput = z.infer<typeof DialogMessageInputSchema>;
export type FilePathInput = z.infer<typeof FilePathInputSchema>;
export type ExternalUrlInput = z.infer<typeof ExternalUrlInputSchema>;
export type FileSaveTextInput = z.infer<typeof FileSaveTextInputSchema>;
export type WorkspaceFileInput = z.infer<typeof WorkspaceFileInputSchema>;
export type FileReadResponse = z.infer<typeof FileReadResponseSchema>;
export type AccountSessionKeyInput = z.infer<typeof AccountSessionKeyInputSchema>;
export type AccountSessionSetInput = z.infer<typeof AccountSessionSetInputSchema>;
