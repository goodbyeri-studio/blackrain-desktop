import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const powershell7Path = String.raw`C:\Program Files\PowerShell\7\pwsh.exe`;
const executablePath = path.join(
  desktopRoot,
  "out",
  "electron",
  "blackrain-win32-x64",
  "BlackRain.exe",
);
const resultPath = path.join(
  os.tmpdir(),
  `blackrain-electron-smoke-${process.pid}.json`,
);
const appDataPath = await mkdtemp(
  path.join(os.tmpdir(), "blackrain-electron-smoke-"),
);
await rm(resultPath, { force: true });

const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
delete environment.NODE_OPTIONS;
delete environment.NODE_PATH;
environment.BLACKRAIN_ELECTRON_SMOKE = "1";
environment.BLACKRAIN_ELECTRON_SMOKE_RESULT = resultPath;
environment.BLACKRAIN_ELECTRON_TEST_APP_DATA = appDataPath;

let child;
let childExit;
let childError;
let stdout = "";
let stderr = "";
let result;

try {
  child = spawn(executablePath, [], {
    cwd: path.dirname(executablePath),
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  childExit = new Promise((resolve) => {
    child.once("error", (error) => {
      childError = error.message;
      resolve({ code: null, signal: null, error: childError });
    });
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout = appendBounded(stdout, chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr = appendBounded(stderr, chunk);
  });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !childError) {
    try {
      const current = JSON.parse(await readFile(resultPath, "utf8"));
      result = current;
      if (current.ok === true || current.reason) {
        break;
      }
    } catch {
      // Electron main 可能仍在启动。
    }
    await delay(250);
  }

  if (result?.ok !== true) {
    throw new Error(
      `Electron smoke 失败：${JSON.stringify({
        result,
        childError,
        exitCode: child.exitCode,
        stdout,
        stderr,
      })}`,
    );
  }

  const exit = await waitForExit(childExit, 10_000);
  if (!exit || exit.code !== 0) {
    throw new Error(`Electron smoke 进程未正常退出：${JSON.stringify(exit)}`);
  }

  console.log(`Electron smoke 通过：${JSON.stringify(result.result)}`);
} finally {
  await stopChild(child, childExit);
  await rm(resultPath, { force: true });
  await rm(appDataPath, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 200,
  });
}

function appendBounded(current, chunk) {
  return `${current}${String(chunk)}`.slice(-16 * 1024);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForExit(exitPromise, timeout) {
  let timeoutId;
  try {
    return await Promise.race([
      exitPromise,
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve(undefined), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function stopChild(runningChild, exitPromise) {
  if (
    !runningChild ||
    !exitPromise ||
    runningChild.exitCode !== null ||
    runningChild.signalCode !== null
  ) {
    return;
  }

  if (!runningChild.kill()) {
    return;
  }
  if (await waitForExit(exitPromise, 5_000)) {
    return;
  }

  cleanupPackagedElectron();
  await waitForExit(exitPromise, 5_000);
}

function cleanupPackagedElectron() {
  if (process.platform !== "win32") {
    return;
  }
  spawnSync(
    powershell7Path,
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
