import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
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
  WorkspaceFileWriteInputSchema,
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
const MAX_WRITE_BYTES = 8 * 1024 * 1024;
const MAX_WORKSPACE_FILES = 20_000;
const MAX_DEPTH = 16;

export class FileService {
  readonly #grantedFiles = new Set<string>();

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
    const paths = result.canceled ? [] : result.filePaths.map((item) => path.normalize(item));
    for (const item of paths) {
      try {
        this.#grantedFiles.add(pathKey(realpathSync(item)));
      } catch {
        // 文件选择器返回的路径可能在选择后立即消失。
      }
    }
    return paths;
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
    if (!this.#isAllowedPath(filePath)) {
      throw new Error("图片路径不属于已登记工作区或用户选择文件");
    }
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

  readWorkspace(input: unknown): { exists: boolean; content: string; truncated: boolean } {
    const request = WorkspaceFileInputSchema.parse(input);
    const workspace = this.workspaces.require(request.workspaceId);
    const root = realpathSync(workspace.path);
    const candidate = path.resolve(root, request.path);
    assertInside(root, candidate);
    if (!existsSync(candidate)) return { exists: false, content: "", truncated: false };
    if (lstatSync(candidate).isSymbolicLink()) throw new Error("不读取符号链接文件");
    const filePath = realpathSync(candidate);
    assertInside(root, filePath);
    const stats = statSync(filePath);
    if (!stats.isFile()) throw new Error("工作区路径不是文件");
    const truncated = stats.size > MAX_TEXT_BYTES;
    const buffer = readFileSync(filePath).subarray(0, MAX_TEXT_BYTES);
    return { exists: true, content: buffer.toString("utf8"), truncated };
  }

  writeWorkspace(input: unknown): void {
    const request = WorkspaceFileWriteInputSchema.parse(input);
    const workspace = this.workspaces.require(request.workspaceId);
    const root = realpathSync(workspace.path);
    const candidate = path.resolve(root, request.path);
    assertInside(root, candidate);

    const parent = path.dirname(candidate);
    const realParent = realpathSync(parent);
    assertInside(root, realParent);
    assertNoSymbolicLinks(root, parent);
    if (existsSync(candidate)) {
      const stats = lstatSync(candidate);
      if (stats.isSymbolicLink()) throw new Error("不写入符号链接文件");
      if (!stats.isFile()) throw new Error("工作区路径不是文件");
    }

    const content = Buffer.from(request.content, "utf8");
    if (content.byteLength > MAX_WRITE_BYTES) throw new Error("文件内容超过 8 MiB");
    const descriptor = openSync(
      candidate,
      constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      writeFileSync(descriptor, content);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
  }

  #isAllowedPath(filePath: string): boolean {
    const key = pathKey(filePath);
    if (this.#grantedFiles.has(key)) return true;
    return this.workspaces.list().some((workspace) => {
      const root = pathKey(workspace.path);
      return key === root || key.startsWith(`${root}${path.sep}`);
    });
  }
}

function assertNoSymbolicLinks(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  assertInside(root, candidate);
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error("工作区路径包含符号链接");
    }
  }
}

function assertInside(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("文件路径超出工作区");
  }
}

function pathKey(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
