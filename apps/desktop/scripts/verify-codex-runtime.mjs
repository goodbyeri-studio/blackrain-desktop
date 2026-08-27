import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOCK_FILE = path.resolve("resources/codex/runtime-lock.json");
const RESOURCE_ROOT = path.resolve("resources/codex");
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CERTIFICATE_THUMBPRINT_PATTERN = /^[a-f0-9]{40}$/i;
const TEAM_IDENTIFIER_PATTERN = /^[A-Z0-9]{10}$/;

/**
 * runtime-lock.json 的 platforms 键 -> 期望的 Rust target 与签名机制。
 * 新增平台时，这里、lock 文件和 codex-executable.ts 的布局表必须同步。
 */
const SUPPORTED_PLATFORMS = {
  "darwin-arm64": {
    target: "aarch64-apple-darwin",
    signature: "codesign",
    executableSuffix: "",
  },
  "windows-x64": {
    target: "x86_64-pc-windows-msvc",
    signature: "authenticode",
    executableSuffix: ".exe",
  },
};

/** 把宿主平台映射到 lock 的 platforms 键。 */
export function hostPlatformKey(
  platform = process.platform,
  arch = process.arch,
) {
  if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
  if (platform === "win32" && arch === "x64") return "windows-x64";
  throw new Error(
    `当前平台 ${platform}-${arch} 没有 vendored Codex runtime；支持 ${Object.keys(SUPPORTED_PLATFORMS).join(" / ")}`,
  );
}

export function runtimeRootFor(platformKey) {
  return path.join(RESOURCE_ROOT, platformKey);
}

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

/**
 * 校验 lock 的结构。所有已声明平台都会被结构性校验（因此 --lock-only 能
 * 发现任何平台的错误），返回 platformKey 对应的条目供完整性校验使用。
 */
export function validateLock(lock, platformKey = hostPlatformKey()) {
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

  const declared = Object.keys(lock.platforms ?? {});
  if (declared.length === 0) {
    throw new Error("runtime-lock.json 必须声明至少一个平台");
  }
  const releasePrefix = `https://github.com/openai/codex/releases/download/${tag}/`;
  for (const key of declared) {
    validatePlatform(key, lock.platforms[key], releasePrefix);
  }

  const platform = lock.platforms?.[platformKey];
  if (!platform) {
    throw new Error(
      `runtime-lock.json 缺少 ${platformKey} 平台锁；已声明 ${declared.join(" / ")}`,
    );
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

/** 结构性校验单个平台条目，含按平台分支的签名断言。 */
function validatePlatform(platformKey, platform, releasePrefix) {
  const expected = SUPPORTED_PLATFORMS[platformKey];
  if (!expected) {
    throw new Error(
      `runtime-lock.json 声明了未支持的平台键 ${platformKey}；支持 ${Object.keys(SUPPORTED_PLATFORMS).join(" / ")}`,
    );
  }
  if (!platform || platform.target !== expected.target) {
    throw new Error(`${platformKey} 的 target 必须是 ${expected.target}`);
  }
  requirePinnedUrl(platform.archive?.url, `${platformKey} archive.url`, releasePrefix);
  requireSha256(platform.archive?.sha256, `${platformKey} archive.sha256`);
  requireString(platform.archive?.fileName, `${platformKey} archive.fileName`);

  if (!Array.isArray(platform.requiredFiles) || platform.requiredFiles.length === 0) {
    throw new Error(`${platformKey} requiredFiles 不能为空`);
  }
  const requiredFilePaths = new Set();
  for (const file of platform.requiredFiles) {
    const relativePath = requireString(file?.path, "requiredFiles.path");
    assertSafeRelativePath(relativePath, "requiredFiles.path");
    requireSha256(file?.sha256, `requiredFiles ${relativePath} sha256`);
    if (requiredFilePaths.has(relativePath)) {
      throw new Error(`${platformKey} requiredFiles 包含重复路径: ${relativePath}`);
    }
    requiredFilePaths.add(relativePath);
  }

  if (expected.signature === "authenticode") {
    const authenticode = platform.authenticode;
    requireString(authenticode?.subject, "authenticode.subject");
    const thumbprint = requireString(
      authenticode?.thumbprint,
      "authenticode.thumbprint",
    );
    if (!CERTIFICATE_THUMBPRINT_PATTERN.test(thumbprint)) {
      throw new Error("authenticode.thumbprint 必须是 40 位证书指纹");
    }
    assertSignedFiles(authenticode?.files, requiredFilePaths, {
      label: "Authenticode",
      suffix: expected.executableSuffix,
    });
    return;
  }

  // macOS：Authenticode 的等价物是 codesign 的 Developer ID 授权链。
  const codesign = platform.codesign;
  requireString(codesign?.authority, "codesign.authority");
  const teamIdentifier = requireString(
    codesign?.teamIdentifier,
    "codesign.teamIdentifier",
  );
  if (!TEAM_IDENTIFIER_PATTERN.test(teamIdentifier)) {
    throw new Error("codesign.teamIdentifier 必须是 10 位 Apple Team ID");
  }
  if (!codesign.authority.includes(teamIdentifier)) {
    throw new Error("codesign.authority 必须包含 teamIdentifier");
  }
  assertSignedFiles(codesign?.files, requiredFilePaths, { label: "codesign" });
}

function assertSignedFiles(files, requiredFilePaths, { label, suffix }) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error(`${label}.files 不能为空`);
  }
  for (const relativePath of files) {
    assertSafeRelativePath(relativePath, `${label}.files`);
    if (suffix && !relativePath.endsWith(suffix)) {
      throw new Error(`${label} 文件必须以 ${suffix} 结尾: ${relativePath}`);
    }
    if (!requiredFilePaths.has(relativePath)) {
      throw new Error(`${label} 文件不在 requiredFiles 中: ${relativePath}`);
    }
  }
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
  { runtimeRoot, platformKey = hostPlatformKey() } = {},
) {
  const resolvedRoot = runtimeRoot ?? runtimeRootFor(platformKey);
  const manifestFile = path.join(resolvedRoot, "runtime-manifest.json");
  let manifest;
  try {
    manifest = await readJson(manifestFile);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `缺少 ${platformKey}/runtime-manifest.json；先运行 npm run electron:runtime:vendor`,
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
    const actualDigest = await sha256(path.join(resolvedRoot, relativePath));
    if (actualDigest !== lockedDigest) {
      throw new Error(`${relativePath} SHA-256 不匹配`);
    }
    assertSignatureRecord(platform, manifestRecord, relativePath);
  }
}

/** 按平台校验 manifest 里记录的签名断言。 */
function assertSignatureRecord(platform, manifestRecord, relativePath) {
  if (platform.authenticode?.files?.includes(relativePath)) {
    const signature = manifestRecord?.authenticode;
    if (
      signature?.status !== "Valid" ||
      signature.subject !== platform.authenticode.subject ||
      signature.thumbprint?.toUpperCase() !==
        platform.authenticode.thumbprint.toUpperCase()
    ) {
      throw new Error(`${relativePath} 缺少有效 Authenticode 记录`);
    }
    return;
  }
  if (platform.codesign?.files?.includes(relativePath)) {
    const signature = manifestRecord?.codesign;
    if (
      signature?.status !== "Valid" ||
      signature.authority !== platform.codesign.authority ||
      signature.teamIdentifier !== platform.codesign.teamIdentifier
    ) {
      throw new Error(`${relativePath} 缺少有效 codesign 记录`);
    }
  }
}

async function main() {
  const lockOnly = process.argv.includes("--lock-only");
  const lock = await readJson(LOCK_FILE);
  // --lock-only 只做结构校验，因此不要求宿主平台可 vendored——CI 在 Linux
  // 上也能跑它。完整性校验才需要落到具体平台的 runtime 目录。
  const platformKey = lockOnly ? undefined : hostPlatformKey();
  const { platform } = validateLock(
    lock,
    platformKey ?? firstDeclaredPlatform(lock),
  );
  if (!lockOnly) {
    await verifyRuntime(lock, platform, { platformKey });
  }
  console.log(
    lockOnly
      ? `Codex runtime 锁有效: ${lock.upstream.tag} (${lock.upstream.commit})；平台 ${Object.keys(lock.platforms).join(" / ")}`
      : `Codex runtime 完整性通过: ${lock.upstream.tag} ${platformKey}`,
  );
}

function firstDeclaredPlatform(lock) {
  const [first] = Object.keys(lock.platforms ?? {});
  if (!first) {
    throw new Error("runtime-lock.json 必须声明至少一个平台");
  }
  return first;
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
