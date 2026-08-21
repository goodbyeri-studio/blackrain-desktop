import type { BrowserLayoutAck, BrowserLayoutUpdate } from "./browser-layout";
import type {
  BrowserCloseTabAck,
  BrowserControlInput,
  BrowserCreateTabInput,
  BrowserDownloadDecisionInput,
  BrowserDialogDecisionInput,
  BrowserFileChooserDecisionInput,
  BrowserNavigateInput,
  BrowserPermissionDecisionInput,
  BrowserRouteScope,
  BrowserSensitiveActionDecisionInput,
  BrowserTabRequest,
  BrowserTabState,
  BrowserTakeControlInput,
  BrowserTabsChangedEvent,
} from "./browser-tabs";
import type { BootstrapInfo, RuntimeBootstrapStatus } from "./ipc";
import type {
  AccountSessionKeyInput,
  AccountSessionSetInput,
  AgentAppsListInput,
  AgentThreadMutationInput,
  AgentThreadNameInput,
  AgentThreadReadInput,
  AgentWorkspaceInput,
  DialogConfirmInput,
  DialogMessageInput,
  ExternalUrlInput,
  FilePickInput,
  FilePathInput,
  FileReadResponse,
  FileSaveTextInput,
  HostJsonObject,
  SettingsUpdateInput,
  WorkspaceFileInput,
  WorkspaceFileWriteInput,
} from "./desktop";
import type {
  WorkspaceIdInput,
  WorkspaceInfo,
  WorkspacePathInput,
  WorkspacePickInput,
  WorkspaceUpdateInput,
} from "./workspaces";
import type {
  AgentAccountInput,
  AgentAccountLoginCancelResponse,
  AgentAccountLoginStartResponse,
  AgentEvent,
  AgentEventBatch,
  AgentEventCursorInput,
  AgentExperimentalFeatureListInput,
  AgentExperimentalFeatureSetInput,
  AgentMcpServerStatusInput,
  AgentReviewStartInput,
  AgentReviewStartResponse,
  AgentThreadOperationInput,
  AgentThreadRollbackInput,
  AgentRuntimeStatus,
  AgentServerRequestResponseAck,
  AgentServerRequestResponseInput,
  AgentThreadAck,
  AgentThreadListInput,
  AgentThreadListResponse,
  AgentThreadResumeInput,
  AgentThreadUnsubscribeInput,
  AgentThreadUnsubscribeResponse,
  AgentThreadStartInput,
  AgentTurnAck,
  AgentTurnInterruptInput,
  AgentTurnSteerInput,
  AgentTurnStartInput,
} from "./agent";
import type {
  GitBranchInput,
  GitCommitInput,
  GitCreateRepositoryInput,
  GitFileInput,
  GitInitInput,
  GitLimitInput,
  GitPullRequestInput,
  GitRootsInput,
  GitShaInput,
  GitWorkspaceInput,
} from "./git";
import type {
  TerminalCloseInput,
  TerminalEvent,
  TerminalOpenInput,
  TerminalResizeInput,
  TerminalWriteInput,
} from "./terminal";
import type {
  ContextMenuInput,
  ContextMenuResult,
  MenuAcceleratorInput,
  NotificationInput,
  SystemUiEvent,
  TrayRecentThreadEntry,
  TraySessionUsage,
} from "./system";
import type {
  UpdateCheck,
  UpdateDownload,
  UpdateDownloadInput,
  UpdateInstallInput,
} from "./updates";

export interface BlackRainHostApi {
  app: {
    getBootstrap(): Promise<BootstrapInfo>;
    initialize?(): Promise<RuntimeBootstrapStatus>;
    retry?(): Promise<RuntimeBootstrapStatus>;
    exportDiagnostics?(): Promise<string | null>;
  };
  shell: {
    openExternal(input: ExternalUrlInput): Promise<void>;
    revealPath(input: FilePathInput): Promise<void>;
  };
  dialog: {
    confirm(input: DialogConfirmInput): Promise<boolean>;
    message(input: DialogMessageInput): Promise<void>;
  };
  menu: {
    popup(input: ContextMenuInput): Promise<ContextMenuResult>;
    setAccelerators?(input: MenuAcceleratorInput): Promise<void>;
    onEvent?(listener: (event: SystemUiEvent) => void): () => void;
  };
  tray?: {
    setRecentThreads(input: TrayRecentThreadEntry[]): Promise<void>;
    setSessionUsage(input: TraySessionUsage): Promise<void>;
  };
  notifications: {
    show(input: NotificationInput): Promise<void>;
  };
  updates: {
    check(): Promise<UpdateCheck>;
    download(input: UpdateDownloadInput): Promise<UpdateDownload>;
    install(input: UpdateInstallInput): Promise<void>;
  };
  settings: {
    get(): Promise<HostJsonObject>;
    update(input: SettingsUpdateInput): Promise<HostJsonObject>;
  };
  files: {
    pathForFile(file: unknown): string;
    pick(input: FilePickInput): Promise<string[]>;
    saveText(input: FileSaveTextInput): Promise<string | null>;
    readImage(input: FilePathInput): Promise<string>;
    listWorkspace(input: AgentWorkspaceInput): Promise<string[]>;
    readWorkspace(input: WorkspaceFileInput): Promise<FileReadResponse>;
    writeWorkspace(input: WorkspaceFileWriteInput): Promise<void>;
  };
  accountSession: {
    get(input: AccountSessionKeyInput): Promise<string | null>;
    set(input: AccountSessionSetInput): Promise<void>;
    clear(input: AccountSessionKeyInput): Promise<void>;
  };
  workspace: {
    list(): Promise<WorkspaceInfo[]>;
    add(input: WorkspacePathInput): Promise<WorkspaceInfo>;
    update(input: WorkspaceUpdateInput): Promise<WorkspaceInfo>;
    remove(input: WorkspaceIdInput): Promise<{ ok: true }>;
    connect(input: WorkspaceIdInput): Promise<{ ok: true }>;
    isDirectory(input: WorkspacePathInput): Promise<boolean>;
    pick(input: WorkspacePickInput): Promise<string[]>;
  };
  git: {
    status(input: GitWorkspaceInput): Promise<unknown>;
    init(input: GitInitInput): Promise<unknown>;
    createRepository(input: GitCreateRepositoryInput): Promise<unknown>;
    roots(input: GitRootsInput): Promise<string[]>;
    diffs(input: GitWorkspaceInput): Promise<unknown>;
    log(input: GitLimitInput): Promise<unknown>;
    commitDiff(input: GitShaInput): Promise<unknown>;
    remote(input: GitWorkspaceInput): Promise<string | null>;
    stageFile(input: GitFileInput): Promise<void>;
    stageAll(input: GitWorkspaceInput): Promise<void>;
    unstageFile(input: GitFileInput): Promise<void>;
    revertFile(input: GitFileInput): Promise<void>;
    revertAll(input: GitWorkspaceInput): Promise<void>;
    commit(input: GitCommitInput): Promise<void>;
    push(input: GitWorkspaceInput): Promise<void>;
    pull(input: GitWorkspaceInput): Promise<void>;
    fetch(input: GitWorkspaceInput): Promise<void>;
    sync(input: GitWorkspaceInput): Promise<void>;
    branches(input: GitWorkspaceInput): Promise<unknown>;
    checkoutBranch(input: GitBranchInput): Promise<void>;
    createBranch(input: GitBranchInput): Promise<void>;
    issues(input: GitWorkspaceInput): Promise<unknown>;
    pullRequests(input: GitWorkspaceInput): Promise<unknown>;
    pullRequestDiff(input: GitPullRequestInput): Promise<unknown>;
    pullRequestComments(input: GitPullRequestInput): Promise<unknown>;
    checkoutPullRequest(input: GitPullRequestInput): Promise<void>;
  };
  terminal: {
    open(input: TerminalOpenInput): Promise<void>;
    write(input: TerminalWriteInput): Promise<void>;
    resize(input: TerminalResizeInput): Promise<void>;
    close(input: TerminalCloseInput): Promise<void>;
    onEvent(listener: (event: TerminalEvent) => void): () => void;
  };
  agent: {
    getStatus(): Promise<AgentRuntimeStatus>;
    getEvents(input: AgentEventCursorInput): Promise<AgentEventBatch>;
    onEvent(listener: (event: AgentEvent) => void): () => void;
    listThreads(input: AgentThreadListInput): Promise<AgentThreadListResponse>;
    startThread(input: AgentThreadStartInput): Promise<AgentThreadAck>;
    resumeThread(input: AgentThreadResumeInput): Promise<AgentThreadAck>;
    unsubscribeThread?(input: AgentThreadUnsubscribeInput): Promise<AgentThreadUnsubscribeResponse>;
    startTurn(input: AgentTurnStartInput): Promise<AgentTurnAck>;
    steerTurn(input: AgentTurnSteerInput): Promise<AgentTurnAck>;
    interruptTurn(input: AgentTurnInterruptInput): Promise<AgentTurnAck>;
    startReview(input: AgentReviewStartInput): Promise<AgentReviewStartResponse>;
    listExperimentalFeatures(input: AgentExperimentalFeatureListInput): Promise<HostJsonObject>;
    setExperimentalFeature(input: AgentExperimentalFeatureSetInput): Promise<HostJsonObject>;
    forkThread(input: AgentThreadOperationInput): Promise<AgentThreadAck>;
    compactThread(input: AgentThreadOperationInput): Promise<HostJsonObject>;
    rollbackThread(input: AgentThreadRollbackInput): Promise<HostJsonObject>;
    listMcpServerStatus(input: AgentMcpServerStatusInput): Promise<HostJsonObject>;
    respondToServerRequest(input: AgentServerRequestResponseInput): Promise<AgentServerRequestResponseAck>;
    listModels(input: AgentWorkspaceInput): Promise<HostJsonObject>;
    readConfig(input: AgentWorkspaceInput): Promise<HostJsonObject>;
    listCollaborationModes(input: AgentWorkspaceInput): Promise<HostJsonObject>;
    listSkills(input: AgentWorkspaceInput): Promise<HostJsonObject>;
    listApps(input: AgentAppsListInput): Promise<HostJsonObject>;
    readAccount(input: AgentWorkspaceInput): Promise<HostJsonObject>;
    readAccountRateLimits(input: AgentWorkspaceInput): Promise<HostJsonObject>;
    startAccountLogin(input: AgentAccountInput): Promise<AgentAccountLoginStartResponse>;
    cancelAccountLogin(input: AgentAccountInput): Promise<AgentAccountLoginCancelResponse>;
    logoutAccount(input: AgentAccountInput): Promise<HostJsonObject>;
    readThread(input: AgentThreadReadInput): Promise<HostJsonObject>;
    archiveThread(input: AgentThreadMutationInput): Promise<HostJsonObject>;
    setThreadName(input: AgentThreadNameInput): Promise<HostJsonObject>;
  };
  browser: {
    createTab(input: BrowserCreateTabInput): Promise<BrowserTabState>;
    listTabs(scope: BrowserRouteScope): Promise<BrowserTabState[]>;
    navigate(input: BrowserNavigateInput): Promise<BrowserTabState>;
    control(input: BrowserControlInput): Promise<BrowserTabState>;
    takeControl(input: BrowserTakeControlInput): Promise<BrowserTabState>;
    respondPermission(input: BrowserPermissionDecisionInput): Promise<BrowserTabState>;
    respondSensitiveAction(input: BrowserSensitiveActionDecisionInput): Promise<BrowserTabState>;
    resolveDownload(input: BrowserDownloadDecisionInput): Promise<BrowserTabState>;
    respondDialog(input: BrowserDialogDecisionInput): Promise<BrowserTabState>;
    resolveFileChooser(input: BrowserFileChooserDecisionInput): Promise<BrowserTabState>;
    closeTab(input: BrowserTabRequest): Promise<BrowserCloseTabAck>;
    setLayout(update: BrowserLayoutUpdate): Promise<BrowserLayoutAck>;
    onTabsChanged(
      listener: (event: BrowserTabsChangedEvent) => void,
    ): () => void;
  };
}
