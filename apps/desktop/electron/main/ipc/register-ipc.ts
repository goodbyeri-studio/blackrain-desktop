import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import type { BrowserViewManager } from "../browser/browser-view-manager";
import type { AppServerRuntime } from "../app-server/app-server-runtime";
import type { AppWindowRegistry } from "../security/window-registry";
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
): () => void {

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

  ipcMain.handle(IPC_CHANNELS.agentInterruptTurn, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return agent.interruptTurn(input);
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
    ipcMain.removeHandler(IPC_CHANNELS.appBootstrap);
    ipcMain.removeHandler(IPC_CHANNELS.agentGetStatus);
    ipcMain.removeHandler(IPC_CHANNELS.agentStartThread);
    ipcMain.removeHandler(IPC_CHANNELS.agentResumeThread);
    ipcMain.removeHandler(IPC_CHANNELS.agentStartTurn);
    ipcMain.removeHandler(IPC_CHANNELS.agentInterruptTurn);
    ipcMain.removeHandler(IPC_CHANNELS.browserCreateTab);
    ipcMain.removeHandler(IPC_CHANNELS.browserListTabs);
    ipcMain.removeHandler(IPC_CHANNELS.browserNavigate);
    ipcMain.removeHandler(IPC_CHANNELS.browserControl);
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
