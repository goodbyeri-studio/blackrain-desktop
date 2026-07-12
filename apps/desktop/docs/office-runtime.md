# Office Runtime Integration

This app can ship with a bundled `OfficeCLI` runtime as a built-in Office document engine.

> **Current product boundary:** OfficeCLI binaries/resources, the runtime bridge, Codex-side asset injection code and Windows NSIS resource mapping exist. The current Windows installer has not completed build/unpack/install smoke, the WORK/Hermes surface is not integrated, and the workbench package lifecycle in spec 008 is not implemented. This document is not evidence that the packaged Office runtime or Office workbench is available to users.

## Packaging contract

Place platform binaries under:

`src-tauri/resources/office-cli/`

Suggested layout:

- `windows-x64/officecli.exe`
- `macos-arm64/officecli`
- `macos-x64/officecli`

Current repository state:

- `windows-x64/officecli.exe` is vendored into the repo.
- `macos-arm64/officecli` and `macos-x64/officecli` remain tracked as historical/post-MVP assets; BlackRain MVP does not package or validate macOS.
- Linux is intentionally out of scope for this bundled Office runtime.
- OfficeCLI executable files are tracked with Git LFS. Run `git lfs pull` before packaging if checkout did not fetch LFS objects.

When the resource is present and runtime preparation succeeds, the code path:

1. Finds the bundled binary for the current platform.
2. Copies it into the writable app-data runtime directory.
3. Exposes that directory to child Codex sessions through `PATH`.
4. Syncs built-in office skill/workbench content assets into `CODEX_HOME`.

The current implementation proves that repository resources and a CODE-side preparation path exist; it does not prove current Windows installer inclusion or installed-runtime behavior. Those require `.specs/007-windows-client/verification.md`. A real installable workbench also requires `.specs/008-expert-workbench-package/`; moving the experience under WORK requires the Hermes runtime/surface work in `.specs/003-dual-engine-architecture/`.

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
