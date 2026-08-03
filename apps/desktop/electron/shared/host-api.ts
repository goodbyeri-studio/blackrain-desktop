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
import type { BootstrapInfo } from "./ipc";
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
} from "./desktop";
import type {
  WorkspaceIdInput,
  WorkspaceInfo,
  WorkspacePathInput,
  WorkspacePickInput,
  WorkspaceUpdateInput,
} from "./workspaces";
import type {
  AgentEvent,
  AgentEventBatch,
  AgentEventCursorInput,
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

export interface BlackRainHostApi {
  app: {
    getBootstrap(): Promise<BootstrapInfo>;
  };
  shell: {
    openExternal(input: ExternalUrlInput): Promise<void>;
    revealPath(input: FilePathInput): Promise<void>;
  };
  dialog: {
    confirm(input: DialogConfirmInput): Promise<boolean>;
    message(input: DialogMessageInput): Promise<void>;
  };
  settings: {
    get(): Promise<HostJsonObject>;
    update(input: SettingsUpdateInput): Promise<HostJsonObject>;
  };
  files: {
    pick(input: FilePickInput): Promise<string[]>;
    saveText(input: FileSaveTextInput): Promise<string | null>;
    readImage(input: FilePathInput): Promise<string>;
    listWorkspace(input: AgentWorkspaceInput): Promise<string[]>;
    readWorkspace(input: WorkspaceFileInput): Promise<FileReadResponse>;
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
    respondToServerRequest(input: AgentServerRequestResponseInput): Promise<AgentServerRequestResponseAck>;
    listModels(input: AgentWorkspaceInput): Promise<HostJsonObject>;
    readConfig(input: AgentWorkspaceInput): Promise<HostJsonObject>;
    listCollaborationModes(input: AgentWorkspaceInput): Promise<HostJsonObject>;
    listSkills(input: AgentWorkspaceInput): Promise<HostJsonObject>;
    listApps(input: AgentAppsListInput): Promise<HostJsonObject>;
    readAccount(input: AgentWorkspaceInput): Promise<HostJsonObject>;
    readAccountRateLimits(input: AgentWorkspaceInput): Promise<HostJsonObject>;
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
