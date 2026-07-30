import { spawn, spawnSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const executablePath = path.join(
  desktopRoot,
  "out",
  "electron",
  "codex-monitor-win32-x64",
  "BlackRain.exe",
);
const resultPath = path.join(
  os.tmpdir(),
  `blackrain-electron-smoke-${process.pid}.json`,
);
await rm(resultPath, { force: true });

const child = spawn(executablePath, [], {
  cwd: path.dirname(executablePath),
  env: {
    ...process.env,
    BLACKRAIN_ELECTRON_SMOKE: "1",
    BLACKRAIN_ELECTRON_SMOKE_RESULT: resultPath,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdout = appendBounded(stdout, chunk);
});
child.stderr.on("data", (chunk) => {
  stderr = appendBounded(stderr, chunk);
});

const deadline = Date.now() + 30_000;
let result;
while (Date.now() < deadline) {
  try {
    const current = JSON.parse(await readFile(resultPath, "utf8"));
    result = current;
    if (current.ok === true || current.reason) {
      break;
    }
  } catch {
    // Electron main 可能仍在启动。
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

await rm(resultPath, { force: true });
if (result?.ok !== true) {
  child.kill();
  cleanupPackagedElectron();
  throw new Error(
    `Electron smoke 失败：${JSON.stringify({
      result,
      exitCode: child.exitCode,
      stdout,
      stderr,
    })}`,
  );
}

function appendBounded(current, chunk) {
  return `${current}${String(chunk)}`.slice(-16 * 1024);
}

console.log(`Electron smoke 通过：${JSON.stringify(result.result)}`);

function cleanupPackagedElectron() {
  if (process.platform !== "win32") {
    return;
  }
  spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "$target=$env:BLACKRAIN_SMOKE_ELECTRON_PATH; Get-Process | Where-Object { try { $_.Path -eq $target } catch { $false } } | Stop-Process -Force",
    ],
    {
      env: { ...process.env, BLACKRAIN_SMOKE_ELECTRON_PATH: executablePath },
      stdio: "ignore",
    },
  );
}
