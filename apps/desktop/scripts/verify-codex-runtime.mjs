import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOCK_FILE = path.resolve("resources/codex/runtime-lock.json");
const RUNTIME_ROOT = path.resolve("resources/codex/windows-x64");
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CERTIFICATE_THUMBPRINT_PATTERN = /^[a-f0-9]{40}$/i;

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} 必须是非空字符串`);
  }
  return value;
}

function requireSha256(value, label) {
  const digest = requireString(value, label).toLowerCase();
  if (!SHA256_PATTERN.test(digest)) {
    throw new Error(`${label} 必须是 64 位 SHA-256`);
  }
  return digest;
}

function requirePinnedUrl(value, label, expectedPrefix) {
  const url = new URL(requireString(value, label));
  if (url.protocol !== "https:" || !url.href.startsWith(expectedPrefix)) {
    throw new Error(`${label} 必须指向锁定的 OpenAI Codex HTTPS 资源`);
  }
  return url.href;
}

export function validateLock(lock) {
  if (lock.schemaVersion !== 1) {
    throw new Error("Codex runtime lock schemaVersion 必须为 1");
  }
  const tag = requireString(lock.upstream?.tag, "upstream.tag");
  const commit = requireString(lock.upstream?.commit, "upstream.commit").toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error("upstream.commit 必须是完整 Git commit");
  }
  if (lock.upstream?.license !== "Apache-2.0") {
    throw new Error("Codex runtime 只接受已审计的 Apache-2.0 锁");
  }

  const platform = lock.platforms?.["windows-x64"];
  if (!platform || platform.target !== "x86_64-pc-windows-msvc") {
    throw new Error("缺少 Windows x64 Codex runtime 锁");
  }
  const releasePrefix = `https://github.com/openai/codex/releases/download/${tag}/`;
  requirePinnedUrl(platform.archive?.url, "archive.url", releasePrefix);
  requireSha256(platform.archive?.sha256, "archive.sha256");
  requireString(platform.archive?.fileName, "archive.fileName");

  if (!Array.isArray(platform.requiredFiles) || platform.requiredFiles.length === 0) {
    throw new Error("requiredFiles 不能为空");
  }
  const requiredFilePaths = new Set();
  for (const file of platform.requiredFiles) {
    const relativePath = requireString(file?.path, "requiredFiles.path");
    assertSafeRelativePath(relativePath, "requiredFiles.path");
    requireSha256(file?.sha256, `requiredFiles ${relativePath} sha256`);
    if (requiredFilePaths.has(relativePath)) {
      throw new Error(`requiredFiles 包含重复路径: ${relativePath}`);
    }
    requiredFilePaths.add(relativePath);
  }
  const authenticode = platform.authenticode;
  requireString(authenticode?.subject, "authenticode.subject");
  const thumbprint = requireString(
    authenticode?.thumbprint,
    "authenticode.thumbprint",
  );
  if (!CERTIFICATE_THUMBPRINT_PATTERN.test(thumbprint)) {
    throw new Error("authenticode.thumbprint 必须是 40 位证书指纹");
  }
  if (!Array.isArray(authenticode?.files) || authenticode.files.length === 0) {
    throw new Error("authenticode.files 不能为空");
  }
  for (const relativePath of authenticode.files) {
    assertSafeRelativePath(relativePath, "authenticode.files");
    if (!relativePath.endsWith(".exe") || !requiredFilePaths.has(relativePath)) {
      throw new Error(`Authenticode 文件不在 requiredFiles 中: ${relativePath}`);
    }
  }

  if (!Array.isArray(lock.licenses) || lock.licenses.length === 0) {
    throw new Error("Codex runtime 必须携带 License/NOTICE");
  }
  const sourcePrefix = `https://raw.githubusercontent.com/openai/codex/${commit}/`;
  for (const license of lock.licenses) {
    assertSafeRelativePath(license.path, "license.path");
    requirePinnedUrl(license.url, "license.url", sourcePrefix);
    requireSha256(license.sha256, `license ${license.path} sha256`);
  }
  return { platform };
}

function assertSafeRelativePath(value, label) {
  const relativePath = requireString(value, label).replaceAll("\\", "/");
  if (
    path.posix.isAbsolute(relativePath) ||
    relativePath.split("/").some((segment) => segment === ".." || segment === "")
  ) {
    throw new Error(`${label} 包含不安全路径: ${value}`);
  }
}

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

export async function verifyRuntime(
  lock,
  platform,
  { runtimeRoot = RUNTIME_ROOT } = {},
) {
  const manifestFile = path.join(runtimeRoot, "runtime-manifest.json");
  let manifest;
  try {
    manifest = await readJson(manifestFile);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        "缺少 windows-x64/runtime-manifest.json；先运行 npm run electron:runtime:vendor",
      );
    }
    throw error;
  }
  if (manifest.schemaVersion !== 1) {
    throw new Error("runtime-manifest schemaVersion 必须为 1");
  }
  if (
    manifest.upstream?.tag !== lock.upstream.tag ||
    manifest.upstream?.commit !== lock.upstream.commit ||
    manifest.archive?.sha256 !== platform.archive.sha256
  ) {
    throw new Error("runtime-manifest 与 runtime-lock 不一致");
  }

  const manifestFiles = new Map(
    (manifest.files ?? []).map((file) => [file.path, file]),
  );
  const expectedFiles = [
    ...platform.requiredFiles,
    ...lock.licenses.map((license) => ({
      path: license.path,
      sha256: license.sha256,
    })),
  ];
  for (const expectedFile of expectedFiles) {
    const relativePath = expectedFile.path;
    const lockedDigest = requireSha256(
      expectedFile.sha256,
      `runtime-lock ${relativePath}`,
    );
    const manifestRecord = manifestFiles.get(relativePath);
    const manifestDigest = requireSha256(
      manifestRecord?.sha256,
      `manifest ${relativePath}`,
    );
    if (manifestDigest !== lockedDigest) {
      throw new Error(`${relativePath} manifest 摘要与 runtime-lock 不一致`);
    }
    const actualDigest = await sha256(path.join(runtimeRoot, relativePath));
    if (actualDigest !== lockedDigest) {
      throw new Error(`${relativePath} SHA-256 不匹配`);
    }
    if (platform.authenticode.files.includes(relativePath)) {
      const signature = manifestRecord?.authenticode;
      if (
        signature?.status !== "Valid" ||
        signature.subject !== platform.authenticode.subject ||
        signature.thumbprint?.toUpperCase() !==
          platform.authenticode.thumbprint.toUpperCase()
      ) {
        throw new Error(`${relativePath} 缺少有效 Authenticode 记录`);
      }
    }
  }
}

async function main() {
  const lock = await readJson(LOCK_FILE);
  const { platform } = validateLock(lock);
  if (!process.argv.includes("--lock-only")) {
    await verifyRuntime(lock, platform);
  }
  console.log(
    process.argv.includes("--lock-only")
      ? `Codex runtime 锁有效: ${lock.upstream.tag} (${lock.upstream.commit})`
      : `Codex runtime 完整性通过: ${lock.upstream.tag} windows-x64`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(`Codex runtime 校验失败: ${error.message}`);
    process.exitCode = 1;
  });
}
