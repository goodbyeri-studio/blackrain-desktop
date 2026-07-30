import type { BrowserLayoutAck, BrowserLayoutUpdate } from "./browser-layout";
import type {
  BrowserCloseTabAck,
  BrowserControlInput,
  BrowserCreateTabInput,
  BrowserNavigateInput,
  BrowserRouteScope,
  BrowserTabRequest,
  BrowserTabState,
  BrowserTabsChangedEvent,
} from "./browser-tabs";
import type { BootstrapInfo } from "./ipc";
import type {
  AgentRuntimeStatus,
  AgentThreadAck,
  AgentThreadResumeInput,
  AgentThreadStartInput,
  AgentTurnAck,
  AgentTurnInterruptInput,
  AgentTurnStartInput,
} from "./agent";

export interface BlackRainHostApi {
  app: {
    getBootstrap(): Promise<BootstrapInfo>;
  };
  agent: {
    getStatus(): Promise<AgentRuntimeStatus>;
    startThread(input: AgentThreadStartInput): Promise<AgentThreadAck>;
    resumeThread(input: AgentThreadResumeInput): Promise<AgentThreadAck>;
    startTurn(input: AgentTurnStartInput): Promise<AgentTurnAck>;
    interruptTurn(input: AgentTurnInterruptInput): Promise<AgentTurnAck>;
  };
  browser: {
    createTab(input: BrowserCreateTabInput): Promise<BrowserTabState>;
    listTabs(scope: BrowserRouteScope): Promise<BrowserTabState[]>;
    navigate(input: BrowserNavigateInput): Promise<BrowserTabState>;
    control(input: BrowserControlInput): Promise<BrowserTabState>;
    closeTab(input: BrowserTabRequest): Promise<BrowserCloseTabAck>;
    setLayout(update: BrowserLayoutUpdate): Promise<BrowserLayoutAck>;
    onTabsChanged(
      listener: (event: BrowserTabsChangedEvent) => void,
    ): () => void;
  };
}
