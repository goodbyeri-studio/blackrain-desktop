import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const workerPath = path.join(desktopRoot, "scripts", "electron-e2e.mjs");
const hardTimeoutMs = 8 * 60 * 1_000;

const worker = spawn(process.execPath, [workerPath], {
  cwd: desktopRoot,
  env: process.env,
  stdio: "inherit",
  detached: process.platform !== "win32",
});

const terminateWorkerTree = () =>
  new Promise((resolve) => {
    if (worker.exitCode !== null || worker.signalCode !== null) {
      resolve();
      return;
    }

    if (process.platform === "win32") {
      const taskkill = spawn(
        "taskkill.exe",
        ["/PID", String(worker.pid), "/T", "/F"],
        { stdio: "inherit" },
      );
      taskkill.once("error", resolve);
      taskkill.once("exit", resolve);
      return;
    }

    try {
      process.kill(-worker.pid, "SIGKILL");
    } catch (error) {
      if (error?.code !== "ESRCH") {
        console.error("[electron-e2e] Failed to terminate worker tree", error);
      }
    }
    resolve();
  });

const timeout = setTimeout(async () => {
  console.error(
    `[electron-e2e] Hard timeout after ${hardTimeoutMs / 60_000} minutes; terminating worker process tree (PID ${worker.pid})`,
  );
  process.exitCode = 124;
  await terminateWorkerTree();
}, hardTimeoutMs);
timeout.unref();

const forwardTermination = async (signal) => {
  console.error(`[electron-e2e] Received ${signal}; terminating worker process tree`);
  await terminateWorkerTree();
  process.exitCode = 1;
};

process.once("SIGINT", () => void forwardTermination("SIGINT"));
process.once("SIGTERM", () => void forwardTermination("SIGTERM"));

const result = await new Promise((resolve, reject) => {
  worker.once("error", reject);
  worker.once("exit", (code, signal) => resolve({ code, signal }));
});
clearTimeout(timeout);

if (process.exitCode !== 124) {
  if (result.signal) {
    console.error(`[electron-e2e] Worker exited from signal ${result.signal}`);
    process.exitCode = 1;
  } else {
    process.exitCode = result.code ?? 1;
  }
}
