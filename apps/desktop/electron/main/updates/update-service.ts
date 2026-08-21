import { createHash, verify } from "node:crypto";
import { createWriteStream, mkdirSync } from "node:fs";
import { readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { app, shell } from "electron";
import { z } from "zod";
import {
  UpdateCheckSchema,
  UpdateDownloadInputSchema,
  UpdateDownloadSchema,
  UpdateInstallInputSchema,
} from "../../shared/updates";

const ManifestSchema = z.object({
  version: z.string().trim().min(1).max(128),
  downloadUrl: z.string().url(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/iu),
  publisher: z.string().trim().min(1).max(512),
  signature: z.string().base64(),
});

const MAX_UPDATE_BYTES = 2 * 1024 * 1024 * 1024;

type UpdateServiceDependencies = {
  fetch: typeof fetch;
  currentVersion: () => string;
  openPath: (filePath: string) => Promise<string>;
};

export class UpdateService {
  readonly #stagingDirectory: string;
  readonly #manifestUrl: string | undefined;
  readonly #publisher: string | undefined;
  readonly #publicKey: string | undefined;
  readonly #dependencies: UpdateServiceDependencies;
  readonly #approved = new Map<string, { downloadUrl: string; sha256: string }>();

  constructor(
    appStatePath: string,
    environment: NodeJS.ProcessEnv = process.env,
    dependencies: Partial<UpdateServiceDependencies> = {},
  ) {
    this.#stagingDirectory = path.join(appStatePath, "updates", "staging");
    this.#manifestUrl = environment.BLACKRAIN_UPDATE_MANIFEST_URL?.trim()
      || __BLACKRAIN_UPDATE_MANIFEST_URL__.trim()
      || undefined;
    this.#publisher = environment.BLACKRAIN_UPDATE_PUBLISHER?.trim()
      || __BLACKRAIN_UPDATE_PUBLISHER__.trim()
      || undefined;
    this.#publicKey = environment.BLACKRAIN_UPDATE_PUBLIC_KEY?.trim()
      || __BLACKRAIN_UPDATE_PUBLIC_KEY__.trim()
      || undefined;
    this.#dependencies = {
      fetch: dependencies.fetch ?? fetch,
      currentVersion: dependencies.currentVersion ?? (() => app.getVersion()),
      openPath: dependencies.openPath ?? ((filePath) => shell.openPath(filePath)),
    };
  }

  async check(): Promise<unknown> {
    if (!this.#manifestUrl || !this.#publisher || !this.#publicKey) {
      return { available: false };
    }
    const url = new URL(this.#manifestUrl);
    if (url.protocol !== "https:") throw new Error("更新 manifest 必须使用 HTTPS");
    const response = await this.#dependencies.fetch(url);
    if (!response.ok) throw new Error("更新 manifest 请求失败: " + response.status);
    const manifest = ManifestSchema.parse(await response.json());
    if (manifest.publisher !== this.#publisher) throw new Error("更新 publisher 校验失败");
    const signedPayload = Buffer.from(JSON.stringify({
      version: manifest.version,
      downloadUrl: manifest.downloadUrl,
      sha256: manifest.sha256.toLowerCase(),
      publisher: manifest.publisher,
    }), "utf8");
    if (!verify("sha256", signedPayload, this.#publicKey, Buffer.from(manifest.signature, "base64"))) {
      throw new Error("更新 manifest 签名校验失败");
    }
    const downloadUrl = new URL(manifest.downloadUrl);
    if (downloadUrl.protocol !== "https:") throw new Error("更新包必须使用 HTTPS");
    if (manifest.version === this.#dependencies.currentVersion()) return { available: false };
    this.#approved.clear();
    this.#approved.set(manifest.version, {
      downloadUrl: downloadUrl.toString(),
      sha256: manifest.sha256.toLowerCase(),
    });
    return UpdateCheckSchema.parse({
      available: true,
      version: manifest.version,
      downloadUrl: downloadUrl.toString(),
      sha256: manifest.sha256,
    });
  }

  async download(input: unknown): Promise<unknown> {
    const request = UpdateDownloadInputSchema.parse(input);
    const url = new URL(request.downloadUrl);
    if (url.protocol !== "https:") throw new Error("更新包必须使用 HTTPS");
    const approved = this.#approved.get(request.version);
    if (
      !approved ||
      approved.downloadUrl !== url.toString() ||
      approved.sha256 !== request.sha256.toLowerCase()
    ) {
      throw new Error("更新请求不匹配已验证 manifest");
    }
    mkdirSync(this.#stagingDirectory, { recursive: true });
    const tempPath = path.join(this.#stagingDirectory, request.version + ".download");
    const finalPath = path.join(this.#stagingDirectory, request.version + ".msix");
    await rm(tempPath, { force: true });
    const response = await this.#dependencies.fetch(url);
    if (!response.ok || !response.body) throw new Error("更新包下载失败: " + response.status);
    const file = createWriteStream(tempPath, { flags: "wx" });
    const hash = createHash("sha256");
    const reader = response.body.getReader();
    let downloadedBytes = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        downloadedBytes += next.value.byteLength;
        if (downloadedBytes > MAX_UPDATE_BYTES) throw new Error("更新包超过 2 GiB 上限");
        hash.update(next.value);
        if (!file.write(next.value)) await new Promise<void>((resolve) => file.once("drain", resolve));
      }
      await new Promise<void>((resolve, reject) => {
        file.end(() => resolve());
        file.once("error", reject);
      });
    } catch (error) {
      file.destroy();
      await rm(tempPath, { force: true });
      throw error;
    }
    if (hash.digest("hex").toLowerCase() !== request.sha256.toLowerCase()) {
      await rm(tempPath, { force: true });
      throw new Error("更新包 SHA-256 校验失败");
    }
    await rename(tempPath, finalPath);
    return UpdateDownloadSchema.parse({ version: request.version, stagedPath: finalPath });
  }

  async install(input: unknown): Promise<void> {
    const request = UpdateInstallInputSchema.parse(input);
    const stagedPath = path.resolve(request.stagedPath);
    const stagingRoot = path.resolve(this.#stagingDirectory);
    const relative = path.relative(stagingRoot, stagedPath);
    if (relative.startsWith("..") || path.isAbsolute(relative) || path.extname(stagedPath) !== ".msix") {
      throw new Error("更新包路径不在 staging 目录");
    }
    await readFile(stagedPath);
    const error = await this.#dependencies.openPath(stagedPath);
    if (error) throw new Error(error);
  }
}
