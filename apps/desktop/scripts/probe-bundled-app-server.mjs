import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  validateLock,
  verifyRuntime,
} from "./verify-codex-runtime.mjs";

if (process.platform !== "win32") {
  throw new Error("bundled Codex app-server 探针仅支持 Windows x64");
}

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const lockPath = path.join(
  desktopRoot,
  "resources",
  "codex",
  "runtime-lock.json",
);
const runtimeRoot = path.join(
  desktopRoot,
  "resources",
  "codex",
  "windows-x64",
);
const lock = JSON.parse(await readFile(lockPath, "utf8"));
const { platform } = validateLock(lock);
await verifyRuntime(lock, platform, { runtimeRoot });

const vitestEntry = path.join(
  desktopRoot,
  "node_modules",
  "vitest",
  "vitest.mjs",
);
const result = spawnSync(
  process.execPath,
  [
    vitestEntry,
    "run",
    "electron/main/app-server/bundled-app-server-probe.test.ts",
  ],
  {
    cwd: desktopRoot,
    env: { ...process.env, BLACKRAIN_BUNDLED_CODEX_PROBE: "1" },
    stdio: "inherit",
    windowsHide: true,
  },
);

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
}
