/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GitLogEntry } from "../../../types";
import { GitDiffPanel } from "./GitDiffPanel";
import { fileManagerName } from "../../../utils/platformPaths";

const showContextMenu = vi.hoisted(() =>
  vi.fn(async (_event: unknown, _entries: Array<{ label?: string; onSelect?: () => unknown }>) => undefined),
);
const clipboardWriteText = vi.hoisted(() => vi.fn());

vi.mock("../../../host/contextMenu", () => ({
  showContextMenu,
}));

const revealPath = vi.hoisted(() => vi.fn());

vi.mock("../../../host/desktop", () => ({
  openExternal: vi.fn(),
  revealPath: (...args: unknown[]) => revealPath(...args),
}));

vi.mock("../../../services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

Object.defineProperty(navigator, "clipboard", {
  value: { writeText: (...args: unknown[]) => clipboardWriteText(...args) },
  configurable: true,
});

const logEntries: GitLogEntry[] = [];

const baseProps = {
  mode: "diff" as const,
  onModeChange: vi.fn(),
  filePanelMode: "git" as const,
  onFilePanelModeChange: vi.fn(),
  branchName: "main",
  totalAdditions: 0,
  totalDeletions: 0,
  fileStatus: "1 file changed",
  logEntries,
  stagedFiles: [],
  unstagedFiles: [],
};

describe("GitDiffPanel", () => {
  it("shows an initialize git button when the repo is missing", () => {
    const onInitGitRepo = vi.fn();
    const { container } = render(
      <GitDiffPanel
        {...baseProps}
        error="not a git repository"
        onInitGitRepo={onInitGitRepo}
      />,
    );

    const initButton = within(container).getByRole("button", { name: "Initialize Git" });
    fireEvent.click(initButton);
    expect(onInitGitRepo).toHaveBeenCalledTimes(1);
  });

  it("does not show initialize git when the git root path is invalid", () => {
    const { container } = render(
      <GitDiffPanel
        {...baseProps}
        error="Git root not found: apps"
        onInitGitRepo={vi.fn()}
      />,
    );

    expect(within(container).queryByRole("button", { name: "Initialize Git" })).toBeNull();
  });

  it("enables commit when message exists and only unstaged changes", () => {
    const onCommit = vi.fn();
    render(
      <GitDiffPanel
        {...baseProps}
        commitMessage="feat: add thing"
        onCommit={onCommit}
        onGenerateCommitMessage={vi.fn()}
        unstagedFiles={[
          { path: "file.txt", status: "M", additions: 1, deletions: 0 },
        ]}
      />,
    );

    const commitButton = screen.getByRole("button", { name: "Commit" });
    expect((commitButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(commitButton);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("runs uncommitted review from unstaged section actions", () => {
    const onReviewUncommittedChanges = vi.fn();
    render(
      <GitDiffPanel
        {...baseProps}
        workspaceId="ws-2"
        onReviewUncommittedChanges={onReviewUncommittedChanges}
        unstagedFiles={[
          { path: "src/file.ts", status: "M", additions: 4, deletions: 1 },
        ]}
      />,
    );

    const reviewButton = screen.getByRole("button", {
      name: "Review uncommitted changes",
    });
    fireEvent.click(reviewButton);
    expect(onReviewUncommittedChanges).toHaveBeenCalledTimes(1);
    expect(onReviewUncommittedChanges).toHaveBeenCalledWith("ws-2");
  });

  it("adds a show in file manager option for file context menus", async () => {
    clipboardWriteText.mockClear();
    const { container } = render(
      <GitDiffPanel
        {...baseProps}
        workspacePath="/tmp/repo"
        gitRoot="/tmp/repo/"
        unstagedFiles={[
          { path: "src/sample.ts", status: "M", additions: 1, deletions: 0 },
        ]}
      />,
    );

    const row = container.querySelector(".diff-row");
    expect(row).not.toBeNull();
    fireEvent.contextMenu(row as Element);

    await waitFor(() => expect(showContextMenu).toHaveBeenCalled());
    const entries = showContextMenu.mock.calls[0]?.[1];
    const revealItem = entries.find(
      (item: { label?: string }) => item.label === `Show in ${fileManagerName()}`,
    );

    expect(revealItem).toBeDefined();
    await revealItem!.onSelect!();
    expect(revealPath).toHaveBeenCalledWith("/tmp/repo/src/sample.ts");
  });

  it("copies file name and path from the context menu", async () => {
    clipboardWriteText.mockClear();
    const { container } = render(
      <GitDiffPanel
        {...baseProps}
        workspacePath="/tmp/repo"
        gitRoot="/tmp/repo"
        unstagedFiles={[
          { path: "src/sample.ts", status: "M", additions: 1, deletions: 0 },
        ]}
      />,
    );

    const row = container.querySelector(".diff-row");
    expect(row).not.toBeNull();
    fireEvent.contextMenu(row as Element);

    await waitFor(() => expect(showContextMenu).toHaveBeenCalled());
    const entries = showContextMenu.mock.calls[showContextMenu.mock.calls.length - 1]?.[1];
    const copyNameItem = entries.find(
      (item: { label?: string }) => item.label === "Copy file name",
    );
    const copyPathItem = entries.find(
      (item: { label?: string }) => item.label === "Copy file path",
    );

    expect(copyNameItem).toBeDefined();
    expect(copyPathItem).toBeDefined();

    await copyNameItem!.onSelect!();
    await copyPathItem!.onSelect!();

    expect(clipboardWriteText).toHaveBeenCalledWith("sample.ts");
    expect(clipboardWriteText).toHaveBeenCalledWith("src/sample.ts");
  });

  it("resolves relative git roots against the workspace path", async () => {
    revealPath.mockClear();
    showContextMenu.mockClear();
    const { container } = render(
      <GitDiffPanel
        {...baseProps}
        workspacePath="/tmp/repo"
        gitRoot="apps"
        unstagedFiles={[
          { path: "src/sample.ts", status: "M", additions: 1, deletions: 0 },
        ]}
      />,
    );

    const row = container.querySelector(".diff-row");
    expect(row).not.toBeNull();
    fireEvent.contextMenu(row as Element);

    await waitFor(() => expect(showContextMenu).toHaveBeenCalled());
    const entries = showContextMenu.mock.calls[showContextMenu.mock.calls.length - 1]?.[1];
    const revealItem = entries.find(
      (item: { label?: string }) => item.label === `Show in ${fileManagerName()}`,
    );

    expect(revealItem).toBeDefined();
    await revealItem!.onSelect!();
    expect(revealPath).toHaveBeenCalledWith("/tmp/repo/apps/src/sample.ts");
  });

  it("copies file path relative to the workspace root", async () => {
    clipboardWriteText.mockClear();
    const { container } = render(
      <GitDiffPanel
        {...baseProps}
        workspacePath="/tmp/repo"
        gitRoot="apps"
        unstagedFiles={[
          { path: "src/sample.ts", status: "M", additions: 1, deletions: 0 },
        ]}
      />,
    );

    const row = container.querySelector(".diff-row");
    expect(row).not.toBeNull();
    fireEvent.contextMenu(row as Element);

    await waitFor(() => expect(showContextMenu).toHaveBeenCalled());
    const entries = showContextMenu.mock.calls[showContextMenu.mock.calls.length - 1]?.[1];
    const copyPathItem = entries.find(
      (item: { label?: string }) => item.label === "Copy file path",
    );

    expect(copyPathItem).toBeDefined();
    await copyPathItem!.onSelect!();

    expect(clipboardWriteText).toHaveBeenCalledWith("apps/src/sample.ts");
  });

  it("does not trim paths when the git root only shares a prefix", async () => {
    clipboardWriteText.mockClear();
    const { container } = render(
      <GitDiffPanel
        {...baseProps}
        workspacePath="/tmp/repo"
        gitRoot="/tmp/repo-tools"
        unstagedFiles={[
          { path: "src/sample.ts", status: "M", additions: 1, deletions: 0 },
        ]}
      />,
    );

    const row = container.querySelector(".diff-row");
    expect(row).not.toBeNull();
    fireEvent.contextMenu(row as Element);

    await waitFor(() => expect(showContextMenu).toHaveBeenCalled());
    const entries = showContextMenu.mock.calls[showContextMenu.mock.calls.length - 1]?.[1];
    const copyPathItem = entries.find(
      (item: { label?: string }) => item.label === "Copy file path",
    );

    expect(copyPathItem).toBeDefined();
    await copyPathItem!.onSelect!();

    expect(clipboardWriteText).toHaveBeenCalledWith("src/sample.ts");
  });

  it("shows Agent edits option in mode selector", () => {
    render(<GitDiffPanel {...baseProps} />);
    const options = screen.getAllByRole("option", { name: "Agent edits" });
    expect(options.length).toBeGreaterThan(0);
  });

  it("renders per-file groups and edit rows", () => {
    const onSelectFile = vi.fn();
    const { container } = render(
      <GitDiffPanel
        {...baseProps}
        mode="perFile"
        onSelectFile={onSelectFile}
        selectedPath={null}
        perFileDiffGroups={[
          {
            path: "src/main.ts",
            edits: [
              {
                id: "src/main.ts@@item-change-1@@change-0",
                path: "src/main.ts",
                label: "Edit 1",
                status: "M",
                diff: "diff --git a/src/main.ts b/src/main.ts",
                sourceItemId: "change-1",
                additions: 1,
                deletions: 0,
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: /main\.ts/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /src\/main\.ts/i })).toBeNull();
    expect(
      (container.querySelector(".per-file-edit-stat-add") as HTMLElement | null)?.textContent,
    ).toBe("+1");
    fireEvent.click(screen.getByRole("button", { name: /Edit 1/i }));
    expect(onSelectFile).toHaveBeenCalledWith(
      "src/main.ts@@item-change-1@@change-0",
    );
  });

});
