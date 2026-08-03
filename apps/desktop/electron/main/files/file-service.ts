import {
  lstatSync,
  readFileSync,
  realpathSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { dialog, type BrowserWindow } from "electron";
import {
  AgentWorkspaceInputSchema,
  FilePathInputSchema,
  FilePickInputSchema,
  FileSaveTextInputSchema,
  WorkspaceFileInputSchema,
} from "../../shared/desktop";
import type { WorkspaceStore } from "../workspaces/workspace-store";

const IMAGE_MIME = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".bmp", "image/bmp"],
  [".tif", "image/tiff"],
  [".tiff", "image/tiff"],
]);
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "target",
  ".next",
  ".vite",
]);
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_WORKSPACE_FILES = 20_000;
const MAX_DEPTH = 16;

export class FileService {
  constructor(private readonly workspaces: WorkspaceStore) {}

  async pick(ownerWindow: BrowserWindow, input: unknown): Promise<string[]> {
    const request = FilePickInputSchema.parse(input);
    const result = await dialog.showOpenDialog(ownerWindow, {
      title: request.title ?? (
        request.kind === "image"
          ? "选择图片"
          : request.kind === "directory"
            ? "选择文件夹"
            : "选择文件"
      ),
      defaultPath: request.defaultPath,
      properties: [
        request.kind === "directory" ? "openDirectory" : "openFile",
        ...(request.multiple ? ["multiSelections" as const] : []),
      ],
      ...(request.kind === "image"
        ? {
            filters: [{
              name: "Images",
              extensions: [...new Set([...IMAGE_MIME.keys()].map((item) => item.slice(1)))],
            }],
          }
        : {}),
    });
    return result.canceled ? [] : result.filePaths.map((item) => path.normalize(item));
  }

  async saveText(ownerWindow: BrowserWindow, input: unknown): Promise<string | null> {
    const request = FileSaveTextInputSchema.parse(input);
    const result = await dialog.showSaveDialog(ownerWindow, {
      title: "导出 Markdown",
      defaultPath: request.defaultFileName,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (result.canceled || !result.filePath) return null;
    writeFileSync(result.filePath, request.content, "utf8");
    return path.normalize(result.filePath);
  }

  readImage(input: unknown): string {
    const request = FilePathInputSchema.parse(input);
    if (!path.isAbsolute(request.path)) throw new Error("图片路径必须是绝对路径");
    const mime = IMAGE_MIME.get(path.extname(request.path).toLowerCase());
    if (!mime) throw new Error("不支持的图片类型");
    const filePath = realpathSync(request.path);
    const stats = statSync(filePath);
    if (!stats.isFile() || stats.size > MAX_IMAGE_BYTES) {
      throw new Error("图片不存在或超过 25 MiB");
    }
    return `data:${mime};base64,${readFileSync(filePath).toString("base64")}`;
  }

  listWorkspace(input: unknown): string[] {
    const request = AgentWorkspaceInputSchema.parse(input);
    const workspace = this.workspaces.require(request.workspaceId);
    const root = realpathSync(workspace.path);
    const files: string[] = [];
    const visit = (directory: string, depth: number) => {
      if (depth > MAX_DEPTH || files.length >= MAX_WORKSPACE_FILES) return;
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (files.length >= MAX_WORKSPACE_FILES) break;
        if (entry.isSymbolicLink()) continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (!SKIPPED_DIRECTORIES.has(entry.name)) visit(absolute, depth + 1);
          continue;
        }
        if (entry.isFile()) files.push(path.relative(root, absolute).replaceAll("\\", "/"));
      }
    };
    visit(root, 0);
    return files;
  }

  readWorkspace(input: unknown): { content: string; truncated: boolean } {
    const request = WorkspaceFileInputSchema.parse(input);
    const workspace = this.workspaces.require(request.workspaceId);
    const root = realpathSync(workspace.path);
    const candidate = path.resolve(root, request.path);
    assertInside(root, candidate);
    if (lstatSync(candidate).isSymbolicLink()) throw new Error("不读取符号链接文件");
    const filePath = realpathSync(candidate);
    assertInside(root, filePath);
    const stats = statSync(filePath);
    if (!stats.isFile()) throw new Error("工作区路径不是文件");
    const truncated = stats.size > MAX_TEXT_BYTES;
    const buffer = readFileSync(filePath).subarray(0, MAX_TEXT_BYTES);
    return { content: buffer.toString("utf8"), truncated };
  }
}

function assertInside(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("文件路径超出工作区");
  }
}
