import { contextBridge, ipcRenderer } from "electron";
import {
  AgentRuntimeStatusSchema,
  AgentThreadAckSchema,
  AgentThreadResumeInputSchema,
  AgentThreadStartInputSchema,
  AgentTurnAckSchema,
  AgentTurnInterruptInputSchema,
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
  BrowserNavigateInputSchema,
  BrowserRouteScopeSchema,
  BrowserTabListSchema,
  BrowserTabRequestSchema,
  BrowserTabStateSchema,
  BrowserTabsChangedEventSchema,
} from "../shared/browser-tabs";
import type { BlackRainHostApi } from "../shared/host-api";
import { BootstrapInfoSchema, IPC_CHANNELS } from "../shared/ipc";

const api: BlackRainHostApi = {
  app: {
    async getBootstrap() {
      return BootstrapInfoSchema.parse(
        await ipcRenderer.invoke(IPC_CHANNELS.appBootstrap),
      );
    },
  },
  agent: {
    async getStatus() {
      return AgentRuntimeStatusSchema.parse(
        await ipcRenderer.invoke(IPC_CHANNELS.agentGetStatus),
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
    async startTurn(input) {
      return AgentTurnAckSchema.parse(
        await ipcRenderer.invoke(
          IPC_CHANNELS.agentStartTurn,
          AgentTurnStartInputSchema.parse(input),
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
