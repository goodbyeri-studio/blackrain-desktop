import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { dialog, type BrowserWindow } from "electron";
import { z } from "zod";
import {
  WorkspaceIdInputSchema,
  WorkspaceInfoSchema,
  WorkspaceListSchema,
  WorkspacePathInputSchema,
  WorkspacePickInputSchema,
  WorkspaceUpdateInputSchema,
  type WorkspaceInfo,
} from "../../shared/workspaces";

const WorkspaceFileSchema = z.object({
  schemaVersion: z.literal(1),
  workspaces: WorkspaceListSchema,
});

export class WorkspaceStore {
  readonly #filePath: string;
  readonly #workspaces = new Map<string, WorkspaceInfo>();

  constructor(filePath: string) {
    this.#filePath = filePath;
    try {
      const file = WorkspaceFileSchema.parse(
        JSON.parse(readFileSync(filePath, "utf8")),
      );
      for (const workspace of file.workspaces) {
        if (this.isDirectory({ path: workspace.path })) {
          this.#workspaces.set(workspace.id, workspace);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("Electron workspace state 无法读取，将从空列表启动");
      }
    }
  }

  list(): WorkspaceInfo[] {
    return [...this.#workspaces.values()];
  }

  require(id: string): WorkspaceInfo {
    return this.#require(id);
  }

  add(input: unknown): WorkspaceInfo {
    const request = WorkspacePathInputSchema.parse(input);
    const normalizedPath = requireDirectory(request.path);
    const existing = this.list().find(
      (workspace) => pathKey(workspace.path) === pathKey(normalizedPath),
    );
    if (existing) return existing;
    const workspace = WorkspaceInfoSchema.parse({
      id: randomUUID(),
      name: path.basename(normalizedPath) || normalizedPath,
      path: normalizedPath,
      connected: true,
      kind: "main",
      parentId: null,
      worktree: null,
      settings: { sidebarCollapsed: false },
    });
    this.#workspaces.set(workspace.id, workspace);
    this.#flush();
    return workspace;
  }

  update(input: unknown): WorkspaceInfo {
    const request = WorkspaceUpdateInputSchema.parse(input);
    const current = this.#require(request.id);
    const updated = WorkspaceInfoSchema.parse({
      ...current,
      settings: request.settings,
    });
    this.#workspaces.set(updated.id, updated);
    this.#flush();
    return updated;
  }

  remove(input: unknown): { ok: true } {
    const request = WorkspaceIdInputSchema.parse(input);
    this.#workspaces.delete(request.id);
    this.#flush();
    return { ok: true };
  }

  connect(input: unknown): { ok: true } {
    const request = WorkspaceIdInputSchema.parse(input);
    const current = this.#require(request.id);
    requireDirectory(current.path);
    if (!current.connected) {
      this.#workspaces.set(current.id, { ...current, connected: true });
      this.#flush();
    }
    return { ok: true };
  }

  isDirectory(input: unknown): boolean {
    const request = WorkspacePathInputSchema.parse(input);
    try {
      return path.isAbsolute(request.path) && statSync(request.path).isDirectory();
    } catch {
      return false;
    }
  }

  async pick(ownerWindow: BrowserWindow, input: unknown): Promise<string[]> {
    const request = WorkspacePickInputSchema.parse(input);
    const result = await dialog.showOpenDialog(ownerWindow, {
      title: request.multiple ? "添加项目文件夹" : "选择项目文件夹",
      properties: request.multiple
        ? ["openDirectory", "multiSelections"]
        : ["openDirectory"],
    });
    return result.canceled ? [] : result.filePaths.map((item) => path.normalize(item));
  }

  #require(id: string): WorkspaceInfo {
    const workspace = this.#workspaces.get(id);
    if (!workspace) throw new Error("Electron workspace 不存在");
    return workspace;
  }

  #flush(): void {
    mkdirSync(path.dirname(this.#filePath), { recursive: true });
    const temporaryPath = `${this.#filePath}.${process.pid}.tmp`;
    writeFileSync(
      temporaryPath,
      JSON.stringify({ schemaVersion: 1, workspaces: this.list() }),
      "utf8",
    );
    renameSync(temporaryPath, this.#filePath);
  }
}

function requireDirectory(value: string): string {
  if (!path.isAbsolute(value)) throw new Error("workspace path 必须是绝对路径");
  const normalized = path.normalize(value);
  if (!statSync(normalized).isDirectory()) {
    throw new Error("workspace path 不是目录");
  }
  return normalized;
}

function pathKey(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
