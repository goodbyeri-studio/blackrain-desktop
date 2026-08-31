import { getOptionalHostClient } from "../host/client";
import {
  pickDirectories,
  pickFiles,
  pickImages,
  revealPath,
  saveTextFile,
} from "../host/desktop";
import type {
  AppSettings,
  CodexUpdateResult,
  CodexDoctorResult,
  DictationModelStatus,
  DictationSessionState,
  LocalUsageSnapshot,
  ModelGatewayModelConfig,
  ModelGatewayProviderConfig,
  ModelGatewayProviderSecretStatus,
  ModelGatewayRuntimeStatus,
  TcpDaemonStatus,
  TailscaleDaemonCommandPreview,
  TailscaleStatus,
  TrayRecentThreadEntry,
  TraySessionUsage,
  WorkspaceInfo,
  AppMention,
  WorkspaceSettings,
} from "../types";
import type {
  GitFileDiff,
  GitFileStatus,
  GitCommitDiff,
  GitHubIssuesResponse,
  GitHubPullRequestComment,
  GitHubPullRequestDiff,
  GitHubPullRequestsResponse,
  GitLogResponse,
  ReviewTarget,
} from "../types";

function isMissingDesktopCapabilityError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("Desktop capability unavailable")
  );
}

function unavailableCapability<T>(capability: string, ..._details: unknown[]): Promise<T> {
  return Promise.reject(new Error(`Desktop capability unavailable: ${capability}`));
}

export async function pickWorkspacePath(): Promise<string | null> {
  return (await pickDirectories({ multiple: false }))[0] ?? null;
}

export async function pickWorkspacePaths(): Promise<string[]> {
  return pickDirectories({ multiple: true });
}

export async function pickImageFiles(): Promise<string[]> {
  return pickImages({ multiple: true });
}

export async function pickWorkProjectFiles(projectPath: string): Promise<string[]> {
  return pickFiles({
    multiple: true,
    defaultPath: projectPath,
  });
}

export async function exportMarkdownFile(
  content: string,
  defaultFileName = "plan.md",
): Promise<string | null> {
  return saveTextFile(content, defaultFileName);
}

export async function listWorkspaces(): Promise<WorkspaceInfo[]> {
  const host = getOptionalHostClient();
  if (host) return host.workspace.list();
  try {
    return await unavailableCapability<WorkspaceInfo[]>("listWorkspaces");
  } catch (error) {
    if (isMissingDesktopCapabilityError(error)) {
      // Preview/test hosts may intentionally omit workspace persistence.
      console.warn("Desktop workspace capability unavailable; returning an empty list.");
      return [];
    }
    throw error;
  }
}

export async function getCodexConfigPath(): Promise<string> {
  return unavailableCapability<string>("getCodexConfigPath");
}

export type TextFileResponse = {
  exists: boolean;
  content: string;
  truncated: boolean;
};

export type GlobalAgentsResponse = TextFileResponse;
export type GlobalCodexConfigResponse = TextFileResponse;
export type AgentMdResponse = TextFileResponse;
export type AgentSummary = {
  name: string;
  description: string | null;
  developerInstructions: string | null;
  configFile: string;
  resolvedPath: string;
  managedByApp: boolean;
  fileExists: boolean;
};

export type AgentsSettings = {
  configPath: string;
  multiAgentEnabled: boolean;
  maxThreads: number;
  maxDepth: number;
  agents: AgentSummary[];
};

export type SetAgentsCoreInput = {
  multiAgentEnabled: boolean;
  maxThreads: number;
  maxDepth: number;
};

export type CreateAgentInput = {
  name: string;
  description?: string | null;
  developerInstructions?: string | null;
  template?: "blank" | string | null;
  model?: string | null;
  reasoningEffort?: string | null;
};

export type UpdateAgentInput = {
  originalName: string;
  name: string;
  description?: string | null;
  developerInstructions?: string | null;
  renameManagedFile?: boolean;
};

export type DeleteAgentInput = {
  name: string;
  deleteManagedFile?: boolean;
};

type FileScope = "workspace" | "global";
type FileKind = "agents" | "config";

async function fileRead(
  scope: FileScope,
  kind: FileKind,
  workspaceId?: string,
): Promise<TextFileResponse> {
  const host = getOptionalHostClient();
  if (host && scope === "workspace" && workspaceId) {
    const path = kind === "agents" ? "AGENTS.md" : ".codex/config.toml";
    return host.files.readWorkspace({ workspaceId, path });
  }
  return unavailableCapability<TextFileResponse>("fileRead", { scope, kind, workspaceId });
}

async function fileWrite(
  scope: FileScope,
  kind: FileKind,
  content: string,
  workspaceId?: string,
): Promise<void> {
  const host = getOptionalHostClient();
  if (host && scope === "workspace" && workspaceId) {
    const path = kind === "agents" ? "AGENTS.md" : ".codex/config.toml";
    return host.files.writeWorkspace({ workspaceId, path, content });
  }
  return unavailableCapability("fileWrite", { scope, kind, workspaceId, content });
}

export async function readImageAsDataUrl(path: string): Promise<string> {
  const host = getOptionalHostClient();
  if (host) return host.files.readImage({ path });
  return unavailableCapability<string>("readImageAsDataUrl", { path });
}

export async function readGlobalAgentsMd(): Promise<GlobalAgentsResponse> {
  return fileRead("global", "agents");
}

export async function writeGlobalAgentsMd(content: string): Promise<void> {
  return fileWrite("global", "agents", content);
}

export async function readGlobalCodexConfigToml(): Promise<GlobalCodexConfigResponse> {
  return fileRead("global", "config");
}

export async function writeGlobalCodexConfigToml(content: string): Promise<void> {
  return fileWrite("global", "config", content);
}

export async function getAgentsSettings(): Promise<AgentsSettings> {
  return unavailableCapability<AgentsSettings>("getAgentsSettings");
}

export async function setAgentsCoreSettings(
  input: SetAgentsCoreInput,
): Promise<AgentsSettings> {
  return unavailableCapability<AgentsSettings>("setAgentsCoreSettings", { input });
}

export async function createAgent(input: CreateAgentInput): Promise<AgentsSettings> {
  return unavailableCapability<AgentsSettings>("createAgent", { input });
}

export async function updateAgent(input: UpdateAgentInput): Promise<AgentsSettings> {
  return unavailableCapability<AgentsSettings>("updateAgent", { input });
}

export async function deleteAgent(input: DeleteAgentInput): Promise<AgentsSettings> {
  return unavailableCapability<AgentsSettings>("deleteAgent", { input });
}

export async function readAgentConfigToml(agentName: string): Promise<string> {
  return unavailableCapability<string>("readAgentConfigToml", { agentName });
}

export async function writeAgentConfigToml(
  agentName: string,
  content: string,
): Promise<void> {
  return unavailableCapability("writeAgentConfigToml", { agentName, content });
}

export async function getConfigModel(workspaceId: string): Promise<string | null> {
  const host = getOptionalHostClient();
  const response = host
    ? await host.agent.readConfig({ workspaceId })
    : await unavailableCapability<{ model?: string | null }>("getConfigModel", { workspaceId });
  const hostConfig = host && "config" in response ? response.config : undefined;
  const config = hostConfig && typeof hostConfig === "object"
    ? hostConfig as Record<string, unknown>
    : response;
  const model = config?.model;
  if (typeof model !== "string") {
    return null;
  }
  const trimmed = model.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function addWorkspace(path: string): Promise<WorkspaceInfo> {
  const host = getOptionalHostClient();
  if (host) return host.workspace.add({ path });
  return unavailableCapability<WorkspaceInfo>("addWorkspace", { path });
}

export async function addWorkspaceFromGitUrl(
  url: string,
  destinationPath: string,
  targetFolderName: string | null,
): Promise<WorkspaceInfo> {
  return unavailableCapability<WorkspaceInfo>("addWorkspaceFromGitUrl", {
    url,
    destinationPath,
    targetFolderName,
  });
}

export async function isWorkspacePathDir(path: string): Promise<boolean> {
  const host = getOptionalHostClient();
  if (host) return host.workspace.isDirectory({ path });
  return unavailableCapability<boolean>("isWorkspacePathDir", { path });
}

export async function addClone(
  sourceWorkspaceId: string,
  copiesFolder: string,
  copyName: string,
): Promise<WorkspaceInfo> {
  return unavailableCapability<WorkspaceInfo>("addClone", {
    sourceWorkspaceId,
    copiesFolder,
    copyName,
  });
}

export async function addWorktree(
  parentId: string,
  branch: string,
  name: string | null,
  copyAgentsMd = true,
): Promise<WorkspaceInfo> {
  return unavailableCapability<WorkspaceInfo>("addWorktree", { parentId, branch, name, copyAgentsMd });
}

export type WorktreeSetupStatus = {
  shouldRun: boolean;
  script: string | null;
};

export async function getWorktreeSetupStatus(
  workspaceId: string,
): Promise<WorktreeSetupStatus> {
  return unavailableCapability<WorktreeSetupStatus>("worktreeSetupStatus", { workspaceId });
}

export async function markWorktreeSetupRan(workspaceId: string): Promise<void> {
  return unavailableCapability("worktreeSetupMarkRan", { workspaceId });
}

export async function updateWorkspaceSettings(
  id: string,
  settings: WorkspaceSettings,
): Promise<WorkspaceInfo> {
  const host = getOptionalHostClient();
  if (host) return host.workspace.update({ id, settings });
  return unavailableCapability<WorkspaceInfo>("updateWorkspaceSettings", { id, settings });
}

export async function removeWorkspace(id: string): Promise<void> {
  const host = getOptionalHostClient();
  if (host?.terminal) {
    await host.workspace.remove({ id });
    return;
  }
  return unavailableCapability("removeWorkspace", { id });
}

export async function removeWorktree(id: string): Promise<void> {
  return unavailableCapability("removeWorktree", { id });
}

export async function renameWorktree(
  id: string,
  branch: string,
): Promise<WorkspaceInfo> {
  return unavailableCapability<WorkspaceInfo>("renameWorktree", { id, branch });
}

export async function renameWorktreeUpstream(
  id: string,
  oldBranch: string,
  newBranch: string,
): Promise<void> {
  return unavailableCapability("renameWorktreeUpstream", { id, oldBranch, newBranch });
}

export async function applyWorktreeChanges(workspaceId: string): Promise<void> {
  return unavailableCapability("applyWorktreeChanges", { workspaceId });
}

export async function openWorkspaceIn(
  path: string,
  options: {
    appName?: string | null;
    command?: string | null;
    args?: string[];
    line?: number | null;
    column?: number | null;
  },
): Promise<void> {
  return unavailableCapability("openWorkspaceIn", {
    path,
    app: options.appName ?? null,
    command: options.command ?? null,
    args: options.args ?? [],
    line: options.line ?? null,
    column: options.column ?? null,
  });
}

export async function revealPathInFileManager(path: string): Promise<void> {
  await revealPath(path);
}

export async function getOpenAppIcon(appName: string): Promise<string | null> {
  return unavailableCapability<string | null>("getOpenAppIcon", { appName });
}

export async function connectWorkspace(id: string): Promise<void> {
  const host = getOptionalHostClient();
  if (host) {
    await host.workspace.connect({ id });
    return;
  }
  return unavailableCapability("connectWorkspace", { id });
}

export async function setWorkspaceRuntimeCodexArgs(
  workspaceId: string,
  codexArgs: string | null,
): Promise<{ appliedCodexArgs: string | null; respawned: boolean }> {
  return unavailableCapability("setWorkspaceRuntimeCodexArgs", {
    workspaceId,
    codexArgs,
  });
}

export async function startThread(workspaceId: string) {
  return unavailableCapability<any>("startThread", { workspaceId });
}

export async function forkThread(workspaceId: string, threadId: string) {
  const host = getOptionalHostClient();
  if (host) return host.agent.forkThread({ workspaceId, threadId });
  return unavailableCapability<any>("forkThread", { workspaceId, threadId });
}

export async function compactThread(workspaceId: string, threadId: string) {
  const host = getOptionalHostClient();
  if (host) return host.agent.compactThread({ workspaceId, threadId });
  return unavailableCapability<any>("compactThread", { workspaceId, threadId });
}

function isInlineImageUrl(image: string) {
  return (
    image.startsWith("data:") ||
    image.startsWith("http://") ||
    image.startsWith("https://")
  );
}

async function convertImagesToDataUrls(images: string[]): Promise<string[]> {
  return Promise.all(
    images.map(async (image) => {
      if (isInlineImageUrl(image)) {
        return image;
      }
      return readImageAsDataUrl(image);
    }),
  );
}

async function normalizeImagesForRpc(images?: string[]): Promise<string[] | null> {
  if (images == null) {
    return null;
  }
  if (images.length === 0) {
    return [];
  }
  const hasPathImages = images.some((image) => !isInlineImageUrl(image));
  if (!hasPathImages) {
    return images;
  }
  let settings: AppSettings;
  let mobileRuntime: boolean;
  try {
    [settings, mobileRuntime] = await Promise.all([getAppSettings(), isMobileRuntime()]);
  } catch (error) {
    if (isMissingDesktopCapabilityError(error)) {
      return images;
    }
    throw error;
  }
  if (settings.backendMode !== "remote" && !mobileRuntime) {
    return images;
  }
  return convertImagesToDataUrls(images);
}

export async function sendUserMessage(
  workspaceId: string,
  threadId: string,
  text: string,
  options?: {
    model?: string | null;
    effort?: string | null;
    serviceTier?: "fast" | "flex" | null | undefined;
    accessMode?: "read-only" | "current" | "full-access";
    images?: string[];
    collaborationMode?: Record<string, unknown> | null;
    appMentions?: AppMention[];
  },
) {
  const images = await normalizeImagesForRpc(options?.images);
  const payload: Record<string, unknown> = {
    workspaceId,
    threadId,
    text,
    model: options?.model ?? null,
    effort: options?.effort ?? null,
    accessMode: options?.accessMode ?? null,
    images,
  };
  if (options?.serviceTier !== undefined) {
    payload.serviceTier = options.serviceTier;
  }
  if (options?.collaborationMode) {
    payload.collaborationMode = options.collaborationMode;
  }
  if (options?.appMentions && options.appMentions.length > 0) {
    payload.appMentions = options.appMentions;
  }
  return unavailableCapability("sendUserMessage", payload);
}

export async function interruptTurn(
  workspaceId: string,
  threadId: string,
  turnId: string,
) {
  return unavailableCapability("turnInterrupt", { workspaceId, threadId, turnId });
}

export async function steerTurn(
  workspaceId: string,
  threadId: string,
  turnId: string,
  text: string,
  images?: string[],
  appMentions?: AppMention[],
) {
  const normalizedImages = await normalizeImagesForRpc(images);
  const payload: Record<string, unknown> = {
    workspaceId,
    threadId,
    turnId,
    text,
    images: normalizedImages,
  };
  if (appMentions && appMentions.length > 0) {
    payload.appMentions = appMentions;
  }
  return unavailableCapability("turnSteer", payload);
}

export async function startReview(
  workspaceId: string,
  threadId: string,
  target: ReviewTarget,
  delivery?: "inline" | "detached",
) {
  const host = getOptionalHostClient();
  if (host) {
    const normalizedTarget = target.type === "commit"
      ? { ...target, title: target.title ?? null }
      : target;
    return host.agent.startReview({
      workspaceId,
      threadId,
      target: normalizedTarget,
      delivery: delivery ?? null,
    });
  }
  const payload: Record<string, unknown> = { workspaceId, threadId, target };
  if (delivery) {
    payload.delivery = delivery;
  }
  return unavailableCapability("startReview", payload);
}

export async function respondToServerRequest(
  workspaceId: string,
  requestId: number | string,
  decision: "accept" | "decline",
) {
  const host = getOptionalHostClient();
  if (host) {
    return host.agent.respondToServerRequest({
      workspaceId,
      requestId,
      result: { decision },
    });
  }
  return unavailableCapability("respondToServerRequest", {
    workspaceId,
    requestId,
    result: { decision },
  });
}

export async function respondToUserInputRequest(
  workspaceId: string,
  requestId: number | string,
  answers: Record<string, { answers: string[] }>,
) {
  const host = getOptionalHostClient();
  if (host) {
    return host.agent.respondToServerRequest({
      workspaceId,
      requestId,
      result: { answers },
    });
  }
  return unavailableCapability("respondToServerRequest", {
    workspaceId,
    requestId,
    result: { answers },
  });
}

export async function rememberApprovalRule(
  workspaceId: string,
  command: string[],
) {
  return unavailableCapability("rememberApprovalRule", { workspaceId, command });
}

export async function getGitStatus(workspace_id: string): Promise<{
  branchName: string;
  files: GitFileStatus[];
  stagedFiles: GitFileStatus[];
  unstagedFiles: GitFileStatus[];
  totalAdditions: number;
  totalDeletions: number;
}> {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.status({ workspaceId: workspace_id }) as Promise<{
    branchName: string;
    files: GitFileStatus[];
    stagedFiles: GitFileStatus[];
    unstagedFiles: GitFileStatus[];
    totalAdditions: number;
    totalDeletions: number;
  }>;
  return unavailableCapability("getGitStatus", { workspaceId: workspace_id });
}

export type InitGitRepoResponse =
  | { status: "initialized"; commitError?: string }
  | { status: "already_initialized" }
  | { status: "needs_confirmation"; entryCount: number };

export async function initGitRepo(
  workspaceId: string,
  branch: string,
  force = false,
): Promise<InitGitRepoResponse> {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.init({ workspaceId, branch, force }) as Promise<InitGitRepoResponse>;
  return unavailableCapability<InitGitRepoResponse>("initGitRepo", { workspaceId, branch, force });
}

export type CreateGitHubRepoResponse =
  | { status: "ok"; repo: string; remoteUrl?: string | null }
  | {
      status: "partial";
      repo: string;
      remoteUrl?: string | null;
      pushError?: string | null;
      defaultBranchError?: string | null;
    };

export async function createGitHubRepo(
  workspaceId: string,
  repo: string,
  visibility: "private" | "public",
  branch?: string | null,
): Promise<CreateGitHubRepoResponse> {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.createRepository({ workspaceId, repo, visibility, branch }) as Promise<CreateGitHubRepoResponse>;
  return unavailableCapability<CreateGitHubRepoResponse>("createGithubRepo", {
    workspaceId,
    repo,
    visibility,
    branch,
  });
}

export async function listGitRoots(
  workspace_id: string,
  depth: number,
): Promise<string[]> {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.roots({ workspaceId: workspace_id, depth });
  return unavailableCapability("listGitRoots", { workspaceId: workspace_id, depth });
}

export async function getGitDiffs(
  workspace_id: string,
): Promise<GitFileDiff[]> {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.diffs({ workspaceId: workspace_id }) as Promise<GitFileDiff[]>;
  return unavailableCapability("getGitDiffs", { workspaceId: workspace_id });
}

export async function getGitLog(
  workspace_id: string,
  limit = 40,
): Promise<GitLogResponse> {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.log({ workspaceId: workspace_id, limit }) as Promise<GitLogResponse>;
  return unavailableCapability("getGitLog", { workspaceId: workspace_id, limit });
}

export async function getGitCommitDiff(
  workspace_id: string,
  sha: string,
): Promise<GitCommitDiff[]> {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.commitDiff({ workspaceId: workspace_id, sha }) as Promise<GitCommitDiff[]>;
  return unavailableCapability("getGitCommitDiff", { workspaceId: workspace_id, sha });
}

export async function getGitRemote(workspace_id: string): Promise<string | null> {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.remote({ workspaceId: workspace_id });
  return unavailableCapability("getGitRemote", { workspaceId: workspace_id });
}

export async function stageGitFile(workspaceId: string, path: string) {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.stageFile({ workspaceId, path });
  return unavailableCapability("stageGitFile", { workspaceId, path });
}

export async function stageGitAll(workspaceId: string): Promise<void> {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.stageAll({ workspaceId });
  return unavailableCapability("stageGitAll", { workspaceId });
}

export async function unstageGitFile(workspaceId: string, path: string) {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.unstageFile({ workspaceId, path });
  return unavailableCapability("unstageGitFile", { workspaceId, path });
}

export async function revertGitFile(workspaceId: string, path: string) {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.revertFile({ workspaceId, path });
  return unavailableCapability("revertGitFile", { workspaceId, path });
}

export async function revertGitAll(workspaceId: string) {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.revertAll({ workspaceId });
  return unavailableCapability("revertGitAll", { workspaceId });
}

export async function commitGit(
  workspaceId: string,
  message: string,
): Promise<void> {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.commit({ workspaceId, message });
  return unavailableCapability("commitGit", { workspaceId, message });
}

export async function pushGit(workspaceId: string): Promise<void> {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.push({ workspaceId });
  return unavailableCapability("pushGit", { workspaceId });
}

export async function pullGit(workspaceId: string): Promise<void> {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.pull({ workspaceId });
  return unavailableCapability("pullGit", { workspaceId });
}

export async function fetchGit(workspaceId: string): Promise<void> {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.fetch({ workspaceId });
  return unavailableCapability("fetchGit", { workspaceId });
}

export async function syncGit(workspaceId: string): Promise<void> {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.sync({ workspaceId });
  return unavailableCapability("syncGit", { workspaceId });
}

export async function getGitHubIssues(
  workspace_id: string,
): Promise<GitHubIssuesResponse> {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.issues({ workspaceId: workspace_id }) as Promise<GitHubIssuesResponse>;
  return unavailableCapability("getGithubIssues", { workspaceId: workspace_id });
}

export async function getGitHubPullRequests(
  workspace_id: string,
): Promise<GitHubPullRequestsResponse> {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.pullRequests({ workspaceId: workspace_id }) as Promise<GitHubPullRequestsResponse>;
  return unavailableCapability("getGithubPullRequests", { workspaceId: workspace_id });
}

export async function getGitHubPullRequestDiff(
  workspace_id: string,
  prNumber: number,
): Promise<GitHubPullRequestDiff[]> {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.pullRequestDiff({ workspaceId: workspace_id, prNumber }) as Promise<GitHubPullRequestDiff[]>;
  return unavailableCapability("getGithubPullRequestDiff", {
    workspaceId: workspace_id,
    prNumber,
  });
}

export async function getGitHubPullRequestComments(
  workspace_id: string,
  prNumber: number,
): Promise<GitHubPullRequestComment[]> {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.pullRequestComments({ workspaceId: workspace_id, prNumber }) as Promise<GitHubPullRequestComment[]>;
  return unavailableCapability("getGithubPullRequestComments", {
    workspaceId: workspace_id,
    prNumber,
  });
}

export async function checkoutGitHubPullRequest(
  workspace_id: string,
  prNumber: number,
): Promise<void> {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.checkoutPullRequest({ workspaceId: workspace_id, prNumber });
  return unavailableCapability("checkoutGithubPullRequest", {
    workspaceId: workspace_id,
    prNumber,
  });
}

export async function localUsageSnapshot(
  days?: number,
  workspacePath?: string | null,
): Promise<LocalUsageSnapshot> {
  const payload: { days: number; workspacePath?: string } = { days: days ?? 30 };
  if (workspacePath) {
    payload.workspacePath = workspacePath;
  }
  return unavailableCapability("localUsageSnapshot", payload);
}

export async function getModelList(workspaceId: string) {
  const host = getOptionalHostClient();
  if (host) return host.agent.listModels({ workspaceId });
  return unavailableCapability<any>("modelList", { workspaceId });
}

export async function getExperimentalFeatureList(
  workspaceId: string,
  cursor?: string | null,
  limit?: number | null,
) {
  const host = getOptionalHostClient();
  if (host) {
    return host.agent.listExperimentalFeatures({ workspaceId, cursor, limit });
  }
  return unavailableCapability<any>("experimentalFeatureList", { workspaceId, cursor, limit });
}

export async function setCodexFeatureFlag(
  workspaceId: string,
  featureKey: string,
  enabled: boolean,
): Promise<void> {
  const host = getOptionalHostClient();
  if (host) {
    await host.agent.setExperimentalFeature({ workspaceId, featureKey, enabled });
    return;
  }
  return unavailableCapability("setCodexFeatureFlag", { workspaceId, featureKey, enabled });
}

export async function generateRunMetadata(workspaceId: string, prompt: string) {
  return unavailableCapability<{ title: string; worktreeName: string }>("generateRunMetadata", {
    workspaceId,
    prompt,
  });
}

export async function getCollaborationModes(workspaceId: string) {
  const host = getOptionalHostClient();
  if (host) return host.agent.listCollaborationModes({ workspaceId });
  return unavailableCapability<any>("collaborationModeList", { workspaceId });
}

export async function getAccountRateLimits(workspaceId: string) {
  const host = getOptionalHostClient();
  if (host) return host.agent.readAccountRateLimits({ workspaceId });
  return unavailableCapability<any>("accountRateLimits", { workspaceId });
}

export async function getAccountInfo(workspaceId: string) {
  const host = getOptionalHostClient();
  if (host) return host.agent.readAccount({ workspaceId });
  return unavailableCapability<any>("accountRead", { workspaceId });
}

export async function runCodexLogin(workspaceId: string) {
  const host = getOptionalHostClient();
  if (host) return host.agent.startAccountLogin({ workspaceId });
  return unavailableCapability<{ loginId: string; authUrl: string; raw?: unknown }>("codexLogin", {
    workspaceId,
  });
}

export async function cancelCodexLogin(workspaceId: string) {
  const host = getOptionalHostClient();
  if (host) return host.agent.cancelAccountLogin({ workspaceId });
  return unavailableCapability<{ canceled: boolean; status?: string; raw?: unknown }>("codexLoginCancel",
    { workspaceId },
  );
}

export async function getSkillsList(workspaceId: string) {
  const host = getOptionalHostClient();
  if (host) return host.agent.listSkills({ workspaceId });
  return unavailableCapability<any>("skillsList", { workspaceId });
}

export async function getAppsList(
  workspaceId: string,
  cursor?: string | null,
  limit?: number | null,
  threadId?: string | null,
) {
  const host = getOptionalHostClient();
  if (host) {
    return host.agent.listApps({ workspaceId, cursor, limit, threadId });
  }
  return unavailableCapability<any>("appsList", { workspaceId, cursor, limit, threadId });
}

export async function getPromptsList(workspaceId: string) {
  return unavailableCapability<any>("promptsList", { workspaceId });
}

export async function getWorkspacePromptsDir(workspaceId: string) {
  return unavailableCapability<string>("promptsWorkspaceDir", { workspaceId });
}

export async function getGlobalPromptsDir(workspaceId: string) {
  return unavailableCapability<string>("promptsGlobalDir", { workspaceId });
}

export async function createPrompt(
  workspaceId: string,
  data: {
    scope: "workspace" | "global";
    name: string;
    description?: string | null;
    argumentHint?: string | null;
    content: string;
  },
) {
  return unavailableCapability<any>("promptsCreate", {
    workspaceId,
    scope: data.scope,
    name: data.name,
    description: data.description ?? null,
    argumentHint: data.argumentHint ?? null,
    content: data.content,
  });
}

export async function updatePrompt(
  workspaceId: string,
  data: {
    path: string;
    name: string;
    description?: string | null;
    argumentHint?: string | null;
    content: string;
  },
) {
  return unavailableCapability<any>("promptsUpdate", {
    workspaceId,
    path: data.path,
    name: data.name,
    description: data.description ?? null,
    argumentHint: data.argumentHint ?? null,
    content: data.content,
  });
}

export async function deletePrompt(workspaceId: string, path: string) {
  return unavailableCapability<any>("promptsDelete", { workspaceId, path });
}

export async function movePrompt(
  workspaceId: string,
  data: { path: string; scope: "workspace" | "global" },
) {
  return unavailableCapability<any>("promptsMove", {
    workspaceId,
    path: data.path,
    scope: data.scope,
  });
}

export async function getAppSettings(): Promise<AppSettings> {
  const host = getOptionalHostClient();
  if (host) return host.settings.get() as Promise<AppSettings>;
  return unavailableCapability<AppSettings>("getAppSettings");
}

export async function isMobileRuntime(): Promise<boolean> {
  if (getOptionalHostClient()) return false;
  return unavailableCapability<boolean>("isMobileRuntime");
}

export async function updateAppSettings(settings: AppSettings): Promise<AppSettings> {
  const host = getOptionalHostClient();
  if (host) {
    return host.settings.update({ settings }) as Promise<AppSettings>;
  }
  return unavailableCapability<AppSettings>("updateAppSettings", { settings });
}

export type ModelGatewayProviderProbeInput = Pick<
  ModelGatewayProviderConfig,
  "id" | "name" | "baseUrl" | "apiKeyEnv"
>;

export type ModelGatewayProviderProbeResult = {
  ok: boolean;
  status: number | null;
  message: string;
  modelCount: number;
  models: ModelGatewayModelConfig[];
};

export async function testModelGatewayProvider(
  input: ModelGatewayProviderProbeInput,
): Promise<ModelGatewayProviderProbeResult> {
  return unavailableCapability<ModelGatewayProviderProbeResult>("modelGatewayTestProvider", {
    input,
  });
}

export async function refreshModelGatewayProviderModels(
  input: ModelGatewayProviderProbeInput,
): Promise<ModelGatewayModelConfig[]> {
  return unavailableCapability<ModelGatewayModelConfig[]>("modelGatewayRefreshModels", {
    input,
  });
}

export async function modelGatewayProviderSecretStatus(
  providerId: string,
): Promise<ModelGatewayProviderSecretStatus> {
  return unavailableCapability<ModelGatewayProviderSecretStatus>("modelGatewayProviderSecretStatus",
    { providerId },
  );
}

export async function modelGatewayProviderSecretSet(
  providerId: string,
  apiKey: string,
): Promise<ModelGatewayProviderSecretStatus> {
  return unavailableCapability<ModelGatewayProviderSecretStatus>("modelGatewayProviderSecretSet", {
    providerId,
    apiKey,
  });
}

export async function modelGatewayProviderSecretClear(
  providerId: string,
): Promise<ModelGatewayProviderSecretStatus> {
  return unavailableCapability<ModelGatewayProviderSecretStatus>("modelGatewayProviderSecretClear",
    { providerId },
  );
}

export async function modelGatewayDaemonStart(): Promise<ModelGatewayRuntimeStatus> {
  return unavailableCapability<ModelGatewayRuntimeStatus>("modelGatewayDaemonStart");
}

export async function modelGatewayDaemonStop(): Promise<ModelGatewayRuntimeStatus> {
  return unavailableCapability<ModelGatewayRuntimeStatus>("modelGatewayDaemonStop");
}

export async function modelGatewayDaemonStatus(): Promise<ModelGatewayRuntimeStatus> {
  return unavailableCapability<ModelGatewayRuntimeStatus>("modelGatewayDaemonStatus");
}

// credit 模式：写当前 Supabase JWT 到网关读取的文件。token 刷新时重写即可，无需重启网关。
export async function modelGatewayCreditJwtSet(jwt: string): Promise<void> {
  await unavailableCapability("modelGatewayCreditJwtSet", { jwt });
}

// 登出/会话失效：清 JWT 文件，回退 dev/BYOK 模式。
export async function modelGatewayCreditJwtClear(): Promise<void> {
  await unavailableCapability("modelGatewayCreditJwtClear");
}

// 重启网关：模式切换（credit↔dev/BYOK，base_url 变化）必须重起进程才生效。
export async function modelGatewayDaemonRestart(): Promise<ModelGatewayRuntimeStatus> {
  return unavailableCapability<ModelGatewayRuntimeStatus>("modelGatewayDaemonRestart");
}

export async function tailscaleStatus(): Promise<TailscaleStatus> {
  return unavailableCapability<TailscaleStatus>("tailscaleStatus");
}

export async function tailscaleDaemonCommandPreview(): Promise<TailscaleDaemonCommandPreview> {
  return unavailableCapability<TailscaleDaemonCommandPreview>("tailscaleDaemonCommandPreview");
}

export async function tailscaleDaemonStart(): Promise<TcpDaemonStatus> {
  return unavailableCapability<TcpDaemonStatus>("tailscaleDaemonStart");
}

export async function tailscaleDaemonStop(): Promise<TcpDaemonStatus> {
  return unavailableCapability<TcpDaemonStatus>("tailscaleDaemonStop");
}

export async function tailscaleDaemonStatus(): Promise<TcpDaemonStatus> {
  return unavailableCapability<TcpDaemonStatus>("tailscaleDaemonStatus");
}

type MenuAcceleratorUpdate = {
  id: string;
  accelerator: string | null;
};

export async function setMenuAccelerators(
  updates: MenuAcceleratorUpdate[],
): Promise<void> {
  const host = getOptionalHostClient();
  if (host?.menu.setAccelerators) return host.menu.setAccelerators(updates);
  return unavailableCapability("menuSetAccelerators", { updates });
}

export async function runCodexDoctor(
  codexBin: string | null,
  codexArgs: string | null,
): Promise<CodexDoctorResult> {
  return unavailableCapability<CodexDoctorResult>("codexDoctor", { codexBin, codexArgs });
}

export async function runCodexUpdate(
  codexBin: string | null,
  codexArgs: string | null,
): Promise<CodexUpdateResult> {
  return unavailableCapability<CodexUpdateResult>("codexUpdate", { codexBin, codexArgs });
}

export async function getWorkspaceFiles(workspaceId: string) {
  const host = getOptionalHostClient();
  if (host) return host.files.listWorkspace({ workspaceId });
  return unavailableCapability<string[]>("listWorkspaceFiles", { workspaceId });
}

export async function readWorkspaceFile(
  workspaceId: string,
  path: string,
): Promise<{ content: string; truncated: boolean }> {
  const host = getOptionalHostClient();
  if (host) return host.files.readWorkspace({ workspaceId, path });
  return unavailableCapability<{ content: string; truncated: boolean }>("readWorkspaceFile", {
    workspaceId,
    path,
  });
}

export async function readAgentMd(workspaceId: string): Promise<AgentMdResponse> {
  return fileRead("workspace", "agents", workspaceId);
}

export async function writeAgentMd(workspaceId: string, content: string): Promise<void> {
  return fileWrite("workspace", "agents", content, workspaceId);
}

export async function listGitBranches(workspaceId: string) {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.branches({ workspaceId });
  return unavailableCapability<any>("listGitBranches", { workspaceId });
}

export async function checkoutGitBranch(workspaceId: string, name: string) {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.checkoutBranch({ workspaceId, name });
  return unavailableCapability("checkoutGitBranch", { workspaceId, name });
}

export async function createGitBranch(workspaceId: string, name: string) {
  const host = getOptionalHostClient();
  if (host?.git) return host.git.createBranch({ workspaceId, name });
  return unavailableCapability("createGitBranch", { workspaceId, name });
}

function withModelId(modelId?: string | null) {
  return modelId ? { modelId } : {};
}

export async function getDictationModelStatus(
  modelId?: string | null,
): Promise<DictationModelStatus> {
  return unavailableCapability<DictationModelStatus>("dictationModelStatus",
    withModelId(modelId),
  );
}

export async function downloadDictationModel(
  modelId?: string | null,
): Promise<DictationModelStatus> {
  return unavailableCapability<DictationModelStatus>("dictationDownloadModel",
    withModelId(modelId),
  );
}

export async function cancelDictationDownload(
  modelId?: string | null,
): Promise<DictationModelStatus> {
  return unavailableCapability<DictationModelStatus>("dictationCancelDownload",
    withModelId(modelId),
  );
}

export async function removeDictationModel(
  modelId?: string | null,
): Promise<DictationModelStatus> {
  return unavailableCapability<DictationModelStatus>("dictationRemoveModel",
    withModelId(modelId),
  );
}

export async function startDictation(
  preferredLanguage: string | null,
): Promise<DictationSessionState> {
  return unavailableCapability("dictationStart", { preferredLanguage });
}

export async function requestDictationPermission(): Promise<boolean> {
  return unavailableCapability("dictationRequestPermission");
}

export async function stopDictation(): Promise<DictationSessionState> {
  return unavailableCapability("dictationStop");
}

export async function cancelDictation(): Promise<DictationSessionState> {
  return unavailableCapability("dictationCancel");
}

export async function openTerminalSession(
  workspaceId: string,
  terminalId: string,
  cols: number,
  rows: number,
): Promise<{ id: string }> {
  const host = getOptionalHostClient();
  if (host) {
    await host.terminal.open({ workspaceId, terminalId, cols, rows });
    return { id: terminalId };
  }
  return unavailableCapability("terminalOpen", { workspaceId, terminalId, cols, rows });
}

export async function writeTerminalSession(
  workspaceId: string,
  terminalId: string,
  data: string,
): Promise<void> {
  const host = getOptionalHostClient();
  if (host?.terminal) return host.terminal.write({ workspaceId, terminalId, data });
  return unavailableCapability("terminalWrite", { workspaceId, terminalId, data });
}

export async function resizeTerminalSession(
  workspaceId: string,
  terminalId: string,
  cols: number,
  rows: number,
): Promise<void> {
  const host = getOptionalHostClient();
  if (host?.terminal) return host.terminal.resize({ workspaceId, terminalId, cols, rows });
  return unavailableCapability("terminalResize", { workspaceId, terminalId, cols, rows });
}

export async function closeTerminalSession(
  workspaceId: string,
  terminalId: string,
): Promise<void> {
  const host = getOptionalHostClient();
  if (host?.terminal) return host.terminal.close({ workspaceId, terminalId });
  return unavailableCapability("terminalClose", { workspaceId, terminalId });
}

export async function listThreads(
  workspaceId: string,
  cursor?: string | null,
  limit?: number | null,
  sortKey?: "created_at" | "updated_at" | null,
) {
  const host = getOptionalHostClient();
  if (host) return host.agent.listThreads({ workspaceId, cursor, limit, sortKey });
  return unavailableCapability<any>("listThreads", { workspaceId, cursor, limit, sortKey });
}

export async function listMcpServerStatus(
  workspaceId: string,
  cursor?: string | null,
  limit?: number | null,
) {
  const host = getOptionalHostClient();
  if (host) return host.agent.listMcpServerStatus({ workspaceId, cursor, limit });
  return unavailableCapability<any>("listMcpServerStatus", { workspaceId, cursor, limit });
}

export async function resumeThread(workspaceId: string, threadId: string) {
  const host = getOptionalHostClient();
  if (host) return host.agent.resumeThread({ workspaceId, threadId });
  return unavailableCapability<any>("resumeThread", { workspaceId, threadId });
}

export async function readThread(workspaceId: string, threadId: string) {
  const host = getOptionalHostClient();
  if (host) return host.agent.readThread({ workspaceId, threadId, includeTurns: true });
  return unavailableCapability<any>("readThread", { workspaceId, threadId });
}

export async function threadLiveSubscribe(workspaceId: string, threadId: string) {
  const host = getOptionalHostClient();
  if (host) return host.agent.resumeThread({ workspaceId, threadId });
  return unavailableCapability<any>("threadLiveSubscribe", { workspaceId, threadId });
}

export async function threadLiveUnsubscribe(workspaceId: string, threadId: string) {
  const host = getOptionalHostClient();
  if (host) return host.agent.unsubscribeThread?.({ threadId }) ?? { threadId, status: "notSubscribed" };
  return unavailableCapability<any>("threadLiveUnsubscribe", { workspaceId, threadId });
}

export async function archiveThread(workspaceId: string, threadId: string) {
  const host = getOptionalHostClient();
  if (host) {
    await host.agent.archiveThread({ workspaceId, threadId });
    return;
  }
  return unavailableCapability<void>("archiveThread", { workspaceId, threadId });
}

export async function deleteThread(workspaceId: string, threadId: string) {
  const host = getOptionalHostClient();
  if (host) {
    await host.agent.archiveThread({ workspaceId, threadId });
    return;
  }
  return unavailableCapability<void>("deleteThread", { workspaceId, threadId });
}

export async function threadItemsList(
  workspaceId: string,
  threadId: string,
  turnId?: string,
  cursor?: string,
  limit?: number,
) {
  return unavailableCapability<unknown>("threadItemsList", {
    workspaceId,
    threadId,
    turnId,
    cursor,
    limit,
  });
}

export async function threadBackgroundTerminalsList(
  workspaceId: string,
  threadId: string,
  cursor?: string,
  limit?: number,
) {
  return unavailableCapability<unknown>("threadBackgroundTerminalsList", {
    workspaceId,
    threadId,
    cursor,
    limit,
  });
}

export async function threadBackgroundTerminalsTerminate(
  workspaceId: string,
  threadId: string,
  processId: string,
) {
  return unavailableCapability<unknown>("threadBackgroundTerminalsTerminate", {
    workspaceId,
    threadId,
    processId,
  });
}

export async function environmentInfo(
  workspaceId: string,
  environmentId: string,
) {
  return unavailableCapability<unknown>("environmentInfo", { workspaceId, environmentId });
}

export async function skillsConfigWrite(
  workspaceId: string,
  enabled: boolean,
  opts?: { path?: string; name?: string },
) {
  return unavailableCapability<unknown>("skillsConfigWrite", {
    workspaceId,
    path: opts?.path,
    name: opts?.name,
    enabled,
  });
}

export async function skillsExtraRootsSet(
  workspaceId: string,
  extraRoots: string[],
) {
  return unavailableCapability<unknown>("skillsExtraRootsSet", { workspaceId, extraRoots });
}

export async function hooksList(workspaceId: string, cwds: string[]) {
  return unavailableCapability<unknown>("hooksList", { workspaceId, cwds });
}

export async function pluginList(
  workspaceId: string,
  cwds?: string[],
  marketplaceKinds?: string[],
) {
  return unavailableCapability<unknown>("pluginList", { workspaceId, cwds, marketplaceKinds });
}

export async function pluginInstalled(
  workspaceId: string,
  cwds?: string[],
  installSuggestionPluginNames?: string[],
) {
  return unavailableCapability<unknown>("pluginInstalled", {
    workspaceId,
    cwds,
    installSuggestionPluginNames,
  });
}

export async function pluginRead(
  workspaceId: string,
  pluginName: string,
  opts?: { marketplacePath?: string; remoteMarketplaceName?: string },
) {
  return unavailableCapability<unknown>("pluginRead", {
    workspaceId,
    pluginName,
    marketplacePath: opts?.marketplacePath,
    remoteMarketplaceName: opts?.remoteMarketplaceName,
  });
}

export async function pluginInstall(
  workspaceId: string,
  pluginName: string,
  opts?: { marketplacePath?: string; remoteMarketplaceName?: string },
) {
  return unavailableCapability<unknown>("pluginInstall", {
    workspaceId,
    pluginName,
    marketplacePath: opts?.marketplacePath,
    remoteMarketplaceName: opts?.remoteMarketplaceName,
  });
}

export async function pluginUninstall(workspaceId: string, pluginId: string) {
  return unavailableCapability<unknown>("pluginUninstall", { workspaceId, pluginId });
}

export async function pluginSkillRead(
  workspaceId: string,
  remoteMarketplaceName: string,
  remotePluginId: string,
  skillName: string,
) {
  return unavailableCapability<unknown>("pluginSkillRead", {
    workspaceId,
    remoteMarketplaceName,
    remotePluginId,
    skillName,
  });
}

export async function marketplaceAdd(
  workspaceId: string,
  source: string,
  opts?: { refName?: string; sparsePaths?: string[] },
) {
  return unavailableCapability<unknown>("marketplaceAdd", {
    workspaceId,
    source,
    refName: opts?.refName,
    sparsePaths: opts?.sparsePaths,
  });
}

export async function marketplaceRemove(
  workspaceId: string,
  marketplaceName: string,
) {
  return unavailableCapability<unknown>("marketplaceRemove", { workspaceId, marketplaceName });
}

export async function marketplaceUpgrade(
  workspaceId: string,
  marketplaceName?: string,
) {
  return unavailableCapability<unknown>("marketplaceUpgrade", {
    workspaceId,
    marketplaceName,
  });
}

export async function threadSearch(
  workspaceId: string,
  searchTerm: string,
  opts?: {
    cursor?: string;
    limit?: number;
    archived?: boolean;
    sortKey?: string;
    sortDirection?: string;
    sourceKinds?: string[];
  },
) {
  return unavailableCapability<unknown>("threadSearch", {
    workspaceId,
    searchTerm,
    cursor: opts?.cursor,
    limit: opts?.limit,
    archived: opts?.archived,
    sortKey: opts?.sortKey,
    sortDirection: opts?.sortDirection,
    sourceKinds: opts?.sourceKinds,
  });
}

export async function threadGoalGet(workspaceId: string, threadId: string) {
  return unavailableCapability<unknown>("threadGoalGet", { workspaceId, threadId });
}

export async function threadGoalClear(workspaceId: string, threadId: string) {
  return unavailableCapability<unknown>("threadGoalClear", { workspaceId, threadId });
}

export async function threadMemoryModeSet(
  workspaceId: string,
  threadId: string,
  mode: string,
) {
  return unavailableCapability<unknown>("threadMemoryModeSet", {
    workspaceId,
    threadId,
    mode,
  });
}

export async function memoryReset(workspaceId: string) {
  return unavailableCapability<unknown>("memoryReset", { workspaceId });
}

export async function threadUnarchive(workspaceId: string, threadId: string) {
  return unavailableCapability<unknown>("threadUnarchive", { workspaceId, threadId });
}

export async function threadLoadedList(
  workspaceId: string,
  cursor?: string,
  limit?: number,
) {
  return unavailableCapability<unknown>("threadLoadedList", { workspaceId, cursor, limit });
}

export async function threadShellCommand(
  workspaceId: string,
  threadId: string,
  command: string,
) {
  return unavailableCapability<unknown>("threadShellCommand", {
    workspaceId,
    threadId,
    command,
  });
}

export async function threadBackgroundTerminalsClean(
  workspaceId: string,
  threadId: string,
) {
  return unavailableCapability<unknown>("threadBackgroundTerminalsClean", {
    workspaceId,
    threadId,
  });
}

// 复杂/变形参数:调用方构造完整 kernel params 对象(含 threadId)
export async function threadGoalSet(
  workspaceId: string,
  params: Record<string, unknown>,
) {
  return unavailableCapability<unknown>("threadGoalSet", { workspaceId, params });
}

export async function threadSettingsUpdate(
  workspaceId: string,
  params: Record<string, unknown>,
) {
  return unavailableCapability<unknown>("threadSettingsUpdate", { workspaceId, params });
}

export async function threadMetadataUpdate(
  workspaceId: string,
  params: Record<string, unknown>,
) {
  return unavailableCapability<unknown>("threadMetadataUpdate", { workspaceId, params });
}

export async function threadApproveGuardianDeniedAction(
  workspaceId: string,
  params: Record<string, unknown>,
) {
  return unavailableCapability<unknown>("threadApproveGuardianDeniedAction", {
    workspaceId,
    params,
  });
}

export async function modelProviderCapabilitiesRead(workspaceId: string) {
  return unavailableCapability<unknown>("modelProviderCapabilitiesRead", { workspaceId });
}

export async function experimentalFeatureEnablementSet(
  workspaceId: string,
  enablement: Record<string, boolean>,
) {
  return unavailableCapability<unknown>("experimentalFeatureEnablementSet", {
    workspaceId,
    enablement,
  });
}

export async function permissionProfileList(
  workspaceId: string,
  opts?: { cursor?: string; limit?: number; cwd?: string },
) {
  return unavailableCapability<unknown>("permissionProfileList", {
    workspaceId,
    cursor: opts?.cursor,
    limit: opts?.limit,
    cwd: opts?.cwd,
  });
}

export async function accountLogout(workspaceId: string) {
  const host = getOptionalHostClient();
  if (host) return host.agent.logoutAccount({ workspaceId });
  return unavailableCapability<unknown>("accountLogout", { workspaceId });
}

export async function mcpServerOauthLogin(
  workspaceId: string,
  name: string,
  opts?: { threadId?: string; scopes?: string[]; timeoutSecs?: number },
) {
  return unavailableCapability<unknown>("mcpServerOauthLogin", {
    workspaceId,
    name,
    threadId: opts?.threadId,
    scopes: opts?.scopes,
    timeoutSecs: opts?.timeoutSecs,
  });
}

export async function mcpResourceRead(
  workspaceId: string,
  server: string,
  uri: string,
  threadId?: string,
) {
  return unavailableCapability<unknown>("mcpResourceRead", {
    workspaceId,
    server,
    uri,
    threadId,
  });
}

export async function mcpServerToolCall(
  workspaceId: string,
  threadId: string,
  server: string,
  tool: string,
  opts?: { arguments?: unknown; meta?: unknown },
) {
  return unavailableCapability<unknown>("mcpServerToolCall", {
    workspaceId,
    threadId,
    server,
    tool,
    arguments: opts?.arguments,
    meta: opts?.meta,
  });
}

export async function windowsSandboxSetupStart(
  workspaceId: string,
  mode: string,
  cwd?: string,
) {
  return unavailableCapability<unknown>("windowsSandboxSetupStart", {
    workspaceId,
    mode,
    cwd,
  });
}

export async function windowsSandboxReadiness(workspaceId: string) {
  return unavailableCapability<unknown>("windowsSandboxReadiness", { workspaceId });
}

export async function externalAgentConfigDetect(
  workspaceId: string,
  includeHome: boolean,
  cwds?: string[],
) {
  return unavailableCapability<unknown>("externalAgentConfigDetect", {
    workspaceId,
    includeHome,
    cwds,
  });
}

export async function externalAgentConfigImport(
  workspaceId: string,
  params: Record<string, unknown>,
) {
  return unavailableCapability<unknown>("externalAgentConfigImport", {
    workspaceId,
    params,
  });
}

export async function externalAgentConfigImportHistoriesRead(
  workspaceId: string,
) {
  return unavailableCapability<unknown>("externalAgentConfigImportHistoriesRead", {
    workspaceId,
  });
}

export async function rollbackThread(
  workspaceId: string,
  threadId: string,
  turnId: string,
) {
  const host = getOptionalHostClient();
  if (host) return host.agent.rollbackThread({ workspaceId, threadId, turnId });
  return unavailableCapability<any>("rollbackThread", { workspaceId, threadId, turnId });
}

export async function setThreadName(
  workspaceId: string,
  threadId: string,
  name: string,
) {
  const host = getOptionalHostClient();
  if (host) return host.agent.setThreadName({ workspaceId, threadId, name });
  return unavailableCapability<any>("setThreadName", { workspaceId, threadId, name });
}

export async function setTrayRecentThreads(entries: TrayRecentThreadEntry[]) {
  const host = getOptionalHostClient();
  if (host?.tray) return host.tray.setRecentThreads(entries);
  return unavailableCapability<void>("setTrayRecentThreads", { entries });
}

export async function setTraySessionUsage(usage: TraySessionUsage | null) {
  const host = getOptionalHostClient();
  if (host?.tray) return host.tray.setSessionUsage(usage);
  return unavailableCapability<void>("setTraySessionUsage", { usage });
}

export async function generateCommitMessage(
  workspaceId: string,
  commitMessageModelId: string | null,
): Promise<string> {
  return unavailableCapability("generateCommitMessage", { workspaceId, commitMessageModelId });
}

export type GeneratedAgentConfiguration = {
  description: string;
  developerInstructions: string;
};

export async function generateAgentDescription(
  workspaceId: string,
  description: string,
): Promise<GeneratedAgentConfiguration> {
  return unavailableCapability("generateAgentDescription", { workspaceId, description });
}

export type AppBuildType = "debug" | "release";

export async function getAppBuildType(): Promise<AppBuildType> {
  return unavailableCapability<AppBuildType>("appBuildType");
}

export async function sendNotification(
  title: string,
  body: string,
  options?: {
    id?: number;
    group?: string;
    actionTypeId?: string;
    sound?: string;
    autoCancel?: boolean;
    extra?: Record<string, unknown>;
  },
): Promise<void> {
  void options;
  await getOptionalHostClient()?.notifications.show({ title, body });
}

// 账号会话 token 钥匙串存取。
// 供前端 Supabase storage adapter 调用，把 session JSON 持久化进系统凭据库。
export async function accountSessionGet(key: string): Promise<string | null> {
  const host = getOptionalHostClient();
  if (host) return host.accountSession.get({ key });
  return unavailableCapability<string | null>("accountSessionGet", { key });
}

export async function accountSessionSet(key: string, value: string): Promise<void> {
  const host = getOptionalHostClient();
  if (host) return host.accountSession.set({ key, value });
  await unavailableCapability("accountSessionSet", { key, value });
}

export async function accountSessionClear(key: string): Promise<void> {
  const host = getOptionalHostClient();
  if (host) return host.accountSession.clear({ key });
  await unavailableCapability("accountSessionClear", { key });
}
