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
  installWorkspaceFileProtocol,
  registerAppScheme,
} from "./security/app-protocol";
import { AppWindowRegistry } from "./security/window-registry";
import { WorkspaceStore } from "./workspaces/workspace-store";
import { SettingsStore } from "./settings/settings-store";
import { FileService } from "./files/file-service";
import { AccountSessionStore } from "./credentials/account-session-store";
import { DesktopShellService } from "./shell/desktop-shell-service";
import { DesktopDialogService } from "./dialog/desktop-dialog-service";
import { installElectronE2eHarness } from "./testing/electron-e2e-harness";
import {
  bindSystemPowerEvents,
  SystemPowerLifecycle,
} from "./app/system-power-lifecycle";
import {
  RuntimeBootstrapCoordinator,
  RuntimeDiagnostics,
} from "./app/runtime-bootstrap";
import { GitService } from "./git/git-service";
import { TerminalService } from "./terminal/terminal-service";
import { SystemUiService } from "./app/system-ui-service";
import { UpdateService } from "./updates/update-service";
import { codexHomeId } from "./app-server/codex-home";

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
const pendingDeepLinks: string[] = [];
const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) app.quit();
if (app.isPackaged) app.setAsDefaultProtocolClient("blackrain");
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
  { codexHomeId: codexHomeId(process.env), profileId: "persist:blackrain-browser-app" },
);
const settings = new SettingsStore(
  path.join(blackRainDataPaths.appState, "settings.json"),
);
const files = new FileService(workspaces);
const git = new GitService(workspaces);
const terminal = new TerminalService(workspaces);
const accountSessions = new AccountSessionStore(
  path.join(blackRainDataPaths.appState, "credentials", "sessions.json"),
);
const desktopShell = new DesktopShellService(undefined, workspaces);
const desktopDialog = new DesktopDialogService();
const systemUi = new SystemUiService();
const updates = new UpdateService(blackRainDataPaths.appState);
const diagnostics = new RuntimeDiagnostics();
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
  onDiagnostic: (line) => {
    diagnostics.record(line);
    console.error(`[codex app-server] ${line}`);
  },
});
const runtimeBootstrap = new RuntimeBootstrapCoordinator({
  runtime: agent,
  diagnostics,
  skipAccountProbe:
    process.env.BLACKRAIN_ELECTRON_E2E === "1" ||
    process.env.BLACKRAIN_ELECTRON_SMOKE === "1",
  skipRuntimeStart:
    (process.env.BLACKRAIN_ELECTRON_E2E === "1" ||
      process.argv.includes("--blackrain-e2e")) &&
    process.env.BLACKRAIN_ELECTRON_REAL_AGENT_E2E !== "1",
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

function acceptDeepLinks(argumentsList: readonly string[]): void {
  for (const argument of argumentsList) {
    if (!argument.startsWith("blackrain://thread/open?")) continue;
    if (!app.isReady()) pendingDeepLinks.push(argument);
    else {
      try {
        systemUi.openDeepLink(argument);
      } catch (error) {
        diagnostics.record(`deep-link rejected: ${String(error)}`);
      }
    }
  }
}

app.on("second-instance", (_event, argv) => acceptDeepLinks(argv));
app.on("open-url", (event, url) => {
  event.preventDefault();
  acceptDeepLinks([url]);
});
acceptDeepLinks(process.argv);

function openMainWindow(): BrowserWindow {
  const window = createMainWindow(windows, browser);
  try {
    systemUi.initializeTray(
      window,
      path.join(process.resourcesPath, "icon.png"),
      () => app.quit(),
    );
  } catch (error) {
    diagnostics.record(`tray initialization failed: ${String(error)}`);
  }
  return window;
}

app.whenReady().then(() => {
  installWorkspaceFileProtocol(workspaces);
  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    installAppProtocol(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`),
    );
  }
  disposePowerEvents = bindSystemPowerEvents(powerMonitor, powerLifecycle);
  disposeIpc = registerIpcHandlers(
    windows,
    browser,
    agent,
    workspaces,
    settings,
    files,
    accountSessions,
    desktopShell,
    desktopDialog,
    runtimeBootstrap,
    git,
    terminal,
    systemUi,
    updates,
  );
  openMainWindow();
  acceptDeepLinks(pendingDeepLinks.splice(0));
  void runtimeBootstrap.initialize();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      openMainWindow();
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
      terminal.dispose();
      systemUi.dispose();
      shutdownComplete = true;
      app.quit();
    });
});
