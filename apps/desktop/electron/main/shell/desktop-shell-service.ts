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
    if (!path.isAbsolute(request.path)) {
      throw new Error("只允许在文件管理器中显示绝对路径");
    }
    this.provider.showItemInFolder(path.normalize(request.path));
  }
}
