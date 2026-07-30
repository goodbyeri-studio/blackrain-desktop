import { app, BrowserWindow } from "electron";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createMainWindow } from "./app/create-main-window";
import { ensureBlackRainDataPaths } from "./app/data-paths";
import { BrowserViewManager } from "./browser/browser-view-manager";
import { AppServerRuntime } from "./app-server/app-server-runtime";
import { resolveCodexExecutablePath } from "./app-server/codex-executable";
import { registerIpcHandlers } from "./ipc/register-ipc";
import {
  installAppProtocol,
  registerAppScheme,
} from "./security/app-protocol";
import { AppWindowRegistry } from "./security/window-registry";
import { installElectronE2eHarness } from "./testing/electron-e2e-harness";

if (
  process.env.BLACKRAIN_ELECTRON_SMOKE === "1" &&
  process.env.BLACKRAIN_ELECTRON_SMOKE_RESULT
) {
  writeFileSync(
    process.env.BLACKRAIN_ELECTRON_SMOKE_RESULT,
    JSON.stringify({ ok: false, phase: "main-started" }),
    "utf8",
  );
}

app.setName("BlackRain");
const blackRainDataPaths = ensureBlackRainDataPaths(app.getPath("appData"));
app.setPath("userData", blackRainDataPaths.appState);
app.setPath("sessionData", blackRainDataPaths.browserData);
app.setAppLogsPath(blackRainDataPaths.logs);
registerAppScheme();

const windows = new AppWindowRegistry();
const browser = new BrowserViewManager();
const disposeE2eHarness = installElectronE2eHarness(browser, {
  enabled: process.env.BLACKRAIN_ELECTRON_E2E === "1",
  packaged: app.isPackaged,
});
const agent = new AppServerRuntime({
  resolveExecutablePath: () =>
    resolveCodexExecutablePath({
      resourcesPath: process.resourcesPath,
      override: process.env.BLACKRAIN_CODEX_BIN,
      allowOverride: !app.isPackaged,
    }),
  cwd: process.cwd(),
  clientVersion: app.getVersion(),
  browserBackend: browser,
  onDiagnostic: (line) => console.error(`[codex app-server] ${line}`),
});
let disposeIpc: (() => void) | undefined;
let shutdownStarted = false;
let shutdownComplete = false;

app.whenReady().then(() => {
  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    installAppProtocol(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`),
    );
  }
  disposeIpc = registerIpcHandlers(windows, browser, agent);
  createMainWindow(windows, browser);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(windows, browser);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (shutdownComplete) return;
  event.preventDefault();
  if (shutdownStarted) return;
  shutdownStarted = true;
  disposeE2eHarness();
  disposeIpc?.();
  browser.dispose();
  void agent.stop().finally(() => {
    shutdownComplete = true;
    app.quit();
  });
});
