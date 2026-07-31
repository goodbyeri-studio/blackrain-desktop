import type { AccessMode, AppMention, ServiceTier } from "@/types";
import { getOptionalHostClient } from "@/host/client";
import {
  interruptTurn as interruptTurnTauri,
  listThreads as listThreadsTauri,
  resumeThread as resumeThreadTauri,
  sendUserMessage as sendUserMessageTauri,
  startThread as startThreadTauri,
  steerTurn as steerTurnTauri,
} from "./tauri";

export async function listThreads(
  workspaceId: string,
  cursor?: string | null,
  limit?: number | null,
  sortKey?: "created_at" | "updated_at" | null,
) {
  const host = getOptionalHostClient();
  return host
    ? host.agent.listThreads({ workspaceId, cursor, limit, sortKey })
    : listThreadsTauri(workspaceId, cursor, limit, sortKey);
}

export type AgentTurnOptions = {
  cwd?: string;
  model?: string | null;
  effort?: string | null;
  serviceTier?: ServiceTier | null | undefined;
  accessMode?: AccessMode;
  images?: string[];
  collaborationMode?: Record<string, unknown> | null;
  appMentions?: AppMention[];
};

export async function startThread(workspaceId: string, cwd?: string) {
  const host = getOptionalHostClient();
  if (!host) return startThreadTauri(workspaceId);
  if (!cwd) throw new Error("Electron thread/start 缺少 workspace path");
  const response = await host.agent.startThread({ workspaceId, cwd });
  return { thread: response.thread ?? { id: response.threadId } };
}

export async function resumeThread(
  workspaceId: string,
  threadId: string,
  cwd?: string,
) {
  const host = getOptionalHostClient();
  if (!host) return resumeThreadTauri(workspaceId, threadId);
  const response = await host.agent.resumeThread({ workspaceId, threadId, cwd });
  return { thread: response.thread ?? { id: response.threadId } };
}

export async function sendUserMessage(
  workspaceId: string,
  threadId: string,
  text: string,
  options?: AgentTurnOptions,
) {
  const host = getOptionalHostClient();
  if (!host) {
    const { cwd: _cwd, ...tauriOptions } = options ?? {};
    return sendUserMessageTauri(workspaceId, threadId, text, tauriOptions);
  }
  const response = await host.agent.startTurn({
    threadId,
    prompt: text,
    cwd: options?.cwd,
    model: options?.model,
    effort: options?.effort,
    serviceTier: options?.serviceTier,
    accessMode: options?.accessMode,
    images: options?.images,
    appMentions: options?.appMentions,
  });
  return { turn: { id: response.turnId } };
}

export async function steerTurn(
  workspaceId: string,
  threadId: string,
  turnId: string,
  text: string,
  images?: string[],
  appMentions?: AppMention[],
) {
  const host = getOptionalHostClient();
  if (!host) {
    return appMentions && appMentions.length > 0
      ? steerTurnTauri(
        workspaceId,
        threadId,
        turnId,
        text,
        images,
        appMentions,
      )
      : steerTurnTauri(workspaceId, threadId, turnId, text, images);
  }
  const response = await host.agent.steerTurn({
    threadId,
    turnId,
    prompt: text,
    images,
    appMentions,
  });
  return { turnId: response.turnId };
}

export async function interruptTurn(
  workspaceId: string,
  threadId: string,
  turnId: string,
) {
  const host = getOptionalHostClient();
  if (!host) return interruptTurnTauri(workspaceId, threadId, turnId);
  return host.agent.interruptTurn({ threadId, turnId });
}
