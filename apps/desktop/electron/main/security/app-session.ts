import type { Session } from "electron";

const productionCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
].join("; ");

const developmentCsp = productionCsp
  .replace("script-src 'self'", "script-src 'self' 'unsafe-eval'")
  .replace(
    "connect-src 'self' https: wss:",
    "connect-src 'self' http://localhost:* ws://localhost:* https: wss:",
  );

const securedSessions = new WeakSet<Session>();

export function secureAppSession(appSession: Session, development: boolean): void {
  if (securedSessions.has(appSession)) {
    return;
  }
  securedSessions.add(appSession);
  appSession.setPermissionCheckHandler(() => false);
  appSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  appSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [development ? developmentCsp : productionCsp],
      },
    });
  });
}
