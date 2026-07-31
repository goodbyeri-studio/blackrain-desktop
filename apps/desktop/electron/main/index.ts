import { app, BrowserWindow, powerMonitor } from "electron";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createMainWindow } from "./app/create-main-window";
import {
  ensureBlackRainDataPaths,
  resolveElectronAppDataPath,
} from "./app/data-paths";
import { BrowserViewManager } from "./browser/browser-view-manager";
import { AppServerRuntime } from "./app-server/app-server-runtime";
import { resolveCodexExecutablePath } from "./app-server/codex-executable";
import { registerIpcHandlers } from "./ipc/register-ipc";
import {
  installAppProtocol,
  registerAppScheme,
} from "./security/app-protocol";
import { AppWindowRegistry } from "./security/window-registry";
import { WorkspaceStore } from "./workspaces/workspace-store";
import { installElectronE2eHarness } from "./testing/electron-e2e-harness";
import {
  bindSystemPowerEvents,
  SystemPowerLifecycle,
} from "./app/system-power-lifecycle";

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
const blackRainDataPaths = ensureBlackRainDataPaths(
  resolveElectronAppDataPath(app.getPath("appData"), process.env),
);
app.setPath("userData", blackRainDataPaths.appState);
app.setPath("sessionData", blackRainDataPaths.browserData);
app.setAppLogsPath(blackRainDataPaths.logs);
registerAppScheme();

const windows = new AppWindowRegistry();
const browser = new BrowserViewManager(undefined, {
  stateFilePath: path.join(blackRainDataPaths.appState, "browser-tabs.json"),
});
const workspaces = new WorkspaceStore(
  path.join(blackRainDataPaths.appState, "workspaces.json"),
);
const browserClientResourceRoot = app.isPackaged
  ? path.join(process.resourcesPath, "browser-client")
  : path.join(app.getAppPath(), "resources", "browser-client");
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
  resolveBrowserClientPath: () =>
    path.join(browserClientResourceRoot, "browser-client.mjs"),
  resolveBrowserMcpAdapterPath: () =>
    path.join(browserClientResourceRoot, "browser-mcp-server.mjs"),
  resolveBrowserMcpNodePath: () =>
    app.isPackaged
      ? path.join(
          process.resourcesPath,
          "node-runtime",
          "windows-x64",
          "node.exe",
        )
      : process.env.BLACKRAIN_NODE_BIN?.trim() || "node",
  onDiagnostic: (line) => console.error(`[codex app-server] ${line}`),
});
const powerLifecycle = new SystemPowerLifecycle([browser, agent]);
const disposeE2eHarness = installElectronE2eHarness(browser, {
  enabled: process.env.BLACKRAIN_ELECTRON_E2E === "1",
  packaged: app.isPackaged,
  simulateSystemPowerCycle: async () => {
    powerLifecycle.suspend();
    powerLifecycle.resume();
    await powerLifecycle.whenIdle();
  },
});
let disposeIpc: (() => void) | undefined;
let disposePowerEvents: (() => void) | undefined;
let shutdownStarted = false;
let shutdownComplete = false;

app.whenReady().then(() => {
  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    installAppProtocol(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`),
    );
  }
  disposePowerEvents = bindSystemPowerEvents(powerMonitor, powerLifecycle);
  disposeIpc = registerIpcHandlers(windows, browser, agent, workspaces);
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
  disposePowerEvents?.();
  powerLifecycle.dispose();
  disposeE2eHarness();
  disposeIpc?.();
  void powerLifecycle
    .whenIdle()
    .then(() => agent.stop())
    .finally(() => {
      browser.dispose();
      shutdownComplete = true;
      app.quit();
    });
});
