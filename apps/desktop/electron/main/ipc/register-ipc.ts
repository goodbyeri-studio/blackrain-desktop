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
import type { RuntimeBootstrapCoordinator } from "../app/runtime-bootstrap";
import type { GitService } from "../git/git-service";
import type { TerminalService } from "../terminal/terminal-service";
import type { SystemUiService } from "../app/system-ui-service";
import type { UpdateService } from "../updates/update-service";
import { IPC_CHANNELS } from "../../shared/ipc";
import { AgentAccountInputSchema } from "../../shared/agent";
import {
  AgentAppsListInputSchema,
  AgentThreadMutationInputSchema,
  AgentThreadNameInputSchema,
  AgentThreadReadInputSchema,
  AgentWorkspaceInputSchema,
} from "../../shared/desktop";
import {
  AgentExperimentalFeatureListInputSchema,
  AgentExperimentalFeatureSetInputSchema,
  AgentMcpServerStatusInputSchema,
  AgentReviewStartInputSchema,
  AgentThreadOperationInputSchema,
  AgentThreadRollbackInputSchema,
} from "../../shared/agent";

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
  runtimeBootstrap: RuntimeBootstrapCoordinator,
  git: GitService,
  terminal: TerminalService,
  systemUi: SystemUiService,
  updates: UpdateService,
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
      runtime: runtimeBootstrap.status(),
    };
  });
  const unsubscribeTerminalEvents = terminal.subscribe((terminalEvent) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
      try {
        registry.require(window.webContents.id, "main");
      } catch {
        continue;
      }
      window.webContents.send(IPC_CHANNELS.terminalEvent, terminalEvent);
    }
  });
  const unsubscribeSystemUiEvents = systemUi.subscribe((systemEvent) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
      try {
        registry.require(window.webContents.id, "main");
      } catch {
        continue;
      }
      window.webContents.send(IPC_CHANNELS.systemUiEvent, systemEvent);
    }
  });

  ipcMain.handle(IPC_CHANNELS.appInitialize, (event) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return runtimeBootstrap.initialize();
  });

  ipcMain.handle(IPC_CHANNELS.appRetry, (event) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return runtimeBootstrap.initialize(true);
  });

  ipcMain.handle(IPC_CHANNELS.appExportDiagnostics, (event) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return files.saveText(requireOwnerWindow(event), runtimeBootstrap.exportDiagnostics());
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

  ipcMain.handle(IPC_CHANNELS.menuPopup, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return systemUi.popupContextMenu(requireOwnerWindow(event), input);
  });
  ipcMain.handle(IPC_CHANNELS.menuSetAccelerators, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    systemUi.setAccelerators(input);
  });
  ipcMain.handle(IPC_CHANNELS.traySetRecentThreads, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    systemUi.setRecentThreads(input);
  });
  ipcMain.handle(IPC_CHANNELS.traySetSessionUsage, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    systemUi.setSessionUsage(input);
  });

  ipcMain.handle(IPC_CHANNELS.notificationShow, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    systemUi.showNotification(input);
  });

  ipcMain.handle(IPC_CHANNELS.updateCheck, (event) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return updates.check();
  });
  ipcMain.handle(IPC_CHANNELS.updateDownload, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return updates.download(input);
  });
  ipcMain.handle(IPC_CHANNELS.updateInstall, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return updates.install(input);
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

  ipcMain.handle(IPC_CHANNELS.fileWriteWorkspace, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    files.writeWorkspace(input);
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

  const gitHandlers: Array<[string, (input: unknown) => unknown]> = [
    [IPC_CHANNELS.gitStatus, (input) => git.status(input)],
    [IPC_CHANNELS.gitInit, (input) => git.init(input)],
    [IPC_CHANNELS.gitCreateRepository, (input) => git.createGitHubRepository(input)],
    [IPC_CHANNELS.gitRoots, (input) => git.roots(input)],
    [IPC_CHANNELS.gitDiffs, (input) => git.diffs(input)],
    [IPC_CHANNELS.gitLog, (input) => git.log(input)],
    [IPC_CHANNELS.gitCommitDiff, (input) => git.commitDiff(input)],
    [IPC_CHANNELS.gitRemote, (input) => git.remote(input)],
    [IPC_CHANNELS.gitStageFile, (input) => git.stageFile(input)],
    [IPC_CHANNELS.gitStageAll, (input) => git.stageAll(input)],
    [IPC_CHANNELS.gitUnstageFile, (input) => git.unstageFile(input)],
    [IPC_CHANNELS.gitRevertFile, (input) => git.revertFile(input)],
    [IPC_CHANNELS.gitRevertAll, (input) => git.revertAll(input)],
    [IPC_CHANNELS.gitCommit, (input) => git.commit(input)],
    [IPC_CHANNELS.gitPush, (input) => git.push(input)],
    [IPC_CHANNELS.gitPull, (input) => git.pull(input)],
    [IPC_CHANNELS.gitFetch, (input) => git.fetch(input)],
    [IPC_CHANNELS.gitSync, (input) => git.sync(input)],
    [IPC_CHANNELS.gitBranches, (input) => git.branches(input)],
    [IPC_CHANNELS.gitCheckoutBranch, (input) => git.checkoutBranch(input)],
    [IPC_CHANNELS.gitCreateBranch, (input) => git.createBranch(input)],
    [IPC_CHANNELS.gitIssues, (input) => git.issues(input)],
    [IPC_CHANNELS.gitPullRequests, (input) => git.pullRequests(input)],
    [IPC_CHANNELS.gitPullRequestDiff, (input) => git.pullRequestDiff(input)],
    [IPC_CHANNELS.gitPullRequestComments, (input) => git.pullRequestComments(input)],
    [IPC_CHANNELS.gitCheckoutPullRequest, (input) => git.checkoutPullRequest(input)],
  ];
  for (const [channel, handler] of gitHandlers) {
    ipcMain.handle(channel, (event, input: unknown) => {
      assertMainFrame(event);
      registry.require(event.sender.id, "main");
      return handler(input);
    });
  }

  ipcMain.handle(IPC_CHANNELS.terminalOpen, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return terminal.open(input);
  });
  ipcMain.handle(IPC_CHANNELS.terminalWrite, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return terminal.write(input);
  });
  ipcMain.handle(IPC_CHANNELS.terminalResize, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return terminal.resize(input);
  });
  ipcMain.handle(IPC_CHANNELS.terminalClose, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    return terminal.close(input);
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

  ipcMain.handle(IPC_CHANNELS.agentReviewStart, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    const request = AgentReviewStartInputSchema.parse(input);
    workspaces.require(request.workspaceId);
    return agent.startReview(request);
  });

  ipcMain.handle(IPC_CHANNELS.agentExperimentalFeatureList, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    const request = AgentExperimentalFeatureListInputSchema.parse(input);
    workspaces.require(request.workspaceId);
    return agent.listExperimentalFeatures(request);
  });

  ipcMain.handle(IPC_CHANNELS.agentExperimentalFeatureSet, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    const request = AgentExperimentalFeatureSetInputSchema.parse(input);
    workspaces.require(request.workspaceId);
    return agent.setExperimentalFeature(request);
  });

  ipcMain.handle(IPC_CHANNELS.agentThreadFork, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    const request = AgentThreadOperationInputSchema.parse(input);
    workspaces.require(request.workspaceId);
    return agent.forkThread(request);
  });

  ipcMain.handle(IPC_CHANNELS.agentThreadCompact, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    const request = AgentThreadOperationInputSchema.parse(input);
    workspaces.require(request.workspaceId);
    return agent.compactThread(request);
  });

  ipcMain.handle(IPC_CHANNELS.agentThreadRollback, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    const request = AgentThreadRollbackInputSchema.parse(input);
    workspaces.require(request.workspaceId);
    return agent.rollbackThread(request);
  });

  ipcMain.handle(IPC_CHANNELS.agentMcpServerStatusList, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    const request = AgentMcpServerStatusInputSchema.parse(input);
    workspaces.require(request.workspaceId);
    return agent.listMcpServerStatus(request);
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

  ipcMain.handle(IPC_CHANNELS.agentAccountLoginStart, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    const request = AgentAccountInputSchema.parse(input);
    workspaces.require(request.workspaceId);
    return agent.startAccountLogin(request);
  });

  ipcMain.handle(IPC_CHANNELS.agentAccountLoginCancel, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    const request = AgentAccountInputSchema.parse(input);
    workspaces.require(request.workspaceId);
    return agent.cancelAccountLogin(request);
  });

  ipcMain.handle(IPC_CHANNELS.agentAccountLogout, (event, input: unknown) => {
    assertMainFrame(event);
    registry.require(event.sender.id, "main");
    const request = AgentAccountInputSchema.parse(input);
    workspaces.require(request.workspaceId);
    return agent.logoutAccount(request);
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
    unsubscribeTerminalEvents();
    unsubscribeSystemUiEvents();
    ipcMain.removeHandler(IPC_CHANNELS.appBootstrap);
    ipcMain.removeHandler(IPC_CHANNELS.appInitialize);
    ipcMain.removeHandler(IPC_CHANNELS.appRetry);
    ipcMain.removeHandler(IPC_CHANNELS.appExportDiagnostics);
    ipcMain.removeHandler(IPC_CHANNELS.shellOpenExternal);
    ipcMain.removeHandler(IPC_CHANNELS.shellRevealPath);
    ipcMain.removeHandler(IPC_CHANNELS.dialogConfirm);
    ipcMain.removeHandler(IPC_CHANNELS.dialogMessage);
    ipcMain.removeHandler(IPC_CHANNELS.menuPopup);
    ipcMain.removeHandler(IPC_CHANNELS.menuSetAccelerators);
    ipcMain.removeHandler(IPC_CHANNELS.traySetRecentThreads);
    ipcMain.removeHandler(IPC_CHANNELS.traySetSessionUsage);
    ipcMain.removeHandler(IPC_CHANNELS.notificationShow);
    ipcMain.removeHandler(IPC_CHANNELS.updateCheck);
    ipcMain.removeHandler(IPC_CHANNELS.updateDownload);
    ipcMain.removeHandler(IPC_CHANNELS.updateInstall);
    ipcMain.removeHandler(IPC_CHANNELS.settingsGet);
    ipcMain.removeHandler(IPC_CHANNELS.settingsUpdate);
    ipcMain.removeHandler(IPC_CHANNELS.filePick);
    ipcMain.removeHandler(IPC_CHANNELS.fileSaveText);
    ipcMain.removeHandler(IPC_CHANNELS.fileReadImage);
    ipcMain.removeHandler(IPC_CHANNELS.fileListWorkspace);
    ipcMain.removeHandler(IPC_CHANNELS.fileReadWorkspace);
    ipcMain.removeHandler(IPC_CHANNELS.fileWriteWorkspace);
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
    for (const [channel] of gitHandlers) ipcMain.removeHandler(channel);
    ipcMain.removeHandler(IPC_CHANNELS.terminalOpen);
    ipcMain.removeHandler(IPC_CHANNELS.terminalWrite);
    ipcMain.removeHandler(IPC_CHANNELS.terminalResize);
    ipcMain.removeHandler(IPC_CHANNELS.terminalClose);
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
    ipcMain.removeHandler(IPC_CHANNELS.agentAccountLoginStart);
    ipcMain.removeHandler(IPC_CHANNELS.agentAccountLoginCancel);
    ipcMain.removeHandler(IPC_CHANNELS.agentAccountLogout);
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
