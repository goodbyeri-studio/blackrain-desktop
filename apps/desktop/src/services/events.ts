import type {
  AppServerEvent,
  DictationEvent,
  DictationModelStatus,
  TrayOpenThreadPayload,
} from "../types";
import type { AgentEvent } from "../../electron/shared/agent";
import type { TerminalEvent } from "../../electron/shared/terminal";
import { getOptionalHostClient } from "../host/client";

export type Unsubscribe = () => void;

export type TerminalOutputEvent = {
  workspaceId: string;
  terminalId: string;
  data: string;
};

export type TerminalExitEvent = {
  workspaceId: string;
  terminalId: string;
};

type SubscriptionOptions = {
  onError?: (error: unknown) => void;
};

type Listener<T> = (payload: T) => void;
let ensureSystemUiEvents = () => undefined;

function createEventHub<T>(eventName: string) {
  const listeners = new Set<Listener<T>>();
  void eventName;

  const subscribe = (
    onEvent: Listener<T>,
    options?: SubscriptionOptions,
  ): Unsubscribe => {
    ensureSystemUiEvents();
    listeners.add(onEvent);
    void options;
    return () => {
      listeners.delete(onEvent);
    };
  };

  const emit = (payload: T) => {
    for (const listener of listeners) listener(payload);
  };
  return { emit, subscribe };
}

const electronAppServerHub = createElectronAppServerEventHub();
const dictationDownloadHub = createEventHub<DictationModelStatus>("dictation-download");
const dictationEventHub = createEventHub<DictationEvent>("dictation-event");
const electronTerminalHub = createElectronTerminalEventHub();
const updaterCheckHub = createEventHub<void>("updater-check");
const trayOpenThreadHub = createEventHub<TrayOpenThreadPayload>("tray-open-thread");
const menuNewAgentHub = createEventHub<void>("menu-new-agent");
const menuNewWorktreeAgentHub = createEventHub<void>("menu-new-worktree-agent");
const menuNewCloneAgentHub = createEventHub<void>("menu-new-clone-agent");
const menuAddWorkspaceHub = createEventHub<void>("menu-add-workspace");
const menuAddWorkspaceFromUrlHub = createEventHub<void>("menu-add-workspace-from-url");
const menuOpenSettingsHub = createEventHub<void>("menu-open-settings");
const menuToggleProjectsSidebarHub = createEventHub<void>("menu-toggle-projects-sidebar");
const menuToggleGitSidebarHub = createEventHub<void>("menu-toggle-git-sidebar");
const menuToggleDebugPanelHub = createEventHub<void>("menu-toggle-debug-panel");
const menuToggleTerminalHub = createEventHub<void>("menu-toggle-terminal");
const menuNextAgentHub = createEventHub<void>("menu-next-agent");
const menuPrevAgentHub = createEventHub<void>("menu-prev-agent");
const menuNextWorkspaceHub = createEventHub<void>("menu-next-workspace");
const menuPrevWorkspaceHub = createEventHub<void>("menu-prev-workspace");
const menuCycleModelHub = createEventHub<void>("menu-composer-cycle-model");
const menuCycleAccessHub = createEventHub<void>("menu-composer-cycle-access");
const menuCycleReasoningHub = createEventHub<void>("menu-composer-cycle-reasoning");
const menuCycleCollaborationHub = createEventHub<void>("menu-composer-cycle-collaboration");
const menuComposerCycleModelHub = createEventHub<void>("menu-composer-cycle-model");
const menuComposerCycleAccessHub = createEventHub<void>("menu-composer-cycle-access");
const menuComposerCycleReasoningHub = createEventHub<void>("menu-composer-cycle-reasoning");
const menuComposerCycleCollaborationHub = createEventHub<void>(
  "menu-composer-cycle-collaboration",
);

let stopSystemUiEvents: Unsubscribe | null = null;
ensureSystemUiEvents = () => {
  const host = getOptionalHostClient();
  if (!host?.menu.onEvent || stopSystemUiEvents) return;
  stopSystemUiEvents = host.menu.onEvent((event) => {
    if (event.kind === "tray-open-thread") {
      trayOpenThreadHub.emit({
        workspaceId: event.workspaceId,
        threadId: event.threadId,
      });
      return;
    }
    const hubs = new Map<string, { emit(payload: void): void }>([
      ["file_new_agent", menuNewAgentHub],
      ["file_new_worktree_agent", menuNewWorktreeAgentHub],
      ["file_new_clone_agent", menuNewCloneAgentHub],
      ["view_toggle_projects_sidebar", menuToggleProjectsSidebarHub],
      ["view_toggle_git_sidebar", menuToggleGitSidebarHub],
      ["view_toggle_debug_panel", menuToggleDebugPanelHub],
      ["view_toggle_terminal", menuToggleTerminalHub],
      ["view_next_agent", menuNextAgentHub],
      ["view_prev_agent", menuPrevAgentHub],
      ["view_next_workspace", menuNextWorkspaceHub],
      ["view_prev_workspace", menuPrevWorkspaceHub],
      ["composer_cycle_model", menuCycleModelHub],
      ["composer_cycle_access", menuCycleAccessHub],
      ["composer_cycle_reasoning", menuCycleReasoningHub],
      ["composer_cycle_collaboration", menuCycleCollaborationHub],
    ]);
    hubs.get(event.id)?.emit();
  });
};

export function subscribeAppServerEvents(
  onEvent: (event: AppServerEvent) => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return electronAppServerHub.subscribe(onEvent, options);
}

function createElectronAppServerEventHub() {
  const listeners = new Set<Listener<AppServerEvent>>();
  let stopHost: Unsubscribe | null = null;
  let lastSequence = 0;

  const dispatch = (event: AgentEvent) => {
    if (event.sequence <= lastSequence) return;
    lastSequence = event.sequence;
    const payload: AppServerEvent = {
      workspace_id: event.workspaceId ?? "",
      message: {
        method: event.method,
        params: event.params,
        ...(event.requestId === undefined ? {} : { id: event.requestId }),
      },
    };
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch (error) {
        console.error("[events] Electron app-server listener failed", error);
      }
    }
  };

  const start = (options?: SubscriptionOptions) => {
    const host = getOptionalHostClient();
    if (!host || stopHost) return;

    const pending: AgentEvent[] = [];
    let hydrating = true;
    stopHost = host.agent.onEvent((event) => {
      if (hydrating) {
        pending.push(event);
      } else {
        dispatch(event);
      }
    });
    void host.agent
      .getEvents({ afterSequence: lastSequence })
      .then((batch) => {
        if (batch.resetRequired) {
          options?.onError?.(
            new Error("Electron App Server 事件 cursor 已超出有界保留窗口"),
          );
        }
        for (const event of [...batch.events, ...pending].sort(
          (left, right) => left.sequence - right.sequence,
        )) {
          dispatch(event);
        }
      })
      .catch((error) => options?.onError?.(error))
      .finally(() => {
        hydrating = false;
        for (const event of pending.sort(
          (left, right) => left.sequence - right.sequence,
        )) {
          dispatch(event);
        }
        pending.length = 0;
      });
  };

  const subscribe = (
    listener: Listener<AppServerEvent>,
    options?: SubscriptionOptions,
  ): Unsubscribe => {
    listeners.add(listener);
    start(options);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && stopHost) {
        stopHost();
        stopHost = null;
      }
    };
  };

  return { subscribe };
}

export function subscribeDictationDownload(
  onEvent: (event: DictationModelStatus) => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return dictationDownloadHub.subscribe(onEvent, options);
}

export function subscribeDictationEvents(
  onEvent: (event: DictationEvent) => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return dictationEventHub.subscribe(onEvent, options);
}

export function subscribeTerminalOutput(
  onEvent: (event: TerminalOutputEvent) => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return electronTerminalHub.subscribeOutput(onEvent, options);
}

export function subscribeTerminalExit(
  onEvent: (event: TerminalExitEvent) => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return electronTerminalHub.subscribeExit(onEvent, options);
}

function createElectronTerminalEventHub() {
  const outputListeners = new Set<Listener<TerminalOutputEvent>>();
  const exitListeners = new Set<Listener<TerminalExitEvent>>();
  let stopHost: Unsubscribe | null = null;

  const start = (options?: SubscriptionOptions) => {
    const host = getOptionalHostClient();
    if (!host || stopHost) return;
    try {
      stopHost = host.terminal.onEvent(dispatch);
    } catch (error) {
      options?.onError?.(error);
    }
  };
  const dispatch = (event: TerminalEvent) => {
    const listeners = event.kind === "data" ? outputListeners : exitListeners;
    const payload = event.kind === "data"
      ? event
      : { workspaceId: event.workspaceId, terminalId: event.terminalId };
    for (const listener of listeners) listener(payload as never);
  };
  const stopIfUnused = () => {
    if (outputListeners.size > 0 || exitListeners.size > 0) return;
    stopHost?.();
    stopHost = null;
  };
  return {
    subscribeOutput(listener: Listener<TerminalOutputEvent>, options?: SubscriptionOptions) {
      outputListeners.add(listener);
      start(options);
      return () => {
        outputListeners.delete(listener);
        stopIfUnused();
      };
    },
    subscribeExit(listener: Listener<TerminalExitEvent>, options?: SubscriptionOptions) {
      exitListeners.add(listener);
      start(options);
      return () => {
        exitListeners.delete(listener);
        stopIfUnused();
      };
    },
  };
}

export function subscribeUpdaterCheck(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return updaterCheckHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeTrayOpenThread(
  onEvent: (payload: TrayOpenThreadPayload) => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return trayOpenThreadHub.subscribe((payload) => {
    onEvent(payload);
  }, options);
}

export function subscribeMenuNewAgent(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuNewAgentHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuNewWorktreeAgent(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuNewWorktreeAgentHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuNewCloneAgent(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuNewCloneAgentHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuAddWorkspaceFromUrl(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuAddWorkspaceFromUrlHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuAddWorkspace(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuAddWorkspaceHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuOpenSettings(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuOpenSettingsHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuToggleProjectsSidebar(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuToggleProjectsSidebarHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuToggleGitSidebar(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuToggleGitSidebarHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuToggleDebugPanel(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuToggleDebugPanelHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuToggleTerminal(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuToggleTerminalHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuNextAgent(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuNextAgentHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuPrevAgent(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuPrevAgentHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuNextWorkspace(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuNextWorkspaceHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuPrevWorkspace(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuPrevWorkspaceHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuCycleModel(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuCycleModelHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuCycleAccessMode(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuCycleAccessHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuCycleReasoning(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuCycleReasoningHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuCycleCollaborationMode(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuCycleCollaborationHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuComposerCycleModel(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuComposerCycleModelHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuComposerCycleAccess(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuComposerCycleAccessHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuComposerCycleReasoning(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuComposerCycleReasoningHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuComposerCycleCollaboration(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuComposerCycleCollaborationHub.subscribe(() => {
    onEvent();
  }, options);
}
