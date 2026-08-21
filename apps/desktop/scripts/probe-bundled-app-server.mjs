import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  validateLock,
  verifyRuntime,
} from "./verify-codex-runtime.mjs";
import {
  validateNodeRuntimeLock,
  verifyNodeRuntime,
} from "./verify-node-runtime.mjs";

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
const nodeLockPath = path.join(
  desktopRoot,
  "resources",
  "node-runtime",
  "runtime-lock.json",
);
const nodeRuntimeRoot = path.join(
  desktopRoot,
  "resources",
  "node-runtime",
  "windows-x64",
);
const nodeLock = JSON.parse(await readFile(nodeLockPath, "utf8"));
const { platform: nodePlatform } = validateNodeRuntimeLock(nodeLock);
await verifyNodeRuntime(nodeLock, nodePlatform, nodeRuntimeRoot);

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
    "--no-file-parallelism",
    "electron/main/app-server/bundled-app-server-probe.test.ts",
    "electron/main/app-server/bundled-browser-mcp-probe.test.ts",
  ],
  {
    cwd: desktopRoot,
    env: {
      ...process.env,
      BLACKRAIN_BUNDLED_CODEX_PROBE: "1",
      BLACKRAIN_BROWSER_MCP_PROBE_NODE: path.join(
        nodeRuntimeRoot,
        "node.exe",
      ),
    },
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
