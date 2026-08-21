import type { MutableRefObject } from "react";
import { useHostEvent } from "./useHostEvent";
import {
  subscribeMenuAddWorkspace,
  subscribeMenuNewAgent,
  subscribeMenuOpenSettings,
  subscribeMenuPrevAgent,
  subscribeMenuNextAgent,
  subscribeMenuPrevWorkspace,
  subscribeMenuNextWorkspace,
  subscribeMenuToggleDebugPanel,
  subscribeMenuToggleGitSidebar,
  subscribeMenuToggleProjectsSidebar,
  subscribeMenuToggleTerminal,
} from "../../../services/events";
import type { WorkspaceInfo } from "../../../types";

type Params = {
  activeWorkspaceRef: MutableRefObject<WorkspaceInfo | null>;
  onAddWorkspace: () => void;
  onAddAgent: (workspace: WorkspaceInfo) => void;
  onOpenSettings: () => void;
  onCycleAgent: (direction: "next" | "prev") => void;
  onCycleWorkspace: (direction: "next" | "prev") => void;
  onToggleDebug: () => void;
  onToggleTerminal: () => void;
  sidebarCollapsed: boolean;
  rightPanelCollapsed: boolean;
  onExpandSidebar: () => void;
  onCollapseSidebar: () => void;
  onExpandRightPanel: () => void;
  onCollapseRightPanel: () => void;
};

export function useAppMenuEvents({
  activeWorkspaceRef,
  onAddWorkspace,
  onAddAgent,
  onOpenSettings,
  onCycleAgent,
  onCycleWorkspace,
  onToggleDebug,
  onToggleTerminal,
  sidebarCollapsed,
  rightPanelCollapsed,
  onExpandSidebar,
  onCollapseSidebar,
  onExpandRightPanel,
  onCollapseRightPanel,
}: Params) {
  useHostEvent(subscribeMenuNewAgent, () => {
    const workspace = activeWorkspaceRef.current;
    if (workspace) {
      onAddAgent(workspace);
    }
  });

  useHostEvent(subscribeMenuAddWorkspace, () => {
    onAddWorkspace();
  });

  useHostEvent(subscribeMenuOpenSettings, () => {
    onOpenSettings();
  });

  useHostEvent(subscribeMenuNextAgent, () => {
    onCycleAgent("next");
  });

  useHostEvent(subscribeMenuPrevAgent, () => {
    onCycleAgent("prev");
  });

  useHostEvent(subscribeMenuNextWorkspace, () => {
    onCycleWorkspace("next");
  });

  useHostEvent(subscribeMenuPrevWorkspace, () => {
    onCycleWorkspace("prev");
  });

  useHostEvent(subscribeMenuToggleDebugPanel, () => {
    onToggleDebug();
  });

  useHostEvent(subscribeMenuToggleTerminal, () => {
    onToggleTerminal();
  });

  useHostEvent(subscribeMenuToggleProjectsSidebar, () => {
    if (sidebarCollapsed) {
      onExpandSidebar();
    } else {
      onCollapseSidebar();
    }
  });

  useHostEvent(subscribeMenuToggleGitSidebar, () => {
    if (rightPanelCollapsed) {
      onExpandRightPanel();
    } else {
      onCollapseRightPanel();
    }
  });
}
