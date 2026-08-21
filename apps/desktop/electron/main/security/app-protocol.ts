import { net, protocol } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const APP_PROTOCOL = "blackrain";
export const APP_HOST = "app";
export const FILE_PROTOCOL = "blackrain-file";

export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
      },
    },
    {
      scheme: FILE_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
      },
    },
  ]);
}

export function installWorkspaceFileProtocol(
  workspaces: { list(): Array<{ path: string }> },
): void {
  protocol.handle(FILE_PROTOCOL, (request) => {
    try {
      const url = new URL(request.url);
      const requestedPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      const filePath = path.resolve(requestedPath);
      const allowed = workspaces.list().some((workspace) => {
        const root = path.resolve(workspace.path);
        const left = process.platform === "win32" ? filePath.toLowerCase() : filePath;
        const right = process.platform === "win32" ? root.toLowerCase() : root;
        return left === right || left.startsWith(`${right}${path.sep}`);
      });
      if (!allowed) return new Response("Forbidden", { status: 403 });
      return net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response("Bad request", { status: 400 });
    }
  });
}

export function installAppProtocol(rendererRoot: string): void {
  const root = path.resolve(rendererRoot);
  protocol.handle(APP_PROTOCOL, (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) {
      return new Response("Not found", { status: 404 });
    }

    const requestedPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const relativePath = requestedPath || "index.html";
    const filePath = path.resolve(root, relativePath);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      return new Response("Forbidden", { status: 403 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}
