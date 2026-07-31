// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlackRainHostApi } from "../../electron/shared/host-api";
import {
  addWorkspace as addWorkspaceTauri,
  listWorkspaces as listWorkspacesTauri,
} from "./tauri";
import {
  addWorkspace,
  listWorkspaces,
  pickWorkspacePath,
} from "./workspaces";

vi.mock("./tauri", () => ({
  addWorkspace: vi.fn(),
  connectWorkspace: vi.fn(),
  isWorkspacePathDir: vi.fn(),
  listWorkspaces: vi.fn(),
  pickWorkspacePath: vi.fn(),
  pickWorkspacePaths: vi.fn(),
  removeWorkspace: vi.fn(),
  updateWorkspaceSettings: vi.fn(),
}));

afterEach(() => {
  delete window.blackrain;
  vi.clearAllMocks();
});

describe("workspace host service", () => {
  it("Electron 下使用 typed workspace API", async () => {
    const workspace = {
      id: "workspace-1",
      name: "repo",
      path: "C:\\repo",
      connected: true,
      kind: "main" as const,
      settings: { sidebarCollapsed: false },
    };
    const host = {
      workspace: {
        list: vi.fn().mockResolvedValue([workspace]),
        add: vi.fn().mockResolvedValue(workspace),
        pick: vi.fn().mockResolvedValue([workspace.path]),
      },
    } as unknown as BlackRainHostApi;
    window.blackrain = host;

    await expect(listWorkspaces()).resolves.toEqual([workspace]);
    await expect(addWorkspace(workspace.path)).resolves.toEqual(workspace);
    await expect(pickWorkspacePath()).resolves.toBe(workspace.path);
    expect(host.workspace.add).toHaveBeenCalledWith({ path: workspace.path });
    expect(host.workspace.pick).toHaveBeenCalledWith({ multiple: false });
  });

  it("Tauri 下保持原调用", async () => {
    const workspace = {
      id: "workspace-t",
      name: "repo",
      path: "C:\\repo",
      connected: true,
      settings: { sidebarCollapsed: false },
    };
    vi.mocked(listWorkspacesTauri).mockResolvedValue([workspace]);
    vi.mocked(addWorkspaceTauri).mockResolvedValue(workspace);
    await expect(listWorkspaces()).resolves.toEqual([workspace]);
    await expect(addWorkspace(workspace.path)).resolves.toEqual(workspace);
    expect(addWorkspaceTauri).toHaveBeenCalledWith(workspace.path);
  });
});
