# Office Runtime Integration

This app can ship with a bundled `OfficeCLI` runtime as a built-in Office document engine.

## Packaging contract

Place platform binaries under:

`src-tauri/resources/office-cli/`

Suggested layout:

- `windows-x64/officecli.exe`
- `macos-arm64/officecli`
- `macos-x64/officecli`

Current repository state:

- `windows-x64/officecli.exe` is vendored into the repo.
- `macos-arm64/officecli` is vendored into the repo.
- `macos-x64/officecli` is vendored into the repo.
- Linux is intentionally out of scope for this bundled Office runtime.

At runtime the app:

1. Finds the bundled binary for the current platform.
2. Copies it into the writable app-data runtime directory.
3. Exposes that directory to child Codex sessions through `PATH`.
4. Syncs built-in office skill/workbench assets into `CODEX_HOME`.

## App-side commands

- `office_runtime_info`
- `office_run_command`
- `office_create_document`
- `office_validate_document`
- `office_view_document`
- `office_document_issues`
- `office_merge_template`

These are intended for local mode only.

## Product stance

- Office document handling is a built-in capability, not a user-installed add-on.
- `OfficeCLI` is the default path.
- Windows COM should remain a targeted fallback for edge cases, not the main engine.
