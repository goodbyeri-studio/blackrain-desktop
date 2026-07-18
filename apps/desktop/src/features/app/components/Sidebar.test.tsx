// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { Sidebar } from "./Sidebar";

afterEach(() => {
  if (vi.isFakeTimers()) {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  }
  cleanup();
});

const baseProps = {
  workspaces: [],
  groupedWorkspaces: [],
  hasWorkspaceGroups: false,
  deletingWorktreeIds: new Set<string>(),
  threadsByWorkspace: {},
  threadParentById: {},
  threadStatusById: {},
  threadListLoadingByWorkspace: {},
  threadListPagingByWorkspace: {},
  threadListCursorByWorkspace: {},
  pinnedThreadsVersion: 0,
  threadListSortKey: "updated_at" as const,
  onSetThreadListSortKey: vi.fn(),
  threadListOrganizeMode: "by_project" as const,
  onSetThreadListOrganizeMode: vi.fn(),
  onRefreshAllThreads: vi.fn(),
  activeWorkspaceId: null,
  activeThreadId: null,
  accountRateLimits: null,
  usageShowRemaining: false,
  accountInfo: null,
  onSwitchAccount: vi.fn(),
  onCancelSwitchAccount: vi.fn(),
  accountSwitching: false,
  onOpenSettings: vi.fn(),
  onOpenDebug: vi.fn(),
  showDebugButton: false,
  onAddWorkspace: vi.fn(),
  onSelectHome: vi.fn(),
  surfaceMode: "code" as const,
  onSurfaceModeChange: vi.fn(),
  onSelectWorkspace: vi.fn(),
  onConnectWorkspace: vi.fn(),
  onAddAgent: vi.fn(),
  onAddWorktreeAgent: vi.fn(),
  onAddCloneAgent: vi.fn(),
  onToggleWorkspaceCollapse: vi.fn(),
  onSelectThread: vi.fn(),
  onDeleteThread: vi.fn(),
  onSyncThread: vi.fn(),
  pinThread: vi.fn(() => false),
  unpinThread: vi.fn(),
  isThreadPinned: vi.fn(() => false),
  getPinTimestamp: vi.fn(() => null),
  onRenameThread: vi.fn(),
  onDeleteWorkspace: vi.fn(),
  onDeleteWorktree: vi.fn(),
  onLoadOlderThreads: vi.fn(),
  onReloadWorkspaceThreads: vi.fn(),
  workspaceDropTargetRef: createRef<HTMLElement>(),
  isWorkspaceDropActive: false,
  workspaceDropText: "Drop Project Here",
  onWorkspaceDragOver: vi.fn(),
  onWorkspaceDragEnter: vi.fn(),
  onWorkspaceDragLeave: vi.fn(),
  onWorkspaceDrop: vi.fn(),
};

describe("Sidebar", () => {
  it("routes the shared work/code switch through the surface controller", () => {
    const onSurfaceModeChange = vi.fn();
    render(<Sidebar {...baseProps} onSurfaceModeChange={onSurfaceModeChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Work" }));

    expect(onSurfaceModeChange).toHaveBeenCalledWith("work");
  });

  it("renders the search bar when opened and accepts a query", () => {
    render(<Sidebar {...baseProps} initialSearchOpen />);

    const input = screen.getByPlaceholderText("Search conversations") as HTMLInputElement;
    expect(input).toBeTruthy();

    fireEvent.change(input, { target: { value: "alpha" } });
    expect(input.value).toBe("alpha");
  });

  it("hides the search bar when not opened", () => {
    render(<Sidebar {...baseProps} />);
    expect(screen.queryByRole("button", { name: "Search conversations" })).toBeNull();
    expect(screen.queryByPlaceholderText("Search conversations")).toBeNull();
  });

  it("opens thread sort menu from the project actions button", () => {
    const onSetThreadListSortKey = vi.fn();
    render(
      <Sidebar
        {...baseProps}
        threadListSortKey="updated_at"
        onSetThreadListSortKey={onSetThreadListSortKey}
      />,
    );

    const button = screen.getByRole("button", { name: "Project actions" });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(button);
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Sort conditions" }));
    const option = screen.getByRole("menuitemradio", { name: "Created time" });
    fireEvent.click(option);

    expect(onSetThreadListSortKey).toHaveBeenCalledWith("created_at");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("changes organize mode from the project actions menu", () => {
    const onSetThreadListOrganizeMode = vi.fn();
    render(
      <Sidebar
        {...baseProps}
        threadListOrganizeMode="by_project"
        onSetThreadListOrganizeMode={onSetThreadListOrganizeMode}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Project actions" }));
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Organize sidebar" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Chronological" }));

    expect(onSetThreadListOrganizeMode).toHaveBeenCalledWith("threads_only");
  });

  it("opens settings from the Codex-style bottom rail", () => {
    const onOpenSettings = vi.fn();
    render(
      <Sidebar
        {...baseProps}
        onOpenSettings={onOpenSettings}
        activeWorkspaceId="ws-1"
        accountInfo={{
          email: "dimillian@example.com",
          type: "chatgpt",
          planType: "pro",
          requiresOpenaiAuth: false,
        }}
      />,
    );

    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("dimillian@example.com")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("shows not signed in in the Codex-style bottom rail without an account", () => {
    render(<Sidebar {...baseProps} />);

    expect(screen.getByText("Not signed in")).toBeTruthy();
  });

  it("renders threads-only mode as a global chronological list", () => {
    const older = Date.now() - 10_000;
    const newer = Date.now();
    const { container } = render(
      <Sidebar
        {...baseProps}
        threadListOrganizeMode="threads_only"
        workspaces={[
          {
            id: "ws-1",
            name: "Alpha Project",
            path: "/tmp/alpha",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
          {
            id: "ws-2",
            name: "Beta Project",
            path: "/tmp/beta",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
        ]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Workspaces",
            workspaces: [
              {
                id: "ws-1",
                name: "Alpha Project",
                path: "/tmp/alpha",
                connected: true,
                settings: { sidebarCollapsed: false },
              },
              {
                id: "ws-2",
                name: "Beta Project",
                path: "/tmp/beta",
                connected: true,
                settings: { sidebarCollapsed: false },
              },
            ],
          },
        ]}
        threadsByWorkspace={{
          "ws-1": [{ id: "thread-1", name: "Older thread", updatedAt: older }],
          "ws-2": [{ id: "thread-2", name: "Newer thread", updatedAt: newer }],
        }}
      />,
    );

    const renderedNames = Array.from(container.querySelectorAll(".thread-row .thread-name")).map(
      (node) => node.textContent?.trim(),
    );
    expect(screen.getByText("Recent conversations")).toBeTruthy();
    expect(renderedNames[0]).toBe("Newer thread");
    expect(renderedNames[1]).toBe("Older thread");
    expect(screen.getByText("Alpha Project")).toBeTruthy();
    expect(screen.getByText("Beta Project")).toBeTruthy();
  });

  it("keeps a project visible when its thread matches the search query", async () => {
    render(
      <Sidebar
        {...baseProps}
        workspaces={[
          {
            id: "ws-1",
            name: "Alpha Project",
            path: "/tmp/alpha",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
          {
            id: "ws-2",
            name: "Beta Project",
            path: "/tmp/beta",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
        ]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Workspaces",
            workspaces: [
              {
                id: "ws-1",
                name: "Alpha Project",
                path: "/tmp/alpha",
                connected: true,
                settings: { sidebarCollapsed: false },
              },
              {
                id: "ws-2",
                name: "Beta Project",
                path: "/tmp/beta",
                connected: true,
                settings: { sidebarCollapsed: false },
              },
            ],
          },
        ]}
        threadsByWorkspace={{
          "ws-1": [{ id: "thread-1", name: "Fix workspace restore", updatedAt: 1000 }],
          "ws-2": [{ id: "thread-2", name: "Unrelated thread", updatedAt: 900 }],
        }}
        initialSearchOpen
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Search conversations"), {
      target: { value: "restore" },
    });

    await waitFor(() => {
      expect(screen.getByText("Alpha Project")).toBeTruthy();
      expect(screen.getByText("Fix workspace restore")).toBeTruthy();
      expect(screen.queryByText("Beta Project")).toBeNull();
      expect(screen.queryByText("Unrelated thread")).toBeNull();
    });
  });

  it("searches across loaded root threads before collapsed truncation", async () => {
    render(
      <Sidebar
        {...baseProps}
        workspaces={[
          {
            id: "ws-1",
            name: "Alpha Project",
            path: "/tmp/alpha",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
        ]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Workspaces",
            workspaces: [
              {
                id: "ws-1",
                name: "Alpha Project",
                path: "/tmp/alpha",
                connected: true,
                settings: { sidebarCollapsed: false },
              },
            ],
          },
        ]}
        threadsByWorkspace={{
          "ws-1": [
            { id: "thread-1", name: "Alpha thread", updatedAt: 1000 },
            { id: "thread-2", name: "Beta thread", updatedAt: 900 },
            { id: "thread-3", name: "Gamma thread", updatedAt: 800 },
            { id: "thread-4", name: "Delta thread", updatedAt: 700 },
          ],
        }}
        initialSearchOpen
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Search conversations"), {
      target: { value: "delta" },
    });

    await waitFor(() => {
      expect(screen.getByText("Alpha Project")).toBeTruthy();
      expect(screen.getByText("Delta thread")).toBeTruthy();
      expect(screen.queryByText("Alpha thread")).toBeNull();
      expect(screen.queryByText("More...")).toBeNull();
    });
  });

  it("keeps a project visible during search when only older pages may contain matches", async () => {
    render(
      <Sidebar
        {...baseProps}
        workspaces={[
          {
            id: "ws-1",
            name: "Alpha Project",
            path: "/tmp/alpha",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
        ]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Workspaces",
            workspaces: [
              {
                id: "ws-1",
                name: "Alpha Project",
                path: "/tmp/alpha",
                connected: true,
                settings: { sidebarCollapsed: false },
              },
            ],
          },
        ]}
        threadsByWorkspace={{
          "ws-1": [{ id: "thread-1", name: "Current page thread", updatedAt: 1000 }],
        }}
        threadListCursorByWorkspace={{ "ws-1": "cursor-1" }}
        initialSearchOpen
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Search conversations"), {
      target: { value: "historical" },
    });

    await waitFor(() => {
      expect(screen.getByText("Alpha Project")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Search older..." })).toBeTruthy();
      expect(screen.queryByText("Current page thread")).toBeNull();
    });
  });

  it("keeps the parent project visible when only a worktree thread matches search", async () => {
    render(
      <Sidebar
        {...baseProps}
        workspaces={[
          {
            id: "ws-root",
            name: "Main Project",
            path: "/tmp/main",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
          {
            id: "ws-worktree",
            name: "Feature Worktree",
            path: "/tmp/main-feature",
            connected: true,
            kind: "worktree",
            parentId: "ws-root",
            settings: { sidebarCollapsed: false },
          },
        ]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Workspaces",
            workspaces: [
              {
                id: "ws-root",
                name: "Main Project",
                path: "/tmp/main",
                connected: true,
                settings: { sidebarCollapsed: false },
              },
            ],
          },
        ]}
        threadsByWorkspace={{
          "ws-worktree": [
            { id: "thread-worktree", name: "Feature thread routing fix", updatedAt: 1000 },
          ],
        }}
        initialSearchOpen
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Search conversations"), {
      target: { value: "routing fix" },
    });

    await waitFor(() => {
      expect(screen.getByText("Main Project")).toBeTruthy();
      expect(screen.getByText("Worktrees")).toBeTruthy();
      expect(screen.getByText("Feature Worktree")).toBeTruthy();
      expect(screen.getByText("Feature thread routing fix")).toBeTruthy();
    });
  });

  it("keeps clone agents visible when their thread matches search", async () => {
    render(
      <Sidebar
        {...baseProps}
        workspaces={[
          {
            id: "ws-root",
            name: "Main Project",
            path: "/tmp/main",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
          {
            id: "ws-clone",
            name: "Clone Agent",
            path: "/tmp/main-clone",
            connected: true,
            settings: {
              sidebarCollapsed: false,
              cloneSourceWorkspaceId: "ws-root",
            },
          },
        ]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Workspaces",
            workspaces: [
              {
                id: "ws-root",
                name: "Main Project",
                path: "/tmp/main",
                connected: true,
                settings: { sidebarCollapsed: false },
              },
              {
                id: "ws-clone",
                name: "Clone Agent",
                path: "/tmp/main-clone",
                connected: true,
                settings: {
                  sidebarCollapsed: false,
                  cloneSourceWorkspaceId: "ws-root",
                },
              },
            ],
          },
        ]}
        threadsByWorkspace={{
          "ws-clone": [
            { id: "thread-clone", name: "Investigate clone search bug", updatedAt: 1000 },
          ],
        }}
        initialSearchOpen
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Search conversations"), {
      target: { value: "clone search bug" },
    });

    await waitFor(() => {
      expect(screen.getByText("Main Project")).toBeTruthy();
      expect(screen.getByText("Clone agents")).toBeTruthy();
      expect(screen.getByText("Clone Agent")).toBeTruthy();
      expect(screen.getByText("Investigate clone search bug")).toBeTruthy();
    });
  });

  it("creates a new thread from the all-threads project picker", () => {
    const onAddAgent = vi.fn();
    render(
      <Sidebar
        {...baseProps}
        threadListOrganizeMode="threads_only"
        onAddAgent={onAddAgent}
        workspaces={[
          {
            id: "ws-1",
            name: "Alpha Project",
            path: "/tmp/alpha",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
          {
            id: "ws-2",
            name: "Beta Project",
            path: "/tmp/beta",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
        ]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Workspaces",
            workspaces: [
              {
                id: "ws-1",
                name: "Alpha Project",
                path: "/tmp/alpha",
                connected: true,
                settings: { sidebarCollapsed: false },
              },
              {
                id: "ws-2",
                name: "Beta Project",
                path: "/tmp/beta",
                connected: true,
                settings: { sidebarCollapsed: false },
              },
            ],
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "New thread in project" }));
    fireEvent.click(screen.getByRole("button", { name: "Alpha Project" }));

    expect(onAddAgent).toHaveBeenCalledTimes(1);
    expect(onAddAgent).toHaveBeenCalledWith(expect.objectContaining({ id: "ws-1" }));
  });

  it("shows Codex-style project header actions", () => {
    render(
      <Sidebar
        {...baseProps}
        workspaces={[
          {
            id: "ws-1",
            name: "Workspace",
            path: "/tmp/workspace",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
        ]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Workspaces",
            workspaces: [
              {
                id: "ws-1",
                name: "Workspace",
                path: "/tmp/workspace",
                connected: true,
                settings: { sidebarCollapsed: false },
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "Project actions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add workspaces" })).toBeTruthy();
  });

  it("shows a top New Agent draft row and selects workspace when clicked", () => {
    const onSelectWorkspace = vi.fn();
    const props = {
      ...baseProps,
      workspaces: [
        {
          id: "ws-1",
          name: "Workspace",
          path: "/tmp/workspace",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
      ],
      groupedWorkspaces: [
        {
          id: null,
          name: "Workspaces",
          workspaces: [
            {
              id: "ws-1",
              name: "Workspace",
              path: "/tmp/workspace",
              connected: true,
              settings: { sidebarCollapsed: false },
            },
          ],
        },
      ],
      newAgentDraftWorkspaceId: "ws-1",
      activeWorkspaceId: "ws-1",
      activeThreadId: null,
      onSelectWorkspace,
    };

    render(<Sidebar {...props} />);

    const draftRow = screen.getByRole("button", { name: /new agent/i });
    expect(draftRow).toBeTruthy();
    expect(draftRow.className).toContain("thread-row-draft");
    expect(draftRow.className).toContain("active");

    fireEvent.click(draftRow);
    expect(onSelectWorkspace).toHaveBeenCalledWith("ws-1");
  });

  it("renders clone agents nested under their source project", () => {
    const { container } = render(
      <Sidebar
        {...baseProps}
        workspaces={[
          {
            id: "ws-1",
            name: "Main Project",
            path: "/tmp/main",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
          {
            id: "ws-2",
            name: "Clone Agent",
            path: "/tmp/main-copy",
            connected: true,
            settings: {
              sidebarCollapsed: false,
              cloneSourceWorkspaceId: "ws-1",
            },
          },
        ]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Workspaces",
            workspaces: [
              {
                id: "ws-1",
                name: "Main Project",
                path: "/tmp/main",
                connected: true,
                settings: { sidebarCollapsed: false },
              },
              {
                id: "ws-2",
                name: "Clone Agent",
                path: "/tmp/main-copy",
                connected: true,
                settings: {
                  sidebarCollapsed: false,
                  cloneSourceWorkspaceId: "ws-1",
                },
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText("Clone agents")).toBeTruthy();
    expect(screen.getByText("Clone Agent")).toBeTruthy();
    expect(container.querySelectorAll(".workspace-row")).toHaveLength(1);
    expect(container.querySelectorAll(".worktree-row")).toHaveLength(1);
  });

  it("sorts by project activity using clone-thread activity for the source project", () => {
    const { container } = render(
      <Sidebar
        {...baseProps}
        threadListOrganizeMode="by_project_activity"
        workspaces={[
          {
            id: "ws-a",
            name: "Alpha Project",
            path: "/tmp/alpha",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
          {
            id: "ws-a-clone",
            name: "Alpha Clone",
            path: "/tmp/alpha-clone",
            connected: true,
            settings: {
              sidebarCollapsed: false,
              cloneSourceWorkspaceId: "ws-a",
            },
          },
          {
            id: "ws-b",
            name: "Beta Project",
            path: "/tmp/beta",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
        ]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Workspaces",
            workspaces: [
              {
                id: "ws-a",
                name: "Alpha Project",
                path: "/tmp/alpha",
                connected: true,
                settings: { sidebarCollapsed: false },
              },
              {
                id: "ws-a-clone",
                name: "Alpha Clone",
                path: "/tmp/alpha-clone",
                connected: true,
                settings: {
                  sidebarCollapsed: false,
                  cloneSourceWorkspaceId: "ws-a",
                },
              },
              {
                id: "ws-b",
                name: "Beta Project",
                path: "/tmp/beta",
                connected: true,
                settings: { sidebarCollapsed: false },
              },
            ],
          },
        ]}
        threadsByWorkspace={{
          "ws-a": [{ id: "thread-a", name: "Alpha root", updatedAt: 100 }],
          "ws-a-clone": [
            { id: "thread-a-clone", name: "Alpha clone thread", updatedAt: 300 },
          ],
          "ws-b": [{ id: "thread-b", name: "Beta root", updatedAt: 200 }],
        }}
      />,
    );

    const workspaceNames = Array.from(
      container.querySelectorAll(".workspace-row .workspace-name"),
    ).map((node) => node.textContent?.trim());
    expect(workspaceNames[0]).toBe("Alpha Project");
    expect(workspaceNames[1]).toBe("Beta Project");
  });

  it("does not show a workspace activity indicator when a thread is processing", () => {
    render(
      <Sidebar
        {...baseProps}
        workspaces={[
          {
            id: "ws-1",
            name: "Workspace",
            path: "/tmp/workspace",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
        ]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Workspaces",
            workspaces: [
              {
                id: "ws-1",
                name: "Workspace",
                path: "/tmp/workspace",
                connected: true,
                settings: { sidebarCollapsed: false },
              },
            ],
          },
        ]}
        threadsByWorkspace={{
          "ws-1": [
            {
              id: "thread-1",
              name: "Thread 1",
              updated_at: new Date().toISOString(),
            } as never,
          ],
        }}
        threadStatusById={{
          "thread-1": { isProcessing: true, hasUnread: false, isReviewing: false },
        }}
      />,
    );

    const indicator = screen.queryByTitle("Streaming updates in progress");
    expect(indicator).toBeNull();
  });
});
