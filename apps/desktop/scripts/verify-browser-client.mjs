import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.resolve("resources/browser-client");
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export async function verifyBrowserClient(root = DEFAULT_ROOT) {
  const manifestPath = path.join(root, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    manifest.schemaVersion !== 1 ||
    manifest.name !== "blackrain-browser-client" ||
    manifest.protocolVersion !== 1 ||
    manifest.license !== "Proprietary" ||
    typeof manifest.version !== "string" ||
    !Array.isArray(manifest.files)
  ) {
    throw new Error("Browser client manifest 合同非法");
  }
  const expectedPaths = new Set(["browser-client.mjs", "LICENSE.txt"]);
  if (manifest.files.length !== expectedPaths.size) {
    throw new Error("Browser client manifest 文件集不完整");
  }
  for (const record of manifest.files) {
    if (
      !record ||
      typeof record.path !== "string" ||
      !expectedPaths.delete(record.path) ||
      typeof record.sha256 !== "string" ||
      !SHA256_PATTERN.test(record.sha256)
    ) {
      throw new Error("Browser client manifest 文件记录非法");
    }
    const filePath = path.resolve(root, record.path);
    if (path.dirname(filePath) !== path.resolve(root)) {
      throw new Error("Browser client manifest 路径越界");
    }
    const digest = createHash("sha256")
      .update(await readFile(filePath))
      .digest("hex");
    if (digest !== record.sha256) {
      throw new Error(`Browser client 摘要不一致: ${record.path}`);
    }
  }
  if (expectedPaths.size !== 0) {
    throw new Error("Browser client manifest 缺少必需文件");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await verifyBrowserClient();
  process.stdout.write("Browser client manifest/hash/license 验证通过\n");
}
