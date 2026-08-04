import path from "node:path";
import { shell } from "electron";
import {
  ExternalUrlInputSchema,
  FilePathInputSchema,
} from "../../shared/desktop";
import type { WorkspaceStore } from "../workspaces/workspace-store";

type ShellProvider = Pick<typeof shell, "openExternal" | "showItemInFolder">;

export class DesktopShellService {
  constructor(
    private readonly provider: ShellProvider = shell,
    private readonly workspaces?: WorkspaceStore,
  ) {}

  async openExternal(input: unknown): Promise<void> {
    const { url } = ExternalUrlInputSchema.parse(input);
    await this.provider.openExternal(url);
  }

  revealPath(input: unknown): void {
    const request = FilePathInputSchema.parse(input);
    const isWindowsPath =
      /^[a-z]:[\\/]/iu.test(request.path) || /^[/\\]{2}[^/\\]/u.test(request.path);
    const pathApi = isWindowsPath && path.win32.isAbsolute(request.path)
      ? path.win32
      : path.posix.isAbsolute(request.path)
        ? path.posix
        : null;
    if (!pathApi) {
      throw new Error("只允许在文件管理器中显示绝对路径");
    }
    if (this.workspaces && !this.isWorkspacePath(request.path)) {
      throw new Error("只允许显示已登记工作区内的路径");
    }
    this.provider.showItemInFolder(pathApi.normalize(request.path));
  }

  private isWorkspacePath(value: string): boolean {
    const candidate = path.resolve(value);
    return this.workspaces!.list().some((workspace) => {
      const root = path.resolve(workspace.path);
      const left = process.platform === "win32" ? candidate.toLowerCase() : candidate;
      const right = process.platform === "win32" ? root.toLowerCase() : root;
      return left === right || left.startsWith(`${right}${path.sep}`);
    });
  }
}
