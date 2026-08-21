import { app, type BrowserWindow } from "electron";
import { writeFileSync } from "node:fs";

const smokeTimeoutMs = 30_000;

export function installSmokeProbe(window: BrowserWindow): void {
  if (process.env.BLACKRAIN_ELECTRON_SMOKE !== "1") {
    return;
  }

  const timeout = setTimeout(() => {
    writeSmokeResult({ ok: false, reason: "timeout" });
    console.error("BLACKRAIN_ELECTRON_SMOKE_FAILED timeout");
    app.exit(1);
  }, smokeTimeoutMs);

  window.webContents.once("did-finish-load", () => {
    try {
      const preferences = (
        window.webContents as typeof window.webContents & {
          getLastWebPreferences(): {
            sandbox?: boolean;
            contextIsolation?: boolean;
            nodeIntegration?: boolean;
          };
        }
      ).getLastWebPreferences();
      const result = {
        title: window.webContents.getTitle(),
        url: window.webContents.getURL(),
        sandbox: preferences.sandbox,
        contextIsolation: preferences.contextIsolation,
        nodeIntegration: preferences.nodeIntegration,
      };
      const passed =
        result.title === "BlackRain" &&
        result.url === "blackrain://app/index.html" &&
        result.sandbox === true &&
        result.contextIsolation === true &&
        result.nodeIntegration === false;
      if (!passed) {
        throw new Error(`unexpected result: ${JSON.stringify(result)}`);
      }
      writeSmokeResult({ ok: true, result });
      console.log(`BLACKRAIN_ELECTRON_SMOKE_OK ${JSON.stringify(result)}`);
      clearTimeout(timeout);
      app.exit(0);
    } catch (error) {
      writeSmokeResult({ ok: false, reason: String(error) });
      console.error("BLACKRAIN_ELECTRON_SMOKE_FAILED", error);
      clearTimeout(timeout);
      app.exit(1);
    }
  });
}

function writeSmokeResult(result: unknown): void {
  const resultPath = process.env.BLACKRAIN_ELECTRON_SMOKE_RESULT;
  if (resultPath) {
    writeFileSync(resultPath, JSON.stringify(result), "utf8");
  }
}
