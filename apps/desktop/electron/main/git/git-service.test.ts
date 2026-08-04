import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceStore } from "../workspaces/workspace-store";
import { GitService } from "./git-service";

const temporaryRoots: string[] = [];
const gitExecutable = process.platform === "win32" ? "git.exe" : "git";

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
});

describe("GitService", () => {
  it("在已登记 workspace 内完成 status/diff/log/branch 工作流", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "blackrain-electron-git-"));
    temporaryRoots.push(root);
    const workspaceRoot = path.join(root, "workspace");
    mkdirSync(workspaceRoot);
    const workspaces = new WorkspaceStore(path.join(root, "state", "workspaces.json"));
    const workspace = workspaces.add({ path: workspaceRoot });
    const git = new GitService(workspaces);

    await git.init({ workspaceId: workspace.id, branch: "main", force: true });
    execFileSync(gitExecutable, ["config", "user.email", "test@blackrain.local"], { cwd: workspaceRoot });
    execFileSync(gitExecutable, ["config", "user.name", "BlackRain Test"], { cwd: workspaceRoot });
    writeFileSync(path.join(workspaceRoot, "note.txt"), "first\n", "utf8");
    await git.stageAll({ workspaceId: workspace.id });
    await git.commit({ workspaceId: workspace.id, message: "initial" });
    writeFileSync(path.join(workspaceRoot, "note.txt"), "first\nsecond\n", "utf8");

    const status = await git.status({ workspaceId: workspace.id });
    expect(status.branchName).toBe("main");
    expect(status.unstagedFiles).toEqual([
      expect.objectContaining({ path: "note.txt" }),
    ]);
    expect(await git.diffs({ workspaceId: workspace.id })).toEqual([
      expect.objectContaining({ path: "note.txt", diff: expect.stringContaining("second") }),
    ]);
    expect(await git.log({ workspaceId: workspace.id, limit: 10 })).toMatchObject({
      total: 1,
      entries: [expect.objectContaining({ summary: "initial" })],
    });
    await git.createBranch({ workspaceId: workspace.id, name: "feature/test" });
    expect(await git.branches({ workspaceId: workspace.id })).toEqual({
      branches: expect.arrayContaining([
        { name: "feature/test", isCurrent: true },
      ]),
    });
  }, 30_000);

  it("拒绝绝对路径和越出 workspace 的 Git 文件操作", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "blackrain-electron-git-"));
    temporaryRoots.push(root);
    const workspaceRoot = path.join(root, "workspace");
    mkdirSync(workspaceRoot);
    const workspaces = new WorkspaceStore(path.join(root, "state", "workspaces.json"));
    const workspace = workspaces.add({ path: workspaceRoot });
    const git = new GitService(workspaces);
    await expect(git.stageFile({ workspaceId: workspace.id, path: path.join(workspaceRoot, "file") })).rejects.toThrow("相对路径");
    await expect(git.stageFile({ workspaceId: workspace.id, path: "..\\outside" })).rejects.toThrow("越出 workspace");
  });
});
