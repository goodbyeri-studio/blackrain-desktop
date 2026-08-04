import type { WorkspaceInfo, WorkspaceSettings } from "@/types";
import { getOptionalHostClient } from "@/host/client";
import {
  addWorkspace as addWorkspaceDesktop,
  connectWorkspace as connectWorkspaceDesktop,
  isWorkspacePathDir as isWorkspacePathDirDesktop,
  listWorkspaces as listWorkspacesDesktop,
  pickWorkspacePath as pickWorkspacePathDesktop,
  pickWorkspacePaths as pickWorkspacePathsDesktop,
  removeWorkspace as removeWorkspaceDesktop,
  updateWorkspaceSettings as updateWorkspaceSettingsDesktop,
} from "./desktop";

export async function listWorkspaces(): Promise<WorkspaceInfo[]> {
  const host = getOptionalHostClient();
  return host ? host.workspace.list() as Promise<WorkspaceInfo[]> : listWorkspacesDesktop();
}

export async function addWorkspace(path: string): Promise<WorkspaceInfo> {
  const host = getOptionalHostClient();
  return host ? host.workspace.add({ path }) as Promise<WorkspaceInfo> : addWorkspaceDesktop(path);
}

export async function updateWorkspaceSettings(
  id: string,
  settings: WorkspaceSettings,
): Promise<WorkspaceInfo> {
  const host = getOptionalHostClient();
  return host
    ? host.workspace.update({ id, settings }) as Promise<WorkspaceInfo>
    : updateWorkspaceSettingsDesktop(id, settings);
}

export async function removeWorkspace(id: string): Promise<void> {
  const host = getOptionalHostClient();
  if (host) await host.workspace.remove({ id });
  else await removeWorkspaceDesktop(id);
}

export async function connectWorkspace(id: string): Promise<void> {
  const host = getOptionalHostClient();
  if (host) await host.workspace.connect({ id });
  else await connectWorkspaceDesktop(id);
}

export async function isWorkspacePathDir(path: string): Promise<boolean> {
  const host = getOptionalHostClient();
  return host ? host.workspace.isDirectory({ path }) : isWorkspacePathDirDesktop(path);
}

export async function pickWorkspacePath(): Promise<string | null> {
  const host = getOptionalHostClient();
  if (!host) return pickWorkspacePathDesktop();
  return (await host.workspace.pick({ multiple: false }))[0] ?? null;
}

export async function pickWorkspacePaths(): Promise<string[]> {
  const host = getOptionalHostClient();
  return host ? host.workspace.pick({ multiple: true }) : pickWorkspacePathsDesktop();
}
