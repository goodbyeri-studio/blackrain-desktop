import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceStore } from "../workspaces/workspace-store";
import { FileService } from "./file-service";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function createFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "blackrain-files-"));
  temporaryRoots.push(root);
  const project = path.join(root, "project");
  mkdirSync(path.join(project, "src"), { recursive: true });
  writeFileSync(path.join(project, "README.md"), "readme", "utf8");
  writeFileSync(path.join(project, "src", "main.ts"), "export {};", "utf8");
  const workspaces = new WorkspaceStore(path.join(root, "state", "workspaces.json"));
  const workspace = workspaces.add({ path: project });
  return { root, project, workspace, service: new FileService(workspaces) };
}

describe("FileService", () => {
  it("列出并读取归属工作区内的普通文件", () => {
    const { service, workspace } = createFixture();

    expect(service.listWorkspace({ workspaceId: workspace.id }).sort()).toEqual([
      "README.md",
      "src/main.ts",
    ]);
    expect(service.readWorkspace({
      workspaceId: workspace.id,
      path: "src/main.ts",
    })).toEqual({ content: "export {};", truncated: false });
  });

  it("拒绝目录穿越和不支持的图片扩展", () => {
    const { root, service, workspace } = createFixture();
    const outside = path.join(root, "outside.txt");
    writeFileSync(outside, "secret", "utf8");

    expect(() => service.readWorkspace({
      workspaceId: workspace.id,
      path: "../outside.txt",
    })).toThrow("文件路径超出工作区");
    expect(() => service.readImage({ path: outside })).toThrow("不支持的图片类型");
  });

  it("最多读取 2 MiB 文本并标记截断", () => {
    const { project, service, workspace } = createFixture();
    writeFileSync(path.join(project, "large.txt"), "x".repeat(2 * 1024 * 1024 + 32));

    const result = service.readWorkspace({
      workspaceId: workspace.id,
      path: "large.txt",
    });
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.content)).toBe(2 * 1024 * 1024);
  });

  it("不列出也不读取工作区内的符号链接", () => {
    const { root, project, service, workspace } = createFixture();
    const outside = path.join(root, "outside.txt");
    const link = path.join(project, "outside-link.txt");
    writeFileSync(outside, "secret", "utf8");

    try {
      symlinkSync(outside, link, "file");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return;
      throw error;
    }

    expect(service.listWorkspace({ workspaceId: workspace.id })).not.toContain(
      "outside-link.txt",
    );
    expect(() => service.readWorkspace({
      workspaceId: workspace.id,
      path: "outside-link.txt",
    })).toThrow("不读取符号链接文件");
  });
});
