import path from "node:path";
import { shell } from "electron";
import {
  ExternalUrlInputSchema,
  FilePathInputSchema,
} from "../../shared/desktop";

type ShellProvider = Pick<typeof shell, "openExternal" | "showItemInFolder">;

export class DesktopShellService {
  constructor(private readonly provider: ShellProvider = shell) {}

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
    this.provider.showItemInFolder(pathApi.normalize(request.path));
  }
}
