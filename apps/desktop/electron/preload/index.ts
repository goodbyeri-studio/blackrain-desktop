import { contextBridge, ipcRenderer, webUtils } from "electron";
import { z } from "zod";
import {
  AgentAccountInputSchema,
  AgentAccountLoginCancelResponseSchema,
  AgentAccountLoginStartResponseSchema,
  AgentEventBatchSchema,
  AgentEventCursorInputSchema,
  AgentExperimentalFeatureListInputSchema,
  AgentExperimentalFeatureSetInputSchema,
  AgentMcpServerStatusInputSchema,
  AgentReviewStartInputSchema,
  AgentReviewStartResponseSchema,
  AgentThreadOperationInputSchema,
  AgentThreadRollbackInputSchema,
  AgentEventSchema,
  AgentRuntimeStatusSchema,
  AgentServerRequestResponseAckSchema,
  AgentServerRequestResponseInputSchema,
  AgentThreadAckSchema,
  AgentThreadListInputSchema,
  AgentThreadListResponseSchema,
  AgentThreadResumeInputSchema,
  AgentThreadUnsubscribeInputSchema,
  AgentThreadUnsubscribeResponseSchema,
  AgentThreadStartInputSchema,
  AgentTurnAckSchema,
  AgentTurnInterruptInputSchema,
  AgentTurnSteerInputSchema,
  AgentTurnStartInputSchema,
} from "../shared/agent";
import {
  BrowserLayoutAckSchema,
  BrowserLayoutUpdateSchema,
} from "../shared/browser-layout";
import {
  BrowserCloseTabAckSchema,
  BrowserControlInputSchema,
  BrowserCreateTabInputSchema,
  BrowserDownloadDecisionInputSchema,
  BrowserDialogDecisionInputSchema,
  BrowserFileChooserDecisionInputSchema,
  BrowserNavigateInputSchema,
  BrowserPermissionDecisionInputSchema,
  BrowserRouteScopeSchema,
  BrowserSensitiveActionDecisionInputSchema,
  BrowserTabListSchema,
  BrowserTabRequestSchema,
  BrowserTabStateSchema,
  BrowserTakeControlInputSchema,
  BrowserTabsChangedEventSchema,
} from "../shared/browser-tabs";
import type { BlackRainHostApi } from "../shared/host-api";
import {
  AccountSessionKeyInputSchema,
  AccountSessionSetInputSchema,
  AgentAppsListInputSchema,
  AgentThreadMutationInputSchema,
  AgentThreadNameInputSchema,
  AgentThreadReadInputSchema,
  AgentWorkspaceInputSchema,
  DialogConfirmInputSchema,
  DialogMessageInputSchema,
  ExternalUrlInputSchema,
  FilePathInputSchema,
  FilePathListSchema,
  FilePickInputSchema,
  FileReadResponseSchema,
  FileSaveTextInputSchema,
  HostJsonObjectSchema,
  OptionalFilePathSchema,
  OptionalStringSchema,
  SettingsUpdateInputSchema,
  WorkspaceFileInputSchema,
  WorkspaceFileWriteInputSchema,
  WorkspaceFileListSchema,
} from "../shared/desktop";
import {
  BootstrapInfoSchema,
  IPC_CHANNELS,
  RuntimeBootstrapStatusSchema,
} from "../shared/ipc";
import {
  WorkspaceAckSchema,
  WorkspaceIdInputSchema,
  WorkspaceInfoSchema,
  WorkspaceListSchema,
  WorkspacePathInputSchema,
  WorkspacePathListSchema,
  WorkspacePickInputSchema,
  WorkspaceUpdateInputSchema,
} from "../shared/workspaces";
import {
  GitAckSchema,
  GitBranchInputSchema,
  GitCommitInputSchema,
  GitCreateRepositoryInputSchema,
  GitFileInputSchema,
  GitInitInputSchema,
  GitJsonSchema,
  GitLimitInputSchema,
  GitPullRequestInputSchema,
  GitRootsInputSchema,
  GitShaInputSchema,
  GitWorkspaceInputSchema,
} from "../shared/git";
import {
  TerminalAckSchema,
  TerminalCloseInputSchema,
  TerminalEventSchema,
  TerminalOpenInputSchema,
  TerminalResizeInputSchema,
  TerminalWriteInputSchema,
} from "../shared/terminal";
import {
  ContextMenuInputSchema,
  ContextMenuResultSchema,
  MenuAcceleratorInputSchema,
  NotificationInputSchema,
  SystemUiEventSchema,
  TrayRecentThreadsInputSchema,
  TraySessionUsageSchema,
} from "../shared/system";
import {
  UpdateCheckSchema,
  UpdateDownloadInputSchema,
  UpdateDownloadSchema,
  UpdateInstallInputSchema,
} from "../shared/updates";

const api: BlackRainHostApi = {
  app: {
    async getBootstrap() {
      return BootstrapInfoSchema.parse(
        await ipcRenderer.invoke(IPC_CHANNELS.appBootstrap),
      );
    },
    async initialize() {
      return RuntimeBootstrapStatusSchema.parse(
        await ipcRenderer.invoke(IPC_CHANNELS.appInitialize),
      );
    },
    async retry() {
      return RuntimeBootstrapStatusSchema.parse(
        await ipcRenderer.invoke(IPC_CHANNELS.appRetry),
      );
    },
    async exportDiagnostics() {
      return OptionalFilePathSchema.parse(
        await ipcRenderer.invoke(IPC_CHANNELS.appExportDiagnostics),
      );
    },
  },
  shell: {
    async openExternal(input) {
      await ipcRenderer.invoke(
        IPC_CHANNELS.shellOpenExternal,
        ExternalUrlInputSchema.parse(input),
      );
    },
    async revealPath(input) {
      await ipcRenderer.invoke(
        IPC_CHANNELS.shellRevealPath,
        FilePathInputSchema.parse(input),
      );
    },
  },
  dialog: {
    async confirm(input) {
      return Boolean(await ipcRenderer.invoke(
        IPC_CHANNELS.dialogConfirm,
        DialogConfirmInputSchema.parse(input),
      ));
    },
    async message(input) {
      await ipcRenderer.invoke(
        IPC_CHANNELS.dialogMessage,
        DialogMessageInputSchema.parse(input),
      );
    },
  },
  settings: {
    async get() {
      return HostJsonObjectSchema.parse(
        await ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
      );
    },
    async update(input) {
      return HostJsonObjectSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.settingsUpdate,
          SettingsUpdateInputSchema.parse(input),
        ),
      );
    },
  },
  files: {
    pathForFile(file) {
      return webUtils.getPathForFile(file as File);
    },
    async pick(input) {
      return FilePathListSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.filePick,
        FilePickInputSchema.parse(input),
      ));
    },
    async saveText(input) {
      return OptionalFilePathSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.fileSaveText,
        FileSaveTextInputSchema.parse(input),
      ));
    },
    async readImage(input) {
      return z.string().startsWith("data:image/").parse(await ipcRenderer.invoke(
        IPC_CHANNELS.fileReadImage,
        FilePathInputSchema.parse(input),
      ));
    },
    async listWorkspace(input) {
      return WorkspaceFileListSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.fileListWorkspace,
        AgentWorkspaceInputSchema.parse(input),
      ));
    },
    async readWorkspace(input) {
      return FileReadResponseSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.fileReadWorkspace,
        WorkspaceFileInputSchema.parse(input),
      ));
    },
    async writeWorkspace(input) {
      await ipcRenderer.invoke(
        IPC_CHANNELS.fileWriteWorkspace,
        WorkspaceFileWriteInputSchema.parse(input),
      );
    },
  },
  accountSession: {
    async get(input) {
      return OptionalStringSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.accountSessionGet,
        AccountSessionKeyInputSchema.parse(input),
      ));
    },
    async set(input) {
      await ipcRenderer.invoke(
        IPC_CHANNELS.accountSessionSet,
        AccountSessionSetInputSchema.parse(input),
      );
    },
    async clear(input) {
      await ipcRenderer.invoke(
        IPC_CHANNELS.accountSessionClear,
        AccountSessionKeyInputSchema.parse(input),
      );
    },
  },
  workspace: {
    async list() {
      return WorkspaceListSchema.parse(
        await ipcRenderer.invoke(IPC_CHANNELS.workspaceList),
      );
    },
    async add(input) {
      return WorkspaceInfoSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.workspaceAdd,
          WorkspacePathInputSchema.parse(input),
        ),
      );
    },
    async update(input) {
      return WorkspaceInfoSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.workspaceUpdate,
          WorkspaceUpdateInputSchema.parse(input),
        ),
      );
    },
    async remove(input) {
      return WorkspaceAckSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.workspaceRemove,
          WorkspaceIdInputSchema.parse(input),
        ),
      );
    },
    async connect(input) {
      return WorkspaceAckSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.workspaceConnect,
          WorkspaceIdInputSchema.parse(input),
        ),
      );
    },
    async isDirectory(input) {
      return Boolean(await ipcRenderer.invoke(
        IPC_CHANNELS.workspaceIsDirectory,
        WorkspacePathInputSchema.parse(input),
      ));
    },
    async pick(input) {
      return WorkspacePathListSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.workspacePick,
          WorkspacePickInputSchema.parse(input),
        ),
      );
    },
  },
  menu: {
    async popup(input) {
      return ContextMenuResultSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.menuPopup,
        ContextMenuInputSchema.parse(input),
      ));
    },
    async setAccelerators(input) {
      await ipcRenderer.invoke(
        IPC_CHANNELS.menuSetAccelerators,
        MenuAcceleratorInputSchema.parse(input),
      );
    },
    onEvent(listener) {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        listener(SystemUiEventSchema.parse(payload));
      };
      ipcRenderer.on(IPC_CHANNELS.systemUiEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.systemUiEvent, handler);
    },
  },
  tray: {
    async setRecentThreads(input) {
      await ipcRenderer.invoke(
        IPC_CHANNELS.traySetRecentThreads,
        TrayRecentThreadsInputSchema.parse(input),
      );
    },
    async setSessionUsage(input) {
      await ipcRenderer.invoke(
        IPC_CHANNELS.traySetSessionUsage,
        TraySessionUsageSchema.parse(input),
      );
    },
  },
  notifications: {
    async show(input) {
      await ipcRenderer.invoke(
        IPC_CHANNELS.notificationShow,
        NotificationInputSchema.parse(input),
      );
    },
  },
  updates: {
    async check() {
      return UpdateCheckSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.updateCheck));
    },
    async download(input) {
      return UpdateDownloadSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.updateDownload,
        UpdateDownloadInputSchema.parse(input),
      ));
    },
    async install(input) {
      await ipcRenderer.invoke(
        IPC_CHANNELS.updateInstall,
        UpdateInstallInputSchema.parse(input),
      );
    },
  },
  git: {
    async status(input) { return GitJsonSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitStatus, GitWorkspaceInputSchema.parse(input))); },
    async init(input) { return GitJsonSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitInit, GitInitInputSchema.parse(input))); },
    async createRepository(input) { return GitJsonSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitCreateRepository, GitCreateRepositoryInputSchema.parse(input))); },
    async roots(input) { return z.array(z.string().max(32_768)).parse(await ipcRenderer.invoke(IPC_CHANNELS.gitRoots, GitRootsInputSchema.parse(input))); },
    async diffs(input) { return GitJsonSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitDiffs, GitWorkspaceInputSchema.parse(input))); },
    async log(input) { return GitJsonSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitLog, GitLimitInputSchema.parse(input))); },
    async commitDiff(input) { return GitJsonSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitCommitDiff, GitShaInputSchema.parse(input))); },
    async remote(input) { return OptionalStringSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitRemote, GitWorkspaceInputSchema.parse(input))); },
    async stageFile(input) { GitAckSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitStageFile, GitFileInputSchema.parse(input))); },
    async stageAll(input) { GitAckSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitStageAll, GitWorkspaceInputSchema.parse(input))); },
    async unstageFile(input) { GitAckSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitUnstageFile, GitFileInputSchema.parse(input))); },
    async revertFile(input) { GitAckSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitRevertFile, GitFileInputSchema.parse(input))); },
    async revertAll(input) { GitAckSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitRevertAll, GitWorkspaceInputSchema.parse(input))); },
    async commit(input) { GitAckSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitCommit, GitCommitInputSchema.parse(input))); },
    async push(input) { GitAckSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitPush, GitWorkspaceInputSchema.parse(input))); },
    async pull(input) { GitAckSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitPull, GitWorkspaceInputSchema.parse(input))); },
    async fetch(input) { GitAckSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitFetch, GitWorkspaceInputSchema.parse(input))); },
    async sync(input) { GitAckSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitSync, GitWorkspaceInputSchema.parse(input))); },
    async branches(input) { return GitJsonSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitBranches, GitWorkspaceInputSchema.parse(input))); },
    async checkoutBranch(input) { GitAckSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitCheckoutBranch, GitBranchInputSchema.parse(input))); },
    async createBranch(input) { GitAckSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitCreateBranch, GitBranchInputSchema.parse(input))); },
    async issues(input) { return GitJsonSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitIssues, GitWorkspaceInputSchema.parse(input))); },
    async pullRequests(input) { return GitJsonSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitPullRequests, GitWorkspaceInputSchema.parse(input))); },
    async pullRequestDiff(input) { return GitJsonSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitPullRequestDiff, GitPullRequestInputSchema.parse(input))); },
    async pullRequestComments(input) { return GitJsonSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitPullRequestComments, GitPullRequestInputSchema.parse(input))); },
    async checkoutPullRequest(input) { GitAckSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.gitCheckoutPullRequest, GitPullRequestInputSchema.parse(input))); },
  },
  terminal: {
    async open(input) { TerminalAckSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.terminalOpen, TerminalOpenInputSchema.parse(input))); },
    async write(input) { TerminalAckSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.terminalWrite, TerminalWriteInputSchema.parse(input))); },
    async resize(input) { TerminalAckSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.terminalResize, TerminalResizeInputSchema.parse(input))); },
    async close(input) { TerminalAckSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.terminalClose, TerminalCloseInputSchema.parse(input))); },
    onEvent(listener) {
      const handler = (_event: Electron.IpcRendererEvent, input: unknown) => listener(TerminalEventSchema.parse(input));
      ipcRenderer.on(IPC_CHANNELS.terminalEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.terminalEvent, handler);
    },
  },
  agent: {
    async getStatus() {
      return AgentRuntimeStatusSchema.parse(
        await ipcRenderer.invoke(IPC_CHANNELS.agentGetStatus),
      );
    },
    async getEvents(input) {
      return AgentEventBatchSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.agentGetEvents,
          AgentEventCursorInputSchema.parse(input),
        ),
      );
    },
    onEvent(listener) {
      const handler = (_event: Electron.IpcRendererEvent, input: unknown) => {
        listener(AgentEventSchema.parse(input));
      };
      ipcRenderer.on(IPC_CHANNELS.agentEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.agentEvent, handler);
    },
    async listThreads(input) {
      return AgentThreadListResponseSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.agentListThreads,
          AgentThreadListInputSchema.parse(input),
        ),
      );
    },
    async startThread(input) {
      return AgentThreadAckSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.agentStartThread,
          AgentThreadStartInputSchema.parse(input),
        ),
      );
    },
    async resumeThread(input) {
      return AgentThreadAckSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.agentResumeThread,
          AgentThreadResumeInputSchema.parse(input),
        ),
      );
    },
    async unsubscribeThread(input) {
      return AgentThreadUnsubscribeResponseSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.agentUnsubscribeThread,
          AgentThreadUnsubscribeInputSchema.parse(input),
        ),
      );
    },
    async startTurn(input) {
      return AgentTurnAckSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.agentStartTurn,
          AgentTurnStartInputSchema.parse(input),
        ),
      );
    },
    async steerTurn(input) {
      return AgentTurnAckSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.agentSteerTurn,
          AgentTurnSteerInputSchema.parse(input),
        ),
      );
    },
    async interruptTurn(input) {
      return AgentTurnAckSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.agentInterruptTurn,
          AgentTurnInterruptInputSchema.parse(input),
        ),
      );
    },
    async startReview(input) {
      return AgentReviewStartResponseSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.agentReviewStart,
          AgentReviewStartInputSchema.parse(input),
        ),
      );
    },
    async listExperimentalFeatures(input) {
      return HostJsonObjectSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.agentExperimentalFeatureList,
        AgentExperimentalFeatureListInputSchema.parse(input),
      ));
    },
    async setExperimentalFeature(input) {
      return HostJsonObjectSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.agentExperimentalFeatureSet,
        AgentExperimentalFeatureSetInputSchema.parse(input),
      ));
    },
    async forkThread(input) {
      return AgentThreadAckSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.agentThreadFork,
        AgentThreadOperationInputSchema.parse(input),
      ));
    },
    async compactThread(input) {
      return HostJsonObjectSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.agentThreadCompact,
        AgentThreadOperationInputSchema.parse(input),
      ));
    },
    async rollbackThread(input) {
      return HostJsonObjectSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.agentThreadRollback,
        AgentThreadRollbackInputSchema.parse(input),
      ));
    },
    async listMcpServerStatus(input) {
      return HostJsonObjectSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.agentMcpServerStatusList,
        AgentMcpServerStatusInputSchema.parse(input),
      ));
    },
    async respondToServerRequest(input) {
      return AgentServerRequestResponseAckSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.agentRespondServerRequest,
          AgentServerRequestResponseInputSchema.parse(input),
        ),
      );
    },
    async listModels(input) {
      return HostJsonObjectSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.agentModelList,
        AgentWorkspaceInputSchema.parse(input),
      ));
    },
    async readConfig(input) {
      return HostJsonObjectSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.agentConfigRead,
        AgentWorkspaceInputSchema.parse(input),
      ));
    },
    async listCollaborationModes(input) {
      return HostJsonObjectSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.agentCollaborationModeList,
        AgentWorkspaceInputSchema.parse(input),
      ));
    },
    async listSkills(input) {
      return HostJsonObjectSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.agentSkillsList,
        AgentWorkspaceInputSchema.parse(input),
      ));
    },
    async listApps(input) {
      return HostJsonObjectSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.agentAppsList,
        AgentAppsListInputSchema.parse(input),
      ));
    },
    async readAccount(input) {
      return HostJsonObjectSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.agentAccountRead,
        AgentWorkspaceInputSchema.parse(input),
      ));
    },
    async readAccountRateLimits(input) {
      return HostJsonObjectSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.agentAccountRateLimitsRead,
        AgentWorkspaceInputSchema.parse(input),
      ));
    },
    async startAccountLogin(input) {
      return AgentAccountLoginStartResponseSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.agentAccountLoginStart,
        AgentAccountInputSchema.parse(input),
      ));
    },
    async cancelAccountLogin(input) {
      return AgentAccountLoginCancelResponseSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.agentAccountLoginCancel,
        AgentAccountInputSchema.parse(input),
      ));
    },
    async logoutAccount(input) {
      return HostJsonObjectSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.agentAccountLogout,
        AgentAccountInputSchema.parse(input),
      ));
    },
    async readThread(input) {
      return HostJsonObjectSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.agentThreadRead,
        AgentThreadReadInputSchema.parse(input),
      ));
    },
    async archiveThread(input) {
      return HostJsonObjectSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.agentThreadArchive,
        AgentThreadMutationInputSchema.parse(input),
      ));
    },
    async setThreadName(input) {
      return HostJsonObjectSchema.parse(await ipcRenderer.invoke(
        IPC_CHANNELS.agentThreadNameSet,
        AgentThreadNameInputSchema.parse(input),
      ));
    },
  },
  browser: {
    async createTab(input) {
      return BrowserTabStateSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.browserCreateTab,
          BrowserCreateTabInputSchema.parse(input),
        ),
      );
    },
    async listTabs(scope) {
      return BrowserTabListSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.browserListTabs,
          BrowserRouteScopeSchema.parse(scope),
        ),
      );
    },
    async navigate(input) {
      return BrowserTabStateSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.browserNavigate,
          BrowserNavigateInputSchema.parse(input),
        ),
      );
    },
    async control(input) {
      return BrowserTabStateSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.browserControl,
          BrowserControlInputSchema.parse(input),
        ),
      );
    },
    async takeControl(input) {
      return BrowserTabStateSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.browserTakeControl,
          BrowserTakeControlInputSchema.parse(input),
        ),
      );
    },
    async respondPermission(input) {
      return BrowserTabStateSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.browserRespondPermission,
          BrowserPermissionDecisionInputSchema.parse(input),
        ),
      );
    },
    async resolveDownload(input) {
      return BrowserTabStateSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.browserResolveDownload,
          BrowserDownloadDecisionInputSchema.parse(input),
        ),
      );
    },
    async respondDialog(input) {
      return BrowserTabStateSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.browserRespondDialog,
          BrowserDialogDecisionInputSchema.parse(input),
        ),
      );
    },
    async resolveFileChooser(input) {
      return BrowserTabStateSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.browserResolveFileChooser,
          BrowserFileChooserDecisionInputSchema.parse(input),
        ),
      );
    },
    async respondSensitiveAction(input) {
      return BrowserTabStateSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.browserRespondSensitiveAction,
          BrowserSensitiveActionDecisionInputSchema.parse(input),
        ),
      );
    },
    async closeTab(input) {
      return BrowserCloseTabAckSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.browserCloseTab,
          BrowserTabRequestSchema.parse(input),
        ),
      );
    },
    async setLayout(input) {
      const update = BrowserLayoutUpdateSchema.parse(input);
      return BrowserLayoutAckSchema.parse(
        await ipcRenderer.invoke(IPC_CHANNELS.browserSetLayout, update),
      );
    },
    onTabsChanged(listener) {
      const handler = (_event: Electron.IpcRendererEvent, input: unknown) => {
        listener(BrowserTabsChangedEventSchema.parse(input));
      };
      ipcRenderer.on(IPC_CHANNELS.browserTabsChanged, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.browserTabsChanged, handler);
    },
  },
};

contextBridge.exposeInMainWorld("blackrain", api);
