import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import type { BrowserViewManager } from "../browser/browser-view-manager";
import type { AppServerRuntime } from "../app-server/app-server-runtime";
import type { AppWindowRegistry } from "../security/window-registry";
import type { WorkspaceStore } from "../workspaces/workspace-store";
import { IPC_CHANNELS } from "../../shared/ipc";

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
