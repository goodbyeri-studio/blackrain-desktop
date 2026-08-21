type HomeActionsProps = {
  onAddWorkspace: () => void;
  onAddWorkspaceFromUrl: () => void;
};

export function HomeActions({
  onAddWorkspace,
  onAddWorkspaceFromUrl,
}: HomeActionsProps) {
  return (
    <div className="home-actions">
      <button
        className="home-button primary home-add-workspaces-button"
        onClick={onAddWorkspace}
        data-electron-drag-region="false"
      >
        <span className="home-icon" aria-hidden>
          +
        </span>
        Add Workspaces
      </button>
      <button
        className="home-button secondary home-add-workspace-from-url-button"
        onClick={onAddWorkspaceFromUrl}
        data-electron-drag-region="false"
      >
        <span className="home-icon" aria-hidden>
          ⤓
        </span>
        Add Workspace from URL
      </button>
    </div>
  );
}
