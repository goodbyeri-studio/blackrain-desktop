import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import type { BrowserViewManager } from "../browser/browser-view-manager";
import type { AppServerRuntime } from "../app-server/app-server-runtime";
import type { AppWindowRegistry } from "../security/window-registry";
import type { WorkspaceStore } from "../workspaces/workspace-store";
import type { SettingsStore } from "../settings/settings-store";
import type { FileService } from "../files/file-service";
import type { AccountSessionStore } from "../credentials/account-session-store";
import type { DesktopShellService } from "../shell/desktop-shell-service";
import type { DesktopDialogService } from "../dialog/desktop-dialog-service";
import { IPC_CHANNELS } from "../../shared/ipc";
import {
  AgentAppsListInputSchema,
  AgentThreadMutationInputSchema,
  AgentThreadNameInputSchema,
  AgentThreadReadInputSchema,
  AgentWorkspaceInputSchema,
} from "../../shared/desktop";

function assertMainFrame(event: IpcMainInvokeEvent): void {
  if (event.senderFrame !== event.sender.mainFrame) {
    throw new Error("只允许 App 主 frame 调用 IPC");
  }
}

export function registerIpcHandlers(
  registry: AppWindowRegistry,
  browser: BrowserViewManager,
  agent: AppServerRuntime,
  workspaces: WorkspaceStore,
  settings: SettingsStore,
  files: FileService,
  accountSessions: AccountSessionStore,
  desktopShell: DesktopShellService,
  desktopDialog: DesktopDialogService,
): () => void {

  const unsubscribeAgentEvents = agent.subscribeEvents((event) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
      try {
        registry.require(window.webContents.id, "main");
      } catch {
        continue;
      }
      window.webContents.send(IPC_CHANNELS.agentEvent, event);
    }
  });

  ipcMain.handle(IPC_CHANNELS.appBootstrap, (event) => {
    assertMainFrame(event);
    const sender = registry.require(event.sender.id, "main");
    return {
      version: app.getVersion(),
      platform: process.platform,
      windowGeneration: sender.generation,
    };
  });

  ipcMain.handle(IPC_CHANNELS.shellOpenExternal, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return desktopShell.openExternal(input);
  });

  ipcMain.handle(IPC_CHANNELS.shellRevealPath, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    desktopShell.revealPath(input);
  });

  ipcMain.handle(IPC_CHANNELS.dialogConfirm, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return desktopDialog.confirm(requireOwnerWindow(event), input);
  });

  ipcMain.handle(IPC_CHANNELS.dialogMessage, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return desktopDialog.message(requireOwnerWindow(event), input);
  });

  ipcMain.handle(IPC_CHANNELS.settingsGet, (event) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return settings.get();
  });

  ipcMain.handle(IPC_CHANNELS.settingsUpdate, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return settings.update(input);
  });

  ipcMain.handle(IPC_CHANNELS.filePick, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return files.pick(requireOwnerWindow(event), input);
  });

  ipcMain.handle(IPC_CHANNELS.fileSaveText, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return files.saveText(requireOwnerWindow(event), input);
  });

  ipcMain.handle(IPC_CHANNELS.fileReadImage, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return files.readImage(input);
  });

  ipcMain.handle(IPC_CHANNELS.fileListWorkspace, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return files.listWorkspace(input);
  });

  ipcMain.handle(IPC_CHANNELS.fileReadWorkspace, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return files.readWorkspace(input);
  });

  ipcMain.handle(IPC_CHANNELS.accountSessionGet, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return accountSessions.get(input);
  });

  ipcMain.handle(IPC_CHANNELS.accountSessionSet, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    accountSessions.set(input);
  });

  ipcMain.handle(IPC_CHANNELS.accountSessionClear, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    accountSessions.clear(input);
  });

  ipcMain.handle(IPC_CHANNELS.agentGetStatus, (event) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return agent.status();
  });

  ipcMain.handle(IPC_CHANNELS.workspaceList, (event) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return workspaces.list();
  });

  ipcMain.handle(IPC_CHANNELS.workspaceAdd, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return workspaces.add(input);
  });

  ipcMain.handle(IPC_CHANNELS.workspaceUpdate, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return workspaces.update(input);
  });

  ipcMain.handle(IPC_CHANNELS.workspaceRemove, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return workspaces.remove(input);
  });

  ipcMain.handle(IPC_CHANNELS.workspaceConnect, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return workspaces.connect(input);
  });

  ipcMain.handle(IPC_CHANNELS.workspaceIsDirectory, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return workspaces.isDirectory(input);
  });

  ipcMain.handle(IPC_CHANNELS.workspacePick, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return workspaces.pick(requireOwnerWindow(event), input);
  });

  ipcMain.handle(IPC_CHANNELS.agentGetEvents, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return agent.getEvents(input);
  });

  ipcMain.handle(IPC_CHANNELS.agentListThreads, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return agent.listThreads(input);
  });

  ipcMain.handle(IPC_CHANNELS.agentStartThread, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return agent.startThread(input);
  });

  ipcMain.handle(IPC_CHANNELS.agentResumeThread, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return agent.resumeThread(input);
  });

  ipcMain.handle(IPC_CHANNELS.agentStartTurn, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return agent.startTurn(input);
  });

  ipcMain.handle(IPC_CHANNELS.agentSteerTurn, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return agent.steerTurn(input);
  });

  ipcMain.handle(IPC_CHANNELS.agentInterruptTurn, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return agent.interruptTurn(input);
  });

  ipcMain.handle(IPC_CHANNELS.agentRespondServerRequest, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return agent.respondToServerRequest(input);
  });

  ipcMain.handle(IPC_CHANNELS.agentModelList, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    const request = AgentWorkspaceInputSchema.parse(input);
    workspaces.require(request.workspaceId);
    return agent.listModels();
  });

  ipcMain.handle(IPC_CHANNELS.agentConfigRead, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    const request = AgentWorkspaceInputSchema.parse(input);
    const workspace = workspaces.require(request.workspaceId);
    return agent.readConfig({ ...request, cwd: workspace.path });
  });

  ipcMain.handle(IPC_CHANNELS.agentCollaborationModeList, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    const request = AgentWorkspaceInputSchema.parse(input);
    workspaces.require(request.workspaceId);
    return agent.listCollaborationModes();
  });

  ipcMain.handle(IPC_CHANNELS.agentSkillsList, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    const request = AgentWorkspaceInputSchema.parse(input);
    const workspace = workspaces.require(request.workspaceId);
    return agent.listSkills({ ...request, cwd: workspace.path });
  });

  ipcMain.handle(IPC_CHANNELS.agentAppsList, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    const request = AgentAppsListInputSchema.parse(input);
    workspaces.require(request.workspaceId);
    return agent.listApps(request);
  });

  ipcMain.handle(IPC_CHANNELS.agentAccountRead, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    const request = AgentWorkspaceInputSchema.parse(input);
    workspaces.require(request.workspaceId);
    return agent.readAccount();
  });

  ipcMain.handle(IPC_CHANNELS.agentAccountRateLimitsRead, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    const request = AgentWorkspaceInputSchema.parse(input);
    workspaces.require(request.workspaceId);
    return agent.readAccountRateLimits();
  });

  ipcMain.handle(IPC_CHANNELS.agentThreadRead, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    const request = AgentThreadReadInputSchema.parse(input);
    workspaces.require(request.workspaceId);
    return agent.readThread(request);
  });

  ipcMain.handle(IPC_CHANNELS.agentThreadArchive, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    const request = AgentThreadMutationInputSchema.parse(input);
    workspaces.require(request.workspaceId);
    return agent.archiveThread(request);
  });

  ipcMain.handle(IPC_CHANNELS.agentThreadNameSet, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    const request = AgentThreadNameInputSchema.parse(input);
    workspaces.require(request.workspaceId);
    return agent.setThreadName(request);
  });

  ipcMain.handle(IPC_CHANNELS.browserCreateTab, (event, input: unknown) => {
    assertMainFrame(event);
    const sender = registry.require(event.sender.id, "main");
    return browser.createTab(requireOwnerWindow(event), sender.generation, input);
  });

  ipcMain.handle(IPC_CHANNELS.browserListTabs, (event, input: unknown) => {
    assertMainFrame(event);
    const sender = registry.require(event.sender.id, "main");
    return browser.listTabs(requireOwnerWindow(event), sender.generation, input);
  });

  ipcMain.handle(IPC_CHANNELS.browserNavigate, (event, input: unknown) => {
    assertMainFrame(event);
    const sender = registry.require(event.sender.id, "main");
    return browser.navigate(requireOwnerWindow(event), sender.generation, input);
  });

  ipcMain.handle(IPC_CHANNELS.browserControl, (event, input: unknown) => {
    assertMainFrame(event);
    const sender = registry.require(event.sender.id, "main");
    return browser.control(requireOwnerWindow(event), sender.generation, input);
  });

  ipcMain.handle(IPC_CHANNELS.browserTakeControl, (event, input: unknown) => {
    assertMainFrame(event);
    const sender = registry.require(event.sender.id, "main");
    return browser.takeControl(
      requireOwnerWindow(event),
      sender.generation,
      input,
    );
  });

  ipcMain.handle(IPC_CHANNELS.browserRespondPermission, (event, input: unknown) => {
    assertMainFrame(event);
    const sender = registry.require(event.sender.id, "main");
    return browser.respondPermission(
      requireOwnerWindow(event),
      sender.generation,
      input,
    );
  });

  ipcMain.handle(IPC_CHANNELS.browserResolveDownload, (event, input: unknown) => {
    assertMainFrame(event);
    const sender = registry.require(event.sender.id, "main");
    return browser.resolveDownload(
      requireOwnerWindow(event),
      sender.generation,
      input,
    );
  });

  ipcMain.handle(IPC_CHANNELS.browserRespondDialog, (event, input: unknown) => {
    assertMainFrame(event);
    const sender = registry.require(event.sender.id, "main");
    return browser.respondDialog(
      requireOwnerWindow(event),
      sender.generation,
      input,
    );
  });

  ipcMain.handle(
    IPC_CHANNELS.browserRespondSensitiveAction,
    (event, input: unknown) => {
      assertMainFrame(event);
      const sender = registry.require(event.sender.id, "main");
      return browser.respondSensitiveAction(
        requireOwnerWindow(event),
        sender.generation,
        input,
      );
    },
  );

  ipcMain.handle(IPC_CHANNELS.agentUnsubscribeThread, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return agent.unsubscribeThread(input);
  });

  ipcMain.handle(IPC_CHANNELS.browserResolveFileChooser, (event, input: unknown) => {
    assertMainFrame(event);
    const sender = registry.require(event.sender.id, "main");
    return browser.resolveFileChooser(
      requireOwnerWindow(event),
      sender.generation,
      input,
    );
  });

  ipcMain.handle(IPC_CHANNELS.browserCloseTab, (event, input: unknown) => {
    assertMainFrame(event);
    const sender = registry.require(event.sender.id, "main");
    return browser.closeTab(requireOwnerWindow(event), sender.generation, input);
  });

  ipcMain.handle(IPC_CHANNELS.browserSetLayout, (event, input: unknown) => {
    assertMainFrame(event);
    const sender = registry.require(event.sender.id, "main");
    return browser.setLayout(requireOwnerWindow(event), sender.generation, input);
  });

  return () => {
    unsubscribeAgentEvents();
    ipcMain.removeHandler(IPC_CHANNELS.appBootstrap);
    ipcMain.removeHandler(IPC_CHANNELS.shellOpenExternal);
    ipcMain.removeHandler(IPC_CHANNELS.shellRevealPath);
    ipcMain.removeHandler(IPC_CHANNELS.settingsGet);
    ipcMain.removeHandler(IPC_CHANNELS.settingsUpdate);
    ipcMain.removeHandler(IPC_CHANNELS.filePick);
    ipcMain.removeHandler(IPC_CHANNELS.fileSaveText);
    ipcMain.removeHandler(IPC_CHANNELS.fileReadImage);
    ipcMain.removeHandler(IPC_CHANNELS.fileListWorkspace);
    ipcMain.removeHandler(IPC_CHANNELS.fileReadWorkspace);
    ipcMain.removeHandler(IPC_CHANNELS.accountSessionGet);
    ipcMain.removeHandler(IPC_CHANNELS.accountSessionSet);
    ipcMain.removeHandler(IPC_CHANNELS.accountSessionClear);
    ipcMain.removeHandler(IPC_CHANNELS.workspaceList);
    ipcMain.removeHandler(IPC_CHANNELS.workspaceAdd);
    ipcMain.removeHandler(IPC_CHANNELS.workspaceUpdate);
    ipcMain.removeHandler(IPC_CHANNELS.workspaceRemove);
    ipcMain.removeHandler(IPC_CHANNELS.workspaceConnect);
    ipcMain.removeHandler(IPC_CHANNELS.workspaceIsDirectory);
    ipcMain.removeHandler(IPC_CHANNELS.workspacePick);
    ipcMain.removeHandler(IPC_CHANNELS.agentGetStatus);
    ipcMain.removeHandler(IPC_CHANNELS.agentGetEvents);
    ipcMain.removeHandler(IPC_CHANNELS.agentListThreads);
    ipcMain.removeHandler(IPC_CHANNELS.agentStartThread);
    ipcMain.removeHandler(IPC_CHANNELS.agentResumeThread);
    ipcMain.removeHandler(IPC_CHANNELS.agentUnsubscribeThread);
    ipcMain.removeHandler(IPC_CHANNELS.agentStartTurn);
    ipcMain.removeHandler(IPC_CHANNELS.agentSteerTurn);
    ipcMain.removeHandler(IPC_CHANNELS.agentInterruptTurn);
    ipcMain.removeHandler(IPC_CHANNELS.agentRespondServerRequest);
    ipcMain.removeHandler(IPC_CHANNELS.agentModelList);
    ipcMain.removeHandler(IPC_CHANNELS.agentConfigRead);
    ipcMain.removeHandler(IPC_CHANNELS.agentCollaborationModeList);
    ipcMain.removeHandler(IPC_CHANNELS.agentSkillsList);
    ipcMain.removeHandler(IPC_CHANNELS.agentAppsList);
    ipcMain.removeHandler(IPC_CHANNELS.agentAccountRead);
    ipcMain.removeHandler(IPC_CHANNELS.agentAccountRateLimitsRead);
    ipcMain.removeHandler(IPC_CHANNELS.agentThreadRead);
    ipcMain.removeHandler(IPC_CHANNELS.agentThreadArchive);
    ipcMain.removeHandler(IPC_CHANNELS.agentThreadNameSet);
    ipcMain.removeHandler(IPC_CHANNELS.browserCreateTab);
    ipcMain.removeHandler(IPC_CHANNELS.browserListTabs);
    ipcMain.removeHandler(IPC_CHANNELS.browserNavigate);
    ipcMain.removeHandler(IPC_CHANNELS.browserControl);
    ipcMain.removeHandler(IPC_CHANNELS.browserTakeControl);
    ipcMain.removeHandler(IPC_CHANNELS.browserRespondPermission);
    ipcMain.removeHandler(IPC_CHANNELS.browserRespondSensitiveAction);
    ipcMain.removeHandler(IPC_CHANNELS.browserResolveDownload);
    ipcMain.removeHandler(IPC_CHANNELS.browserRespondDialog);
    ipcMain.removeHandler(IPC_CHANNELS.browserResolveFileChooser);
    ipcMain.removeHandler(IPC_CHANNELS.browserCloseTab);
    ipcMain.removeHandler(IPC_CHANNELS.browserSetLayout);
  };
}

function requireOwnerWindow(event: IpcMainInvokeEvent): BrowserWindow {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) {
    throw new Error("IPC sender 没有可用的 owner window");
  }
  return window;
}
