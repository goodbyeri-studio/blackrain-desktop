import { useCallback, type MouseEvent } from "react";

import type { WorkspaceInfo } from "../../../types";
import { pushErrorToast } from "../../../services/toasts";
import { revealPath } from "../../../host/desktop";
import { fileManagerName } from "../../../utils/platformPaths";
import { showContextMenu, type ContextMenuEntry } from "../../../host/contextMenu";

type SidebarMenuHandlers = {
  onDeleteThread: (workspaceId: string, threadId: string) => void;
  onSyncThread: (workspaceId: string, threadId: string) => void;
  onPinThread: (workspaceId: string, threadId: string) => void;
  onUnpinThread: (workspaceId: string, threadId: string) => void;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  onRenameThread: (workspaceId: string, threadId: string) => void;
  onReloadWorkspaceThreads: (workspaceId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onDeleteWorktree: (workspaceId: string) => void;
  onRenameWorkspace?: (workspaceId: string) => void;
};

export function useSidebarMenus({
  onDeleteThread,
  onSyncThread,
  onPinThread,
  onUnpinThread,
  isThreadPinned,
  onRenameThread,
  onReloadWorkspaceThreads,
  onDeleteWorkspace,
  onDeleteWorktree,
  onRenameWorkspace,
}: SidebarMenuHandlers) {
  const showThreadMenu = useCallback(
    async (
      event: MouseEvent,
      workspaceId: string,
      threadId: string,
      canPin: boolean,
    ) => {
      const items: ContextMenuEntry[] = [
        { id: "rename", label: "Rename", onSelect: () => onRenameThread(workspaceId, threadId) },
        { id: "sync", label: "Sync from server", onSelect: () => onSyncThread(workspaceId, threadId) },
      ];
      if (canPin) {
        const isPinned = isThreadPinned(workspaceId, threadId);
        items.push({
          id: "pin",
          label: isPinned ? "Unpin" : "Pin",
          onSelect: () => isPinned
            ? onUnpinThread(workspaceId, threadId)
            : onPinThread(workspaceId, threadId),
        });
      }
      items.push({
        id: "copy",
        label: "Copy ID",
        onSelect: async () => {
          try {
            await navigator.clipboard.writeText(threadId);
          } catch {
            // Clipboard failures are non-fatal here.
          }
        },
      }, {
        id: "archive",
        label: "Archive",
        onSelect: () => onDeleteThread(workspaceId, threadId),
      });
      await showContextMenu(event, items);
    },
    [
      isThreadPinned,
      onDeleteThread,
      onPinThread,
      onRenameThread,
      onSyncThread,
      onUnpinThread,
    ],
  );

  const showWorkspaceMenu = useCallback(
    async (event: MouseEvent, workspace: WorkspaceInfo) => {
      const fileManagerLabel = fileManagerName();
      const items: ContextMenuEntry[] = [];

      if (onRenameWorkspace) {
        items.push({ id: "rename", label: "Rename", onSelect: () => onRenameWorkspace(workspace.id) });
      }

      if (workspace.path) {
        items.push({
          id: "reveal",
          label: `Show in ${fileManagerLabel}`,
          onSelect: async () => {
              try {
                await revealPath(workspace.path!);
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                pushErrorToast({
                  title: `Couldn't show project in ${fileManagerLabel}`,
                  message,
                });
                console.warn("Failed to reveal workspace", {
                  message,
                  workspaceId: workspace.id,
                  path: workspace.path,
                });
              }
          },
        });
      }

      items.push(
        { id: "reload", label: "Reload threads", onSelect: () => onReloadWorkspaceThreads(workspace.id) },
        { id: "remove", label: "Remove", onSelect: () => onDeleteWorkspace(workspace.id) },
      );
      await showContextMenu(event, items);
    },
    [
      onReloadWorkspaceThreads,
      onDeleteWorkspace,
      onRenameWorkspace,
    ],
  );

  const showWorktreeMenu = useCallback(
    async (event: MouseEvent, worktree: WorkspaceInfo) => {
      const fileManagerLabel = fileManagerName();
      await showContextMenu(event, [{
        id: "reload",
        label: "Reload threads",
        onSelect: () => onReloadWorkspaceThreads(worktree.id),
      }, {
        id: "reveal",
        label: `Show in ${fileManagerLabel}`,
        onSelect: async () => {
          if (!worktree.path) {
            return;
          }
          try {
            await revealPath(worktree.path);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            pushErrorToast({
              title: `Couldn't show worktree in ${fileManagerLabel}`,
              message,
            });
            console.warn("Failed to reveal worktree", {
              message,
              workspaceId: worktree.id,
              path: worktree.path,
            });
          }
        },
      }, {
        id: "delete",
        label: "Delete worktree",
        onSelect: () => onDeleteWorktree(worktree.id),
      }]);
    },
    [onReloadWorkspaceThreads, onDeleteWorktree],
  );

  const showCloneMenu = useCallback(
    async (event: MouseEvent, clone: WorkspaceInfo) => {
      const fileManagerLabel = fileManagerName();
      await showContextMenu(event, [{
        id: "reload",
        label: "Reload threads",
        onSelect: () => onReloadWorkspaceThreads(clone.id),
      }, {
        id: "reveal",
        label: `Show in ${fileManagerLabel}`,
        onSelect: async () => {
          if (!clone.path) {
            return;
          }
          try {
            await revealPath(clone.path);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            pushErrorToast({
              title: `Couldn't show clone in ${fileManagerLabel}`,
              message,
            });
            console.warn("Failed to reveal clone", {
              message,
              workspaceId: clone.id,
              path: clone.path,
            });
          }
        },
      }, {
        id: "delete",
        label: "Delete clone",
        onSelect: () => onDeleteWorkspace(clone.id),
      }]);
    },
    [onReloadWorkspaceThreads, onDeleteWorkspace],
  );

  return { showThreadMenu, showWorkspaceMenu, showWorktreeMenu, showCloneMenu };
}
