import { BrowserWindow } from "electron";
import path from "node:path";
import type { BrowserViewManager } from "../browser/browser-view-manager";
import { APP_HOST, APP_PROTOCOL } from "../security/app-protocol";
import { secureAppSession } from "../security/app-session";
import type { AppWindowRegistry } from "../security/window-registry";
import { installSmokeProbe } from "./smoke-probe";

let nextWindowGeneration = 1;

function isAllowedAppUrl(target: string, developmentUrl?: string): boolean {
  if (developmentUrl) {
    return new URL(target).origin === new URL(developmentUrl).origin;
  }
  const url = new URL(target);
  return url.protocol === `${APP_PROTOCOL}:` && url.host === APP_HOST;
}

export function createMainWindow(
  registry: AppWindowRegistry,
  browser: BrowserViewManager,
): BrowserWindow {
  const developmentUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL;
  const generation = nextWindowGeneration++;
  const window = new BrowserWindow({
    title: "BlackRain",
    width: 1200,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  });

  registry.register({
    webContentsId: window.webContents.id,
    role: "main",
    generation,
  });
  const webContentsId = window.webContents.id;
  secureAppSession(window.webContents.session, Boolean(developmentUrl));

  window.webContents.on("will-navigate", (event, target) => {
    if (!isAllowedAppUrl(target, developmentUrl)) {
      event.preventDefault();
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl) => {
      console.error("App renderer load failed", {
        errorCode,
        errorDescription,
        validatedUrl,
      });
    },
  );
  window.once("close", () => browser.releaseWindow(window, generation));
  window.on("closed", () => registry.unregister(webContentsId));
  window.once("ready-to-show", () => window.show());
  installSmokeProbe(window);

  if (developmentUrl) {
    void window.loadURL(developmentUrl);
  } else {
    void window.loadURL(`${APP_PROTOCOL}://${APP_HOST}/index.html`);
  }
  return window;
}
