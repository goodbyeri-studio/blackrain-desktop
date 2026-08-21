import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const probeDate = new Date().toISOString().slice(0, 10);
const resultPath = path.resolve(
  process.env.BLACKRAIN_NATIVE_INPUT_PROBE_RESULT ??
    `output/verification/${probeDate}-electron-native-input-probe.json`,
);
const executablePath = path.resolve(
  "out/electron/blackrain-win32-x64/BlackRain.exe",
);
const appDataPath = await mkdtemp(
  path.join(os.tmpdir(), "blackrain-native-input-probe-"),
);

await mkdir(path.dirname(resultPath), { recursive: true });
await rm(resultPath, { force: true });
logStage("launching production package");
const child = spawn(executablePath, [], {
  env: {
    ...process.env,
    BLACKRAIN_ELECTRON_E2E: "0",
    BLACKRAIN_ELECTRON_SMOKE: "0",
    BLACKRAIN_ELECTRON_NATIVE_INPUT_PROBE: "1",
    BLACKRAIN_ELECTRON_NATIVE_INPUT_PROBE_RESULT: resultPath,
    BLACKRAIN_ELECTRON_TEST_APP_DATA: appDataPath,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: false,
});
logStage(`spawned pid ${child.pid}`);

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk;
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});
child.once("exit", (code, signal) => {
  logStage(`application exited: code=${code} signal=${signal}`);
});

try {
  const ready = await pollResult(
    (result) => result.status === "ready" ? result : null,
    "application ready",
    60_000,
  );
  logStage(`window ready: ${JSON.stringify(ready.mainWindow)}`);
  logStage(`sending native click at ${ready.screenPoint.x},${ready.screenPoint.y}`);
  sendNativeClick(ready.screenPoint);

  const finalResult = await pollResult(
    (result) => ["pass", "fail", "error"].includes(result.status) ? result : null,
    "native click observation",
    20_000,
  );
  logStage(`probe completed: ${finalResult.status}`);
  if (finalResult.status !== "pass") {
    process.exitCode = 1;
    console.error(JSON.stringify({ finalResult, stdout, stderr }, null, 2));
  }
} catch (error) {
  process.exitCode = 1;
  await writeFailureResult(error);
  console.error("[electron-native-input-probe] failed", error);
  if (stdout) console.error(`[electron-native-input-probe] stdout\n${stdout}`);
  if (stderr) console.error(`[electron-native-input-probe] stderr\n${stderr}`);
} finally {
  if (child.exitCode === null) child.kill();
  await waitForExit(child, 5_000).catch(() => undefined);
  await rm(appDataPath, { recursive: true, force: true, maxRetries: 3 });
}

async function writeFailureResult(error) {
  let previous = {};
  try {
    previous = JSON.parse(await readFile(resultPath, "utf8"));
  } catch {
    // The failure itself remains useful even when main never wrote a stage.
  }
  await writeFile(
    resultPath,
    `${JSON.stringify({
      ...previous,
      status: "fail",
      reason: error instanceof Error ? error.message : String(error),
    }, null, 2)}\n`,
    "utf8",
  );
}

async function pollResult(predicate, stage, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastResult;
  while (Date.now() < deadline) {
    try {
      lastResult = JSON.parse(await readFile(resultPath, "utf8"));
      const value = predicate(lastResult);
      if (value) return value;
      if (["fail", "error"].includes(lastResult.status)) return lastResult;
    } catch (error) {
      if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
    if (child.exitCode !== null) {
      throw new Error(
        `${stage}: application exited early with code ${child.exitCode}; stderr=${stderr}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${stage} timed out after ${timeoutMs}ms; last=${JSON.stringify(lastResult)}`);
}

function waitForExit(childProcess, timeoutMs) {
  if (childProcess.exitCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`process ${childProcess.pid} did not exit`)),
      timeoutMs,
    );
    childProcess.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function logStage(stage) {
  console.log(`[electron-native-input-probe] ${new Date().toISOString()} ${stage}`);
}

function sendNativeClick(point) {
  const x = Math.round(Number(point?.x));
  const y = Math.round(Number(point?.y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`invalid native click point: ${JSON.stringify(point)}`);
  }
  const script = `
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public static class BlackRainNativeMouse {
  [DllImport("user32.dll", SetLastError = true)] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, System.UIntPtr extraInfo);
}
'@
if (-not [BlackRainNativeMouse]::SetCursorPos(${x}, ${y})) { throw 'SetCursorPos failed' }
Start-Sleep -Milliseconds 100
[BlackRainNativeMouse]::mouse_event(0x0002, 0, 0, 0, [System.UIntPtr]::Zero)
[BlackRainNativeMouse]::mouse_event(0x0004, 0, 0, 0, [System.UIntPtr]::Zero)
`;
  execFileSync("C:\\Program Files\\PowerShell\\7\\pwsh.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    script,
  ], { windowsHide: true, stdio: "pipe" });
}
