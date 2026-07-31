import type { WorkspaceInfo, WorkspaceSettings } from "@/types";
import { getOptionalHostClient } from "@/host/client";
import {
  addWorkspace as addWorkspaceTauri,
  connectWorkspace as connectWorkspaceTauri,
  isWorkspacePathDir as isWorkspacePathDirTauri,
  listWorkspaces as listWorkspacesTauri,
  pickWorkspacePath as pickWorkspacePathTauri,
  pickWorkspacePaths as pickWorkspacePathsTauri,
  removeWorkspace as removeWorkspaceTauri,
  updateWorkspaceSettings as updateWorkspaceSettingsTauri,
} from "./tauri";

export async function listWorkspaces(): Promise<WorkspaceInfo[]> {
  const host = getOptionalHostClient();
  return host
    ? host.workspace.list() as Promise<WorkspaceInfo[]>
    : listWorkspacesTauri();
}

export async function addWorkspace(path: string): Promise<WorkspaceInfo> {
  const host = getOptionalHostClient();
  return host
    ? host.workspace.add({ path }) as Promise<WorkspaceInfo>
    : addWorkspaceTauri(path);
}

export async function updateWorkspaceSettings(
  id: string,
  settings: WorkspaceSettings,
): Promise<WorkspaceInfo> {
  const host = getOptionalHostClient();
  return host
    ? host.workspace.update({ id, settings }) as Promise<WorkspaceInfo>
    : updateWorkspaceSettingsTauri(id, settings);
}

export async function removeWorkspace(id: string): Promise<void> {
  const host = getOptionalHostClient();
  if (host) {
    await host.workspace.remove({ id });
    return;
  }
  await removeWorkspaceTauri(id);
}

export async function connectWorkspace(id: string): Promise<void> {
  const host = getOptionalHostClient();
  if (host) {
    await host.workspace.connect({ id });
    return;
  }
  await connectWorkspaceTauri(id);
}

export async function isWorkspacePathDir(path: string): Promise<boolean> {
  const host = getOptionalHostClient();
  return host
    ? host.workspace.isDirectory({ path })
    : isWorkspacePathDirTauri(path);
}

export async function pickWorkspacePath(): Promise<string | null> {
  const host = getOptionalHostClient();
  if (!host) return pickWorkspacePathTauri();
  return (await host.workspace.pick({ multiple: false }))[0] ?? null;
}

export async function pickWorkspacePaths(): Promise<string[]> {
  const host = getOptionalHostClient();
  return host
    ? host.workspace.pick({ multiple: true })
    : pickWorkspacePathsTauri();
}
