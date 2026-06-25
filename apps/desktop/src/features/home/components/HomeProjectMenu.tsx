import { useMemo, useState } from "react";
import Search from "lucide-react/dist/esm/icons/search";
import FolderGit2 from "lucide-react/dist/esm/icons/folder-git-2";
import Folder from "lucide-react/dist/esm/icons/folder";
import FolderPlus from "lucide-react/dist/esm/icons/folder-plus";
import Plus from "lucide-react/dist/esm/icons/plus";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import { FolderAddIcon } from "@/features/shared/components/FolderAddIcon";
import { useI18n } from "@/i18n";
import { useMenuController } from "@app/hooks/useMenuController";
import {
  PopoverSurface,
  MenuTrigger,
} from "../../design-system/components/popover/PopoverPrimitives";
import type { WorkspaceInfo } from "../../../types";

type HomeProjectMenuProps = {
  workspaces: WorkspaceInfo[];
  onEnterWorkspace: (workspaceId: string) => void;
  onAddWorkspace: () => void;
  onAddWorkspaceFromUrl: () => void;
};

export function HomeProjectMenu({
  workspaces,
  onEnterWorkspace,
  onAddWorkspace,
  onAddWorkspaceFromUrl,
}: HomeProjectMenuProps) {
  const { tx } = useI18n();
  const menu = useMenuController();
  const { isOpen, containerRef, toggle, close } = menu;
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return workspaces;
    }
    return workspaces.filter((w) => w.name.toLowerCase().includes(q));
  }, [query, workspaces]);

  const handleClose = () => {
    setQuery("");
    setAddOpen(false);
    close();
  };

  return (
    <div className="home-menu-anchor" ref={containerRef}>
      <MenuTrigger
        isOpen={isOpen}
        className="home-pill home-project-trigger"
        onClick={toggle}
        aria-label={tx("Enter project work")}
      >
        <span className="home-pill-icon" aria-hidden>
          <FolderAddIcon size={15} strokeWidth={1.7} />
        </span>
        {tx("Enter project work")}
        <ChevronDown className="home-pill-chevron" aria-hidden />
      </MenuTrigger>

      {isOpen && (
        <PopoverSurface className="home-menu-popover home-menu-popover--project" role="menu">
          <div className="home-menu-search">
            <Search className="home-menu-search-icon" aria-hidden />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tx("Search projects")}
              aria-label={tx("Search projects")}
              autoFocus
            />
          </div>

          {filtered.length === 0 && (
            <div className="home-menu-empty">{tx("No matching projects")}</div>
          )}
          {filtered.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              role="menuitem"
              className="home-menu-rich-item"
              onClick={() => {
                onEnterWorkspace(workspace.id);
                handleClose();
              }}
            >
              <span className="home-menu-rich-icon" aria-hidden>
                <FolderGit2 size={16} strokeWidth={1.7} />
              </span>
              <span className="home-menu-rich-body">
                <span className="home-menu-rich-label">{workspace.name}</span>
              </span>
            </button>
          ))}

          <div className="home-menu-divider" />

          <div
            className="home-submenu-anchor"
            onMouseEnter={() => setAddOpen(true)}
            onMouseLeave={() => setAddOpen(false)}
          >
            <button
              type="button"
              role="menuitem"
              className="home-menu-rich-item"
              aria-haspopup="menu"
              aria-expanded={addOpen}
              onClick={() => setAddOpen((v) => !v)}
            >
              <span className="home-menu-rich-icon" aria-hidden>
                <FolderPlus size={16} strokeWidth={1.7} />
              </span>
              <span className="home-menu-rich-body">
                <span className="home-menu-rich-label">{tx("Add new project")}</span>
              </span>
              <span className="home-menu-rich-check" aria-hidden>
                <ChevronRight size={15} strokeWidth={1.8} />
              </span>
            </button>

            {addOpen && (
              <PopoverSurface className="home-submenu-popover" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="home-menu-rich-item"
                  onClick={() => {
                    onAddWorkspaceFromUrl();
                    handleClose();
                  }}
                >
                  <span className="home-menu-rich-icon" aria-hidden>
                    <Plus size={16} strokeWidth={1.8} />
                  </span>
                  <span className="home-menu-rich-body">
                    <span className="home-menu-rich-label">
                      {tx("New blank project")}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="home-menu-rich-item"
                  onClick={() => {
                    onAddWorkspace();
                    handleClose();
                  }}
                >
                  <span className="home-menu-rich-icon" aria-hidden>
                    <Folder size={16} strokeWidth={1.7} />
                  </span>
                  <span className="home-menu-rich-body">
                    <span className="home-menu-rich-label">
                      {tx("Use existing folder")}
                    </span>
                  </span>
                </button>
              </PopoverSurface>
            )}
          </div>
        </PopoverSurface>
      )}
    </div>
  );
}
