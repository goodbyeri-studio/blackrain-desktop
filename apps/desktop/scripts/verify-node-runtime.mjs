import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const LOCK_FILE = path.resolve("resources/node-runtime/runtime-lock.json");
const RUNTIME_ROOT = path.resolve("resources/node-runtime/windows-x64");
const SHA256 = /^[a-f0-9]{64}$/;

export function validateNodeRuntimeLock(lock) {
  if (lock?.schemaVersion !== 1) throw new Error("Node runtime lock schemaVersion 必须为 1");
  const version = requireString(lock.upstream?.version, "upstream.version");
  if (!/^22\.\d+\.\d+$/.test(version)) {
    throw new Error("Browser MCP 生产 runtime 必须锁定 Node 22.x");
  }
  if (lock.upstream?.license !== "MIT") {
    throw new Error("Node runtime license 必须为 MIT");
  }
  const platform = lock.platforms?.["windows-x64"];
  const expectedUrl = `https://nodejs.org/dist/v${version}/node-v${version}-win-x64.zip`;
  if (platform?.archive?.url !== expectedUrl) {
    throw new Error("Node runtime archive URL 未锁定到官方 Windows x64 制品");
  }
  requireSha256(platform.archive.sha256, "archive.sha256");
  const requiredFiles = platform.requiredFiles;
  if (!Array.isArray(requiredFiles) || requiredFiles.length !== 2) {
    throw new Error("Node runtime 必须且只能声明 node.exe 与 LICENSE");
  }
  const paths = new Set(requiredFiles.map((file) => file.path));
  if (!paths.has("node.exe") || !paths.has("LICENSE")) {
    throw new Error("Node runtime 缺少 node.exe 或 LICENSE");
  }
  for (const file of requiredFiles) requireSha256(file.sha256, file.path);
  return { version, platform };
}

export async function verifyNodeRuntime(lock, platform, root = RUNTIME_ROOT) {
  const manifest = JSON.parse(
    await readFile(path.join(root, "runtime-manifest.json"), "utf8").catch((error) => {
      if (error.code === "ENOENT") {
        throw new Error("缺少 Node runtime；先运行 npm run electron:node-runtime:vendor");
      }
      throw error;
    }),
  );
  if (
    manifest.schemaVersion !== 1 ||
    manifest.version !== lock.upstream.version ||
    manifest.archiveSha256 !== platform.archive.sha256
  ) {
    throw new Error("Node runtime manifest 与 lock 不一致");
  }
  for (const expected of platform.requiredFiles) {
    const actual = await sha256(path.join(root, expected.path));
    if (actual !== expected.sha256) {
      throw new Error(`${expected.path} SHA-256 不匹配`);
    }
  }
  const { stdout } = await execFileAsync(path.join(root, "node.exe"), ["--version"], {
    windowsHide: true,
  });
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
  const lock = JSON.parse(await readFile(LOCK_FILE, "utf8"));
  const { version, platform } = validateNodeRuntimeLock(lock);
  if (!process.argv.includes("--lock-only")) {
    await verifyNodeRuntime(lock, platform);
  }
  console.log(
    process.argv.includes("--lock-only")
      ? `Node runtime 锁有效: v${version}`
      : `Node runtime 完整性通过: v${version} windows-x64`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Node runtime 校验失败: ${error.message}`);
    process.exitCode = 1;
  });
}
