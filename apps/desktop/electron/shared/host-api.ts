import type { BrowserLayoutAck, BrowserLayoutUpdate } from "./browser-layout";
import type {
  BrowserCloseTabAck,
  BrowserControlInput,
  BrowserCreateTabInput,
  BrowserDownloadDecisionInput,
  BrowserDialogDecisionInput,
  BrowserNavigateInput,
  BrowserPermissionDecisionInput,
  BrowserRouteScope,
  BrowserTabRequest,
  BrowserTabState,
  BrowserTakeControlInput,
  BrowserTabsChangedEvent,
} from "./browser-tabs";
import type { BootstrapInfo } from "./ipc";
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
  AgentThreadAck,
  AgentThreadListInput,
  AgentThreadListResponse,
  AgentThreadResumeInput,
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
    startTurn(input: AgentTurnStartInput): Promise<AgentTurnAck>;
    steerTurn(input: AgentTurnSteerInput): Promise<AgentTurnAck>;
    interruptTurn(input: AgentTurnInterruptInput): Promise<AgentTurnAck>;
  };
  browser: {
    createTab(input: BrowserCreateTabInput): Promise<BrowserTabState>;
    listTabs(scope: BrowserRouteScope): Promise<BrowserTabState[]>;
    navigate(input: BrowserNavigateInput): Promise<BrowserTabState>;
    control(input: BrowserControlInput): Promise<BrowserTabState>;
    takeControl(input: BrowserTakeControlInput): Promise<BrowserTabState>;
    respondPermission(input: BrowserPermissionDecisionInput): Promise<BrowserTabState>;
    resolveDownload(input: BrowserDownloadDecisionInput): Promise<BrowserTabState>;
    respondDialog(input: BrowserDialogDecisionInput): Promise<BrowserTabState>;
    closeTab(input: BrowserTabRequest): Promise<BrowserCloseTabAck>;
    setLayout(update: BrowserLayoutUpdate): Promise<BrowserLayoutAck>;
    onTabsChanged(
      listener: (event: BrowserTabsChangedEvent) => void,
    ): () => void;
  };
}
