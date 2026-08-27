/**
 * 把锁定的 codex / Node runtime vendored 到 resources/<platform>/。
 *
 * 用 Node 实现而非 shell：可跨平台复用同一份逻辑，直接 import verify 脚本的
 * 平台表与校验函数，且不依赖 jq。历史的 PowerShell 脚本只覆盖 Windows，
 * 保留在 ../../scripts/ 仅供 Windows 恢复开发时参考。
 *
 * 用法（在 apps/desktop 下）：
 *   node scripts/vendor-runtime.mjs --target codex [--force] [--archive <path>]
 *   node scripts/vendor-runtime.mjs --target node  [--force] [--archive <path>]
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  hostPlatformKey as codexHostPlatformKey,
  validateLock as validateCodexLock,
} from "./verify-codex-runtime.mjs";
import {
  hostPlatformKey as nodeHostPlatformKey,
  validateNodeRuntimeLock,
} from "./verify-node-runtime.mjs";

const execFileAsync = promisify(execFile);

const TARGETS = {
  codex: {
    resourceRoot: path.resolve("resources/codex"),
    hostPlatformKey: codexHostPlatformKey,
    validate: (lock, key) => validateCodexLock(lock, key),
    verifyCommand: "npm run electron:runtime:verify",
  },
  node: {
    resourceRoot: path.resolve("resources/node-runtime"),
    hostPlatformKey: nodeHostPlatformKey,
    validate: (lock, key) => validateNodeRuntimeLock(lock, key),
    verifyCommand: "npm run electron:node-runtime:verify",
  },
};

function parseArguments(argv) {
  const target = valueOf(argv, "--target");
  if (!target || !TARGETS[target]) {
    throw new Error(
      `--target 必须是 ${Object.keys(TARGETS).join(" 或 ")}`,
    );
  }
  return {
    target,
    force: argv.includes("--force"),
    archive: valueOf(argv, "--archive"),
  };
}

function valueOf(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

/** 只接受 HTTPS，且下载后必须匹配 lock 里的 sha256。 */
async function downloadPinned(url, destination, expectedSha256) {
  if (new URL(url).protocol !== "https:") {
    throw new Error(`拒绝非 HTTPS 下载: ${url}`);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载失败 ${response.status}: ${url}`);
  }
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  const actual = await sha256(destination);
  if (actual !== expectedSha256.toLowerCase()) {
    await rm(destination, { force: true });
    throw new Error(
      `${path.basename(destination)} SHA-256 不匹配：期望 ${expectedSha256}，实际 ${actual}`,
    );
  }
}

/** 解压归档；.zip 用 unzip，.tar.gz 用 tar。 */
async function extract(archive, into) {
  if (archive.endsWith(".zip")) {
    await execFileAsync("unzip", ["-q", archive, "-d", into]);
    return;
  }
  await execFileAsync("tar", ["-xzf", archive, "-C", into]);
}

/**
 * 读取 codesign 的 Developer ID 身份，写入 manifest 供 verify 比对。
 * 只在 macOS 上可用；其他平台返回 undefined（Windows 的 Authenticode 由
 * 历史 PowerShell 脚本处理）。
 */
async function readCodesign(file) {
  if (process.platform !== "darwin") return undefined;
  const { stderr } = await execFileAsync("codesign", ["-dvvv", file]).catch(
    (error) => ({ stderr: error.stderr ?? "" }),
  );
  const authority = /^Authority=(.+)$/m.exec(stderr)?.[1]?.trim();
  const teamIdentifier = /\(([A-Z0-9]{10})\)\s*$/.exec(authority ?? "")?.[1];
  if (!authority || !teamIdentifier) {
    throw new Error(`无法读取 codesign 身份: ${file}`);
  }
  return { status: "Valid", authority, teamIdentifier };
}

/** 归档解包后，找到真正的包根目录（Node 归档多一层版本目录）。 */
async function resolvePackageRoot(extractRoot, requiredFiles) {
  const candidates = [extractRoot];
  for (const entry of await readdir(extractRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) candidates.push(path.join(extractRoot, entry.name));
  }
  for (const candidate of candidates) {
    const found = await Promise.all(
      requiredFiles.map((file) =>
        readFile(path.join(candidate, file.path))
          .then(() => true)
          .catch(() => false),
      ),
    );
    if (found.every(Boolean)) return candidate;
  }
  throw new Error("归档中找不到包含全部 requiredFiles 的目录");
}

async function main() {
  const { target, force, archive: archiveOverride } = parseArguments(
    process.argv.slice(2),
  );
  const config = TARGETS[target];
  const lockFile = path.join(config.resourceRoot, "runtime-lock.json");
  const lock = JSON.parse(await readFile(lockFile, "utf8"));
  const platformKey = config.hostPlatformKey();
  const { platform } = config.validate(lock, platformKey);

  const runtimeRoot = path.join(config.resourceRoot, platformKey);
  const existing = await readdir(runtimeRoot).catch(() => []);
  const meaningful = existing.filter((entry) => entry !== ".gitkeep");
  if (meaningful.length > 0 && !force) {
    throw new Error(`${platformKey} runtime 已存在；确认替换时加 --force`);
  }

  const cacheRoot = path.resolve("../../.scratch/runtime-cache");
  await mkdir(cacheRoot, { recursive: true });
  const archive =
    archiveOverride ?? path.join(cacheRoot, platform.archive.fileName);
  if (!archiveOverride) {
    const cached = await sha256(archive).catch(() => null);
    if (cached !== platform.archive.sha256.toLowerCase()) {
      console.log(`下载 ${platform.archive.fileName} …`);
      await downloadPinned(
        platform.archive.url,
        archive,
        platform.archive.sha256,
      );
    }
  } else {
    const actual = await sha256(archive);
    if (actual !== platform.archive.sha256.toLowerCase()) {
      throw new Error(`--archive 的 SHA-256 与 lock 不一致：${actual}`);
    }
  }

  const extractRoot = await mkdtemp(
    path.join(os.tmpdir(), "blackrain-vendor-"),
  );
  try {
    await extract(archive, extractRoot);
    const packageRoot = await resolvePackageRoot(
      extractRoot,
      platform.requiredFiles,
    );

    // 逐个校验 requiredFiles 的摘要，再复制。
    for (const file of platform.requiredFiles) {
      const actual = await sha256(path.join(packageRoot, file.path));
      if (actual !== file.sha256.toLowerCase()) {
        throw new Error(
          `${file.path} SHA-256 不匹配：期望 ${file.sha256}，实际 ${actual}`,
        );
      }
    }

    // 逐项清空，保留 .gitkeep——它是受 git 跟踪的占位文件，`rm -rf` 整个
    // 目录会把它一起删掉，导致新克隆里目录消失、.gitignore 的取反规则失效。
    for (const entry of await readdir(runtimeRoot).catch(() => [])) {
      if (entry === ".gitkeep") continue;
      await rm(path.join(runtimeRoot, entry), { recursive: true, force: true });
    }
    await mkdir(runtimeRoot, { recursive: true });
    await cp(packageRoot, runtimeRoot, { recursive: true });

    // License/NOTICE 只有 codex lock 声明；Node 的 LICENSE 在 requiredFiles 里。
    for (const license of lock.licenses ?? []) {
      const destination = path.join(runtimeRoot, license.path);
      await mkdir(path.dirname(destination), { recursive: true });
      await downloadPinned(license.url, destination, license.sha256);
    }

    const manifest = await buildManifest(
      target,
      lock,
      platform,
      platformKey,
      runtimeRoot,
    );
    await writeFile(
      path.join(runtimeRoot, "runtime-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    console.log(`${target} runtime 已 vendored 到 ${runtimeRoot}`);
    console.log(`下一步：${config.verifyCommand}`);
  } finally {
    await rm(extractRoot, { recursive: true, force: true });
  }
}

async function buildManifest(target, lock, platform, platformKey, runtimeRoot) {
  const entries = [
    ...platform.requiredFiles,
    ...(lock.licenses ?? []).map((license) => ({
      path: license.path,
      sha256: license.sha256,
    })),
  ];
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(runtimeRoot, entry.path);
    const record = { path: entry.path, sha256: await sha256(absolute) };
    if (platform.codesign?.files?.includes(entry.path)) {
      const signature = await readCodesign(absolute);
      if (!signature) {
        throw new Error(
          `${entry.path} 需要 codesign 断言，但当前平台无法读取签名`,
        );
      }
      if (
        signature.authority !== platform.codesign.authority ||
        signature.teamIdentifier !== platform.codesign.teamIdentifier
      ) {
        throw new Error(
          `${entry.path} 的 codesign 身份与 runtime-lock 不一致：${signature.authority}`,
        );
      }
      record.codesign = signature;
    }
    files.push(record);
  }

  if (target === "node") {
    return {
      schemaVersion: 1,
      version: lock.upstream.version,
      archiveSha256: platform.archive.sha256,
      platform: platformKey,
      files,
    };
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    upstream: {
      repository: lock.upstream.repository,
      tag: lock.upstream.tag,
      commit: lock.upstream.commit,
      license: lock.upstream.license,
    },
    target: platform.target,
    archive: {
      fileName: platform.archive.fileName,
      url: platform.archive.url,
      sha256: platform.archive.sha256,
    },
    files,
  };
}

main().catch((error) => {
  console.error(`vendor 失败: ${error.message}`);
  process.exitCode = 1;
});
