import { z } from "zod";

export const IPC_CHANNELS = {
  appBootstrap: "app:get-bootstrap",
  agentGetStatus: "agent:get-status",
  agentStartThread: "agent:start-thread",
  agentResumeThread: "agent:resume-thread",
  agentStartTurn: "agent:start-turn",
  agentInterruptTurn: "agent:interrupt-turn",
  browserCreateTab: "browser:create-tab",
  browserListTabs: "browser:list-tabs",
  browserNavigate: "browser:navigate",
  browserControl: "browser:control",
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
