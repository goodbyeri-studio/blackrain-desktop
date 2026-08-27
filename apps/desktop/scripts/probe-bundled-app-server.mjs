import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  hostPlatformKey,
  validateLock,
  verifyRuntime,
} from "./verify-codex-runtime.mjs";
import {
  hostPlatformKey as nodeHostPlatformKey,
  validateNodeRuntimeLock,
  verifyNodeRuntime,
} from "./verify-node-runtime.mjs";

// 随包 Node 可执行文件在包内的相对路径，按平台不同。
const NODE_EXECUTABLE = {
  "darwin-arm64": path.join("bin", "node"),
  "windows-x64": "node.exe",
};

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const platformKey = hostPlatformKey();
const lockPath = path.join(
  desktopRoot,
  "resources",
  "codex",
  "runtime-lock.json",
);
const runtimeRoot = path.join(desktopRoot, "resources", "codex", platformKey);
const lock = JSON.parse(await readFile(lockPath, "utf8"));
const { platform } = validateLock(lock, platformKey);
await verifyRuntime(lock, platform, { runtimeRoot, platformKey });
const nodeLockPath = path.join(
  desktopRoot,
  "resources",
  "node-runtime",
  "runtime-lock.json",
);
const nodePlatformKey = nodeHostPlatformKey();
const nodeRuntimeRoot = path.join(
  desktopRoot,
  "resources",
  "node-runtime",
  nodePlatformKey,
);
const nodeLock = JSON.parse(await readFile(nodeLockPath, "utf8"));
const { platform: nodePlatform } = validateNodeRuntimeLock(
  nodeLock,
  nodePlatformKey,
);
await verifyNodeRuntime(nodeLock, nodePlatform, {
  root: nodeRuntimeRoot,
  platformKey: nodePlatformKey,
});

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
        NODE_EXECUTABLE[nodePlatformKey],
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
