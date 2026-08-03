import { app, screen, type BrowserWindow } from "electron";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const probeTimeoutMs = 120_000;
const pollIntervalMs = 100;

type RendererProbe = {
  buttonBounds: { x: number; y: number; width: number; height: number };
  events: Array<{
    type: string;
    clientX: number | null;
    clientY: number | null;
    target: string;
  }>;
  settingsOpen: boolean;
  focused: boolean;
  activeElement: string | null;
  hitTarget: string | null;
  buttonContainsHitTarget: boolean;
};

export function installNativeInputProbe(window: BrowserWindow): void {
  if (process.env.BLACKRAIN_ELECTRON_NATIVE_INPUT_PROBE !== "1") return;

  const resultPath = process.env.BLACKRAIN_ELECTRON_NATIVE_INPUT_PROBE_RESULT;
  if (!resultPath || !path.isAbsolute(resultPath)) {
    console.error("BLACKRAIN_ELECTRON_NATIVE_INPUT_PROBE_RESULT 必须是绝对路径");
    app.exit(1);
    return;
  }

  writeProbeResult(resultPath, {
    status: "main-installed",
    pid: process.pid,
    mainWindow: readMainWindowState(window),
  });

  let polling = false;
  let finished = false;
  let interval: NodeJS.Timeout | undefined;
  const timeout = setTimeout(() => {
    if (finished) return;
    finished = true;
    if (interval) clearInterval(interval);
    writeProbeResult(resultPath, {
      status: "fail",
      reason: "native input timeout",
      mainWindow: readMainWindowState(window),
    });
    app.exit(1);
  }, probeTimeoutMs);

  window.webContents.once("did-finish-load", () => {
    writeProbeResult(resultPath, {
      status: "renderer-loaded",
      pid: process.pid,
      url: window.webContents.getURL(),
      mainWindow: readMainWindowState(window),
    });
    interval = setInterval(() => {
      if (polling || finished || window.isDestroyed()) return;
      polling = true;
      void readRendererProbe(window)
        .then((renderer) => {
          const contentBounds = window.getContentBounds();
          const screenPoint = {
            x: Math.round(
              contentBounds.x + renderer.buttonBounds.x + renderer.buttonBounds.width / 2,
            ),
            y: Math.round(
              contentBounds.y + renderer.buttonBounds.y + renderer.buttonBounds.height / 2,
            ),
          };
          const status = renderer.settingsOpen
            ? "pass"
            : renderer.events.length > 0
              ? "observed"
              : "ready";
          writeProbeResult(resultPath, {
            status,
            pid: process.pid,
            mainWindow: readMainWindowState(window),
            contentBounds,
            screenPoint,
            dipConvertedScreenPoint: screen.dipToScreenPoint(screenPoint),
            cursorScreenPoint: screen.getCursorScreenPoint(),
            renderer,
          });
          if (status === "pass") {
            finished = true;
            clearTimeout(timeout);
            if (interval) clearInterval(interval);
            setTimeout(() => app.exit(0), 100);
          }
        })
        .catch((error) => {
          if (String(error).includes("settings button not ready")) return;
          finished = true;
          clearTimeout(timeout);
          if (interval) clearInterval(interval);
          writeProbeResult(resultPath, {
            status: "error",
            error: error instanceof Error ? error.stack ?? error.message : String(error),
            mainWindow: readMainWindowState(window),
          });
          app.exit(1);
        })
        .finally(() => {
          polling = false;
        });
    }, pollIntervalMs);
  });
}

function readMainWindowState(window: BrowserWindow): Record<string, unknown> {
  return {
    enabled: window.isEnabled(),
    focusable: window.isFocusable(),
    focused: window.isFocused(),
    visible: window.isVisible(),
    webContentsFocused: window.webContents.isFocused(),
    bounds: window.getBounds(),
    childViews: window.contentView.children.map((child) => {
      const candidate = child as typeof child & {
        webContents?: { getURL(): string; id: number };
      };
      return {
        bounds: child.getBounds(),
        webContentsId: candidate.webContents?.id ?? null,
        url: candidate.webContents?.getURL() ?? null,
      };
    }),
  };
}

function readRendererProbe(window: BrowserWindow): Promise<RendererProbe> {
  return window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector(
        '[aria-label="打开设置"], [aria-label="Open settings"]'
      );
      if (!(button instanceof HTMLElement)) {
        throw new Error('settings button not ready');
      }
      if (!globalThis.__blackrainNativeInputEvents) {
        globalThis.__blackrainNativeInputEvents = [];
        for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
          document.addEventListener(type, (event) => {
            globalThis.__blackrainNativeInputEvents.push({
              type,
              clientX: 'clientX' in event ? event.clientX : null,
              clientY: 'clientY' in event ? event.clientY : null,
              target: event.target instanceof Element
                ? event.target.tagName + '.' + event.target.className
                : String(event.target),
            });
          }, { capture: true });
        }
      }
      const rect = button.getBoundingClientRect();
      const hitTarget = document.elementFromPoint(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
      );
      return {
        buttonBounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        events: globalThis.__blackrainNativeInputEvents,
        settingsOpen: document.querySelector('.settings-overlay') !== null,
        focused: document.hasFocus(),
        activeElement: document.activeElement instanceof HTMLElement
          ? document.activeElement.tagName + '.' + document.activeElement.className
          : null,
        hitTarget: hitTarget instanceof Element
          ? hitTarget.tagName + '.' + hitTarget.className
          : null,
        buttonContainsHitTarget: hitTarget instanceof Node && button.contains(hitTarget),
      };
    })()
  `, true) as Promise<RendererProbe>;
}

function writeProbeResult(resultPath: string, result: unknown): void {
  mkdirSync(path.dirname(resultPath), { recursive: true });
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}
