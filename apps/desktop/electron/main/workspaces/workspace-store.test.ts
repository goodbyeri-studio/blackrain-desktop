import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceStore } from "./workspace-store";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("WorkspaceStore", () => {
  it("持久化、去重、更新并删除经过校验的目录", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "blackrain-workspaces-"));
    temporaryRoots.push(root);
    const project = path.join(root, "project");
    const stateFile = path.join(root, "state", "workspaces.json");
    mkdirSync(project);

    const store = new WorkspaceStore(stateFile);
    const added = store.add({ path: project });
    expect(added).toEqual(expect.objectContaining({
      name: "project",
      path: project,
      connected: true,
      settings: { sidebarCollapsed: false },
    }));
    expect(store.add({ path: project }).id).toBe(added.id);

    const updated = store.update({
      id: added.id,
      settings: { sidebarCollapsed: true, groupId: null },
    });
    expect(updated.settings.sidebarCollapsed).toBe(true);
    expect(new WorkspaceStore(stateFile).list()).toEqual([updated]);

    expect(store.connect({ id: added.id })).toEqual({ ok: true });
    expect(store.remove({ id: added.id })).toEqual({ ok: true });
    expect(store.list()).toEqual([]);
  });

  it("拒绝相对路径和普通文件", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "blackrain-workspaces-"));
    temporaryRoots.push(root);
    const store = new WorkspaceStore(path.join(root, "workspaces.json"));
    expect(() => store.add({ path: "relative" })).toThrow(/绝对路径/);
    expect(store.isDirectory({ path: path.join(root, "missing") })).toBe(false);
  });
});
