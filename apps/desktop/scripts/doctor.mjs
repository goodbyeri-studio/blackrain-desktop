import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const strict = process.argv.includes("--strict");

function isExecutableFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    if (process.platform === "win32") return true;
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function hasCommand(command) {
  const pathValue = process.env.PATH;
  if (!pathValue) return false;

  const dirs = pathValue.split(path.delimiter).filter(Boolean);

  if (process.platform !== "win32") {
    return dirs.some((dir) => isExecutableFile(path.join(dir, command)));
  }

  const pathExtValue = process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM";
  const exts = pathExtValue.split(";").filter(Boolean);
  const hasExtension = path.extname(command) !== "";

  for (const dir of dirs) {
    if (hasExtension) {
      if (isExecutableFile(path.join(dir, command))) return true;
      continue;
    }
    for (const ext of exts) {
      if (isExecutableFile(path.join(dir, `${command}${ext}`))) return true;
    }
  }

  return false;
}

function fileSha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function verifyHermesRuntime() {
  const runtimeRoot = path.resolve(
    process.cwd(),
    "src-tauri/resources/hermes-runtime/windows-x64",
  );
  const required = [
    "venv/Scripts/python.exe",
    "venv/Scripts/hermes.exe",
    "packages.lock.txt",
    "provenance/runtime-manifest.json",
    "provenance/build.json",
    "provenance/python-distributions.json",
    "LICENSES/Hermes-Agent-MIT.txt",
    "NOTICE.txt",
    "SHA256SUMS",
  ];
  const errors = [];
  for (const relative of required) {
    const candidate = path.join(runtimeRoot, ...relative.split("/"));
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
      errors.push(`Hermes runtime missing ${relative}`);
    }
  }
  if (errors.length > 0) {
    return errors;
  }

  const basePythonRoot = path.join(runtimeRoot, "python");
  const basePythonExecutables = [];
  const pendingDirectories = fs.existsSync(basePythonRoot) ? [basePythonRoot] : [];
  if (pendingDirectories.length === 0) {
    errors.push("Hermes runtime missing managed Python directory");
  }
  while (pendingDirectories.length > 0) {
    const current = pendingDirectories.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        errors.push(`Hermes runtime contains unsupported symlink: ${path.relative(runtimeRoot, candidate)}`);
      } else if (entry.isDirectory()) {
        pendingDirectories.push(candidate);
      } else if (entry.isFile() && entry.name.toLowerCase() === "python.exe") {
        basePythonExecutables.push(candidate);
      }
    }
  }
  if (basePythonExecutables.length === 0) {
    errors.push("Hermes runtime missing managed base python.exe");
  }

  const sourceManifest = path.join(
    runtimeRoot,
    "..",
    "windows-x64.manifest.json",
  );
  const runtimeManifest = path.join(
    runtimeRoot,
    "provenance",
    "runtime-manifest.json",
  );
  if (
    !fs.existsSync(sourceManifest) ||
    fileSha256(sourceManifest) !== fileSha256(runtimeManifest)
  ) {
    errors.push("Hermes runtime manifest does not match the frozen source manifest");
  }
  let expectedMcpVersion = null;
  try {
    const manifest = JSON.parse(fs.readFileSync(sourceManifest, "utf8"));
    expectedMcpVersion = manifest.requiredDistributions?.mcp ?? null;
    if (!expectedMcpVersion) {
      errors.push("Hermes runtime manifest does not declare the required MCP SDK version");
    }
  } catch (error) {
    errors.push(`Hermes runtime manifest is invalid: ${error.message}`);
  }

  const checksumLines = fs
    .readFileSync(path.join(runtimeRoot, "SHA256SUMS"), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const checksumTargets = new Set();
  for (const line of checksumLines) {
    const match = line.match(/^([0-9a-fA-F]{64})\s{2}(.+)$/);
    if (!match) {
      errors.push("Hermes runtime SHA256SUMS has an invalid line");
      continue;
    }
    const [, expected, relative] = match;
    const segments = relative.split("/");
    if (
      relative.includes("\\") ||
      path.isAbsolute(relative) ||
      segments.some((segment) => segment === "" || segment === "." || segment === "..")
    ) {
      errors.push(`Hermes runtime checksum has unsafe path: ${relative}`);
      continue;
    }
    if (checksumTargets.has(relative)) {
      errors.push(`Hermes runtime checksum target duplicated: ${relative}`);
      continue;
    }
    checksumTargets.add(relative);
    const candidate = path.resolve(runtimeRoot, ...relative.split("/"));
    const relativeFromRoot = path.relative(runtimeRoot, candidate);
    if (relativeFromRoot.startsWith("..") || path.isAbsolute(relativeFromRoot)) {
      errors.push(`Hermes runtime checksum escapes root: ${relative}`);
      continue;
    }
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
      errors.push(`Hermes runtime checksum target missing: ${relative}`);
      continue;
    }
    if (fileSha256(candidate) !== expected.toLowerCase()) {
      errors.push(`Hermes runtime checksum mismatch: ${relative}`);
    }
  }

  const actualFiles = [];
  const pendingRuntimeDirectories = [runtimeRoot];
  while (pendingRuntimeDirectories.length > 0) {
    const current = pendingRuntimeDirectories.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        errors.push(`Hermes runtime contains unsupported symlink: ${path.relative(runtimeRoot, candidate)}`);
      } else if (entry.isDirectory()) {
        pendingRuntimeDirectories.push(candidate);
      } else if (entry.isFile()) {
        const relative = path.relative(runtimeRoot, candidate).split(path.sep).join("/");
        if (relative !== "SHA256SUMS" && relative !== ".gitkeep") {
          actualFiles.push(relative);
        }
      }
    }
  }
  for (const relative of actualFiles) {
    if (!checksumTargets.has(relative)) {
      errors.push(`Hermes runtime file is not covered by SHA256SUMS: ${relative}`);
    }
  }
  for (const relative of checksumTargets) {
    if (!actualFiles.includes(relative)) {
      errors.push(`Hermes runtime checksum has no packaged file: ${relative}`);
    }
  }

  const python = path.join(runtimeRoot, "venv", "Scripts", "python.exe");
  const expectedMcpLiteral = JSON.stringify(expectedMcpVersion ?? "__missing__");
  const smoke = spawnSync(
    python,
    [
      "-c",
      `import asyncio, importlib.metadata as m, importlib.util; import aiohttp, mcp, yaml, hermes_cli; import gateway.platforms.api_server; import tools.mcp_tool; assert m.version('mcp') == ${expectedMcpLiteral}; assert importlib.util.find_spec('uvloop') is None; asyncio.run(asyncio.sleep(0))`,
    ],
    { encoding: "utf8", windowsHide: true, timeout: 30_000 },
  );
  if (smoke.error || smoke.status !== 0) {
    const detail = (smoke.stderr || smoke.error?.message || "unknown error").trim();
    errors.push(`Hermes runtime import smoke failed: ${detail}`);
  }
  return errors;
}

const missing = [];
if (!hasCommand("cmake")) missing.push("cmake");
if (process.platform === "win32" && !hasCommand("clang")) missing.push("llvm");
if (
  process.platform === "win32" &&
  process.env.BLACKRAIN_SKIP_HERMES_RUNTIME_DOCTOR !== "1"
) {
  missing.push(...verifyHermesRuntime());
}

if (missing.length === 0) {
  console.log("Doctor: OK");
  process.exit(0);
}

console.log("Doctor: missing or invalid dependencies/runtime:");
for (const item of missing) {
  console.log(`- ${item}`);
}

switch (process.platform) {
  case "darwin":
    console.log("Install: brew install cmake");
    break;
  case "linux":
    console.log("Ubuntu/Debian: sudo apt-get install cmake");
    console.log("Fedora: sudo dnf install cmake");
    console.log("Arch: sudo pacman -S cmake");
    break;
  case "win32":
    console.log("Install: choco install cmake llvm");
    console.log("Or download from: https://cmake.org/download/");
    console.log("If bindgen fails, set LIBCLANG_PATH to your LLVM bin directory.");
    break;
  default:
    console.log("Install CMake from: https://cmake.org/download/");
    break;
}

process.exit(strict ? 1 : 0);
