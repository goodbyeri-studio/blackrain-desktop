import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const LOCK_FILE = path.resolve("resources/node-runtime/runtime-lock.json");
const RESOURCE_ROOT = path.resolve("resources/node-runtime");
const SHA256 = /^[a-f0-9]{64}$/;

/**
 * runtime-lock.json 的 platforms 键 -> 官方制品命名与包内布局。
 * 新增平台时，这里、lock 文件和 node-runtime-executable.ts 必须同步。
 */
const SUPPORTED_PLATFORMS = {
  "darwin-arm64": {
    archiveSuffix: "darwin-arm64.tar.gz",
    executable: path.join("bin", "node"),
    label: "macOS arm64",
  },
  "windows-x64": {
    archiveSuffix: "win-x64.zip",
    executable: "node.exe",
    label: "Windows x64",
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
    `当前平台 ${platform}-${arch} 没有 vendored Node runtime；支持 ${Object.keys(SUPPORTED_PLATFORMS).join(" / ")}`,
  );
}

export function validateNodeRuntimeLock(lock, platformKey = hostPlatformKey()) {
  if (lock?.schemaVersion !== 1) throw new Error("Node runtime lock schemaVersion 必须为 1");
  const version = requireString(lock.upstream?.version, "upstream.version");
  if (!/^22\.\d+\.\d+$/.test(version)) {
    throw new Error("Browser MCP 生产 runtime 必须锁定 Node 22.x");
  }
  if (lock.upstream?.license !== "MIT") {
    throw new Error("Node runtime license 必须为 MIT");
  }

  const declared = Object.keys(lock.platforms ?? {});
  if (declared.length === 0) {
    throw new Error("runtime-lock.json 必须声明至少一个平台");
  }
  for (const key of declared) {
    validateNodePlatform(key, lock.platforms[key], version);
  }

  const platform = lock.platforms?.[platformKey];
  if (!platform) {
    throw new Error(
      `runtime-lock.json 缺少 ${platformKey} 平台锁；已声明 ${declared.join(" / ")}`,
    );
  }
  return { version, platform, platformKey };
}

function validateNodePlatform(platformKey, platform, version) {
  const expected = SUPPORTED_PLATFORMS[platformKey];
  if (!expected) {
    throw new Error(
      `runtime-lock.json 声明了未支持的平台键 ${platformKey}；支持 ${Object.keys(SUPPORTED_PLATFORMS).join(" / ")}`,
    );
  }
  const expectedUrl = `https://nodejs.org/dist/v${version}/node-v${version}-${expected.archiveSuffix}`;
  if (platform?.archive?.url !== expectedUrl) {
    throw new Error(
      `Node runtime archive URL 未锁定到官方 ${expected.label} 制品：${platformKey}`,
    );
  }
  requireSha256(platform.archive.sha256, `${platformKey} archive.sha256`);

  const requiredFiles = platform.requiredFiles;
  if (!Array.isArray(requiredFiles) || requiredFiles.length !== 2) {
    throw new Error(
      `${platformKey} 必须且只能声明 ${expected.executable} 与 LICENSE`,
    );
  }
  const paths = new Set(requiredFiles.map((file) => file.path));
  if (!paths.has(expected.executable) || !paths.has("LICENSE")) {
    throw new Error(`${platformKey} 缺少 ${expected.executable} 或 LICENSE`);
  }
  for (const file of requiredFiles) requireSha256(file.sha256, file.path);
}

export async function verifyNodeRuntime(lock, platform, options = {}) {
  // 与 verify-codex-runtime.mjs 同因：platformKey 必须惰性解析，否则
  // hostPlatformKey() 会在调用方已给出 root 时也求值，在未 vendored 的
  // 平台（CI 的 linux-x64）抛错。
  const { root } = options;
  const platformKey =
    options.platformKey ?? (root ? undefined : hostPlatformKey());
  const resolvedRoot = root ?? path.join(RESOURCE_ROOT, platformKey);
  const manifest = JSON.parse(
    await readFile(path.join(resolvedRoot, "runtime-manifest.json"), "utf8").catch(
      (error) => {
        if (error.code === "ENOENT") {
          throw new Error(
            `缺少 ${platformKey} Node runtime；先运行 npm run electron:node-runtime:vendor`,
          );
        }
        throw error;
      },
    ),
  );
  if (
    manifest.schemaVersion !== 1 ||
    manifest.version !== lock.upstream.version ||
    manifest.archiveSha256 !== platform.archive.sha256
  ) {
    throw new Error("Node runtime manifest 与 lock 不一致");
  }
  for (const expected of platform.requiredFiles) {
    const actual = await sha256(path.join(resolvedRoot, expected.path));
    if (actual !== expected.sha256) {
      throw new Error(`${expected.path} SHA-256 不匹配`);
    }
  }
  // platformKey 在调用方只给 root 时为 undefined，此时从 lock 的
  // requiredFiles 反推可执行文件（node 的 requiredFiles 只有它和 LICENSE）。
  const executable =
    platformKey !== undefined
      ? SUPPORTED_PLATFORMS[platformKey].executable
      : platform.requiredFiles.find((file) => file.path !== "LICENSE")?.path;
  if (!executable) {
    throw new Error("无法从 runtime-lock 推断 Node 可执行文件路径");
  }
  const { stdout } = await execFileAsync(
    path.join(resolvedRoot, executable),
    ["--version"],
    { windowsHide: true },
  );
  if (stdout.trim() !== `v${lock.upstream.version}`) {
    throw new Error(`Node runtime 版本不匹配: ${stdout.trim()}`);
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} 缺失`);
  return value;
}

function requireSha256(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error(`${label} 必须是小写 SHA-256`);
  }
}

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function main() {
  const lockOnly = process.argv.includes("--lock-only");
  const lock = JSON.parse(await readFile(LOCK_FILE, "utf8"));
  // --lock-only 只做结构校验，不要求宿主平台已 vendored，因此 CI 在 Linux
  // 上也能跑它。完整性校验才需要落到具体平台的 runtime 目录。
  const platformKey = lockOnly
    ? Object.keys(lock.platforms ?? {})[0]
    : hostPlatformKey();
  const { version, platform } = validateNodeRuntimeLock(lock, platformKey);
  if (!lockOnly) {
    await verifyNodeRuntime(lock, platform, { platformKey });
  }
  console.log(
    lockOnly
      ? `Node runtime 锁有效: v${version}；平台 ${Object.keys(lock.platforms).join(" / ")}`
      : `Node runtime 完整性通过: v${version} ${platformKey}`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Node runtime 校验失败: ${error.message}`);
    process.exitCode = 1;
  });
}
