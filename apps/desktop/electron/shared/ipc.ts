import { z } from "zod";

export const IPC_CHANNELS = {
  appBootstrap: "app:get-bootstrap",
  workspaceList: "workspace:list",
  workspaceAdd: "workspace:add",
  workspaceUpdate: "workspace:update",
  workspaceRemove: "workspace:remove",
  workspaceConnect: "workspace:connect",
  workspaceIsDirectory: "workspace:is-directory",
  workspacePick: "workspace:pick",
  agentGetStatus: "agent:get-status",
  agentGetEvents: "agent:get-events",
  agentEvent: "agent:event",
  agentListThreads: "agent:list-threads",
  agentStartThread: "agent:start-thread",
  agentResumeThread: "agent:resume-thread",
  agentUnsubscribeThread: "agent:unsubscribe-thread",
  agentStartTurn: "agent:start-turn",
  agentSteerTurn: "agent:steer-turn",
  agentInterruptTurn: "agent:interrupt-turn",
  agentRespondServerRequest: "agent:respond-server-request",
  browserCreateTab: "browser:create-tab",
  browserListTabs: "browser:list-tabs",
  browserNavigate: "browser:navigate",
  browserControl: "browser:control",
  browserTakeControl: "browser:take-control",
  browserRespondPermission: "browser:respond-permission",
  browserRespondSensitiveAction: "browser:respond-sensitive-action",
  browserResolveDownload: "browser:resolve-download",
  browserRespondDialog: "browser:respond-dialog",
  browserResolveFileChooser: "browser:resolve-file-chooser",
  browserCloseTab: "browser:close-tab",
  browserSetLayout: "browser:set-layout",
  browserTabsChanged: "browser:tabs-changed",
} as const;

export const BootstrapInfoSchema = z.object({
  version: z.string().min(1),
  platform: z.enum(["win32", "darwin", "linux"]),
  windowGeneration: z.number().int().positive(),
});

export type BootstrapInfo = z.infer<typeof BootstrapInfoSchema>;
