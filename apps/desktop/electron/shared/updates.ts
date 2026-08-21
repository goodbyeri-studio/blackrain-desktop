import { z } from "zod";

const versionSchema = z.string().trim().min(1).max(128);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/iu);

export const UpdateCheckSchema = z.object({
  available: z.boolean(),
  version: versionSchema.optional(),
  downloadUrl: z.string().url().optional(),
  sha256: sha256Schema.optional(),
});
export const UpdateDownloadInputSchema = z.object({
  version: versionSchema,
  downloadUrl: z.string().url(),
  sha256: sha256Schema,
});
export const UpdateDownloadSchema = z.object({
  version: versionSchema,
  stagedPath: z.string().min(1),
});
export const UpdateInstallInputSchema = z.object({ stagedPath: z.string().min(1) });

export type UpdateCheck = z.infer<typeof UpdateCheckSchema>;
export type UpdateDownloadInput = z.infer<typeof UpdateDownloadInputSchema>;
export type UpdateDownload = z.infer<typeof UpdateDownloadSchema>;
export type UpdateInstallInput = z.infer<typeof UpdateInstallInputSchema>;
