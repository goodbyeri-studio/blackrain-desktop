import { contextBridge, ipcRenderer } from "electron";
import { z } from "zod";
import {
  AgentEventBatchSchema,
  AgentEventCursorInputSchema,
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
  WorkspaceFileListSchema,
} from "../shared/desktop";
import { BootstrapInfoSchema, IPC_CHANNELS } from "../shared/ipc";
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

const api: BlackRainHostApi = {
  app: {
    async getBootstrap() {
      return BootstrapInfoSchema.parse(
        await ipcRenderer.invoke(IPC_CHANNELS.appBootstrap),
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
