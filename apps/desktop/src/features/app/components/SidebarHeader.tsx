import ArrowDownUp from "lucide-react/dist/esm/icons/arrow-down-up";
import Archive from "lucide-react/dist/esm/icons/archive";
import BetweenHorizontalStart from "lucide-react/dist/esm/icons/between-horizontal-start";
import Calendar from "lucide-react/dist/esm/icons/calendar";
import Check from "lucide-react/dist/esm/icons/check";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import Ellipsis from "lucide-react/dist/esm/icons/ellipsis";
import FolderTree from "lucide-react/dist/esm/icons/folder-tree";
import ListTree from "lucide-react/dist/esm/icons/list-tree";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { FolderAddIcon } from "@/features/shared/components/FolderAddIcon";
import { useI18n } from "@/i18n";
import type { ThreadListOrganizeMode, ThreadListSortKey } from "../../../types";
import {
  MenuTrigger,
  PopoverMenuItem,
  PopoverSurface,
} from "../../design-system/components/popover/PopoverPrimitives";
import { useMenuController } from "../hooks/useMenuController";

type SidebarHeaderProps = {
  onSelectHome: () => void;
  onAddWorkspace: () => void;
  threadListSortKey: ThreadListSortKey;
  onSetThreadListSortKey: (sortKey: ThreadListSortKey) => void;
  threadListOrganizeMode: ThreadListOrganizeMode;
  onSetThreadListOrganizeMode: (organizeMode: ThreadListOrganizeMode) => void;
  onRefreshAllThreads: () => void;
  refreshDisabled?: boolean;
  refreshInProgress?: boolean;
};

type SidebarSubmenuKind = "organize" | "sort";

export function SidebarHeader({
  onSelectHome,
  onAddWorkspace,
  threadListSortKey,
  onSetThreadListSortKey,
  threadListOrganizeMode,
  onSetThreadListOrganizeMode,
  onRefreshAllThreads: _onRefreshAllThreads,
  refreshDisabled: _refreshDisabled = false,
  refreshInProgress: _refreshInProgress = false,
}: SidebarHeaderProps) {
  const { tx } = useI18n();
  const sortMenu = useMenuController();
  const { isOpen: sortMenuOpen, containerRef: sortMenuRef } = sortMenu;
  const sortMenuPopoverRef = useRef<HTMLDivElement | null>(null);
  const submenuCloseTimerRef = useRef<number | null>(null);
  const [sortMenuShift, setSortMenuShift] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [submenu, setSubmenu] = useState<{
    kind: SidebarSubmenuKind;
    top: number;
    left: number;
  } | null>(null);

  const recalculateSortMenuPosition = useCallback(() => {
    const popover = sortMenuPopoverRef.current;
    if (!popover || typeof window === "undefined") {
      return;
    }
    const popoverRect = popover.getBoundingClientRect();
    const sidebarRect = sortMenuRef.current
      ?.closest(".sidebar")
      ?.getBoundingClientRect();
    const minLeft = sidebarRect ? sidebarRect.left + 8 : 8;
    const maxRight = sidebarRect
      ? Math.min(window.innerWidth - 8, sidebarRect.right - 8)
      : window.innerWidth - 8;
    const minTop = 8;
    const maxBottom = window.innerHeight - 8;

    let shiftX = 0;
    if (popoverRect.left < minLeft) {
      shiftX += minLeft - popoverRect.left;
    }
    if (popoverRect.right + shiftX > maxRight) {
      shiftX -= popoverRect.right + shiftX - maxRight;
    }

    let shiftY = 0;
    if (popoverRect.bottom > maxBottom) {
      shiftY -= popoverRect.bottom - maxBottom;
    }
    if (popoverRect.top + shiftY < minTop) {
      shiftY += minTop - (popoverRect.top + shiftY);
    }

    setSortMenuShift((current) =>
      current.x === shiftX && current.y === shiftY
        ? current
        : { x: shiftX, y: shiftY },
    );
  }, [sortMenuRef]);

  useEffect(() => {
    if (!sortMenuOpen) {
      setSortMenuShift({ x: 0, y: 0 });
      setSubmenu(null);
      return;
    }
    recalculateSortMenuPosition();
    const onWindowChange = () => recalculateSortMenuPosition();
    window.addEventListener("resize", onWindowChange);
    window.addEventListener("scroll", onWindowChange, true);
    return () => {
      window.removeEventListener("resize", onWindowChange);
      window.removeEventListener("scroll", onWindowChange, true);
    };
  }, [recalculateSortMenuPosition, sortMenuOpen]);

  useEffect(
    () => () => {
      if (submenuCloseTimerRef.current !== null) {
        window.clearTimeout(submenuCloseTimerRef.current);
      }
    },
    [],
  );

  const cancelSubmenuClose = () => {
    if (submenuCloseTimerRef.current !== null) {
      window.clearTimeout(submenuCloseTimerRef.current);
      submenuCloseTimerRef.current = null;
    }
  };

  const scheduleSubmenuClose = () => {
    cancelSubmenuClose();
    submenuCloseTimerRef.current = window.setTimeout(() => {
      setSubmenu(null);
      submenuCloseTimerRef.current = null;
    }, 120);
  };

  const openSubmenu = (kind: SidebarSubmenuKind, element: HTMLElement) => {
    cancelSubmenuClose();
    const rect = element.getBoundingClientRect();
    const width = 194;
    const left = Math.min(
      Math.max(rect.right + 8, 8),
      Math.max(window.innerWidth - width - 8, 8),
    );
    setSubmenu({
      kind,
      top: Math.max(rect.top - 10, 8),
      left,
    });
  };

  const handleSelectSort = (sortKey: ThreadListSortKey) => {
    setSubmenu(null);
    sortMenu.close();
    if (sortKey === threadListSortKey) {
      return;
    }
    onSetThreadListSortKey(sortKey);
  };

  const handleSelectOrganize = (organizeMode: ThreadListOrganizeMode) => {
    setSubmenu(null);
    sortMenu.close();
    if (organizeMode === threadListOrganizeMode) {
      return;
    }
    onSetThreadListOrganizeMode(organizeMode);
  };

  return (
    <div className="sidebar-header">
      <div className="sidebar-header-title">
        <div className="sidebar-title-group">
          <button
            className="subtitle subtitle-button sidebar-title-button"
            onClick={onSelectHome}
            data-electron-drag-region="false"
            aria-label={tx("Open home")}
          >
            {tx("Projects")}
          </button>
        </div>
      </div>
      <div className="sidebar-header-actions">
        <div className="sidebar-sort-menu" ref={sortMenuRef}>
          <MenuTrigger
            isOpen={sortMenuOpen}
            activeClassName="is-active"
            className="ghost sidebar-sort-toggle ds-tooltip-trigger"
            onClick={sortMenu.toggle}
            data-electron-drag-region="false"
            aria-label={tx("Project actions")}
            title={tx("Project actions")}
            data-tooltip={tx("Project actions")}
            data-tooltip-align="end"
            data-tooltip-placement="bottom"
          >
            <Ellipsis aria-hidden />
          </MenuTrigger>
          {sortMenuOpen && (
            <PopoverSurface
              className="sidebar-sort-dropdown"
              role="menu"
              ref={sortMenuPopoverRef}
              style={
                sortMenuShift.x !== 0 || sortMenuShift.y !== 0
                  ? { transform: `translate(${sortMenuShift.x}px, ${sortMenuShift.y}px)` }
                  : undefined
              }
            >
              <PopoverMenuItem
                className="sidebar-sort-option is-disabled"
                disabled
                icon={<Archive />}
              >
                {tx("Archive all chats")}
              </PopoverMenuItem>
              <div className="sidebar-sort-divider" aria-hidden />
              <div className="sidebar-menu-submenu-anchor">
                <PopoverMenuItem
                  className="sidebar-sort-option"
                  aria-haspopup="menu"
                  onMouseEnter={(event) => openSubmenu("organize", event.currentTarget)}
                  onFocus={(event) => openSubmenu("organize", event.currentTarget)}
                  onMouseLeave={scheduleSubmenuClose}
                  icon={<ListTree />}
                  trailing={<ChevronRight className="sidebar-sort-chevron" aria-hidden />}
                >
                  {tx("Organize sidebar")}
                </PopoverMenuItem>
              </div>
              <div className="sidebar-menu-submenu-anchor">
                <PopoverMenuItem
                  className="sidebar-sort-option"
                  aria-haspopup="menu"
                  onMouseEnter={(event) => openSubmenu("sort", event.currentTarget)}
                  onFocus={(event) => openSubmenu("sort", event.currentTarget)}
                  onMouseLeave={scheduleSubmenuClose}
                  icon={<ArrowDownUp />}
                  trailing={<ChevronRight className="sidebar-sort-chevron" aria-hidden />}
                >
                  {tx("Sort conditions")}
                </PopoverMenuItem>
              </div>
            </PopoverSurface>
          )}
          {submenu &&
            createPortal(
              <PopoverSurface
                className="sidebar-submenu-popover"
                role="menu"
                style={{ top: submenu.top, left: submenu.left }}
                onMouseEnter={cancelSubmenuClose}
                onMouseLeave={scheduleSubmenuClose}
              >
                {submenu.kind === "organize" ? (
                  <>
                    <PopoverMenuItem
                      className="sidebar-sort-option"
                      role="menuitemradio"
                      aria-checked={threadListOrganizeMode === "by_project"}
                      onClick={() => handleSelectOrganize("by_project")}
                      data-electron-drag-region="false"
                      icon={<FolderTree aria-hidden />}
                    >
                      {tx("By project")}
                      {threadListOrganizeMode === "by_project" && (
                        <Check className="sidebar-sort-check" aria-hidden />
                      )}
                    </PopoverMenuItem>
                    <PopoverMenuItem
                      className="sidebar-sort-option"
                      role="menuitemradio"
                      aria-checked={threadListOrganizeMode === "by_project_activity"}
                      onClick={() => handleSelectOrganize("by_project_activity")}
                      data-electron-drag-region="false"
                      icon={<BetweenHorizontalStart aria-hidden />}
                    >
                      {tx("Recent projects")}
                      {threadListOrganizeMode === "by_project_activity" && (
                        <Check className="sidebar-sort-check" aria-hidden />
                      )}
                    </PopoverMenuItem>
                    <PopoverMenuItem
                      className="sidebar-sort-option"
                      role="menuitemradio"
                      aria-checked={threadListOrganizeMode === "threads_only"}
                      onClick={() => handleSelectOrganize("threads_only")}
                      data-electron-drag-region="false"
                      icon={<ListTree aria-hidden />}
                    >
                      {tx("Chronological")}
                      {threadListOrganizeMode === "threads_only" && (
                        <Check className="sidebar-sort-check" aria-hidden />
                      )}
                    </PopoverMenuItem>
                  </>
                ) : (
                  <>
                    <PopoverMenuItem
                      className="sidebar-sort-option"
                      role="menuitemradio"
                      aria-checked={threadListSortKey === "created_at"}
                      onClick={() => handleSelectSort("created_at")}
                      data-electron-drag-region="false"
                      icon={<Calendar aria-hidden />}
                    >
                      {tx("Created time")}
                      {threadListSortKey === "created_at" && (
                        <Check className="sidebar-sort-check" aria-hidden />
                      )}
                    </PopoverMenuItem>
                    <PopoverMenuItem
                      className="sidebar-sort-option"
                      role="menuitemradio"
                      aria-checked={threadListSortKey === "updated_at"}
                      onClick={() => handleSelectSort("updated_at")}
                      data-electron-drag-region="false"
                      icon={<ArrowDownUp aria-hidden />}
                    >
                      {tx("Recently updated")}
                      {threadListSortKey === "updated_at" && (
                        <Check className="sidebar-sort-check" aria-hidden />
                      )}
                    </PopoverMenuItem>
                  </>
                )}
              </PopoverSurface>,
              document.body,
            )}
        </div>
        <button
          className="sidebar-title-add ds-tooltip-trigger"
          onClick={onAddWorkspace}
          data-electron-drag-region="false"
          aria-label={tx("Add workspaces")}
          data-tooltip={tx("Add workspaces")}
          data-tooltip-align="end"
          data-tooltip-placement="bottom"
          type="button"
        >
          <FolderAddIcon size={16} strokeWidth={1.7} />
        </button>
      </div>
    </div>
  );
}
