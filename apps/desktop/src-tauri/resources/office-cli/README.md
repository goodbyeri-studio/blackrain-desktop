> **Status (2026-07-26): paused asset.** Office/workbench delivery is not part of the current Electron/Codex-first P0/P1.

This directory vendors OfficeCLI release binaries into the BlackRain package resource tree.
Executable binaries are tracked through Git LFS.

Upstream and license:

- Source: <https://github.com/iOfficeAI/OfficeCLI>
- License: Apache-2.0; retained as `LICENSE-OfficeCLI.txt`
- Vendor metadata and intended platform paths: `VENDOR.json`
- Checksums: `SHA256SUMS`

Recommended layout examples:

- windows-x64/officecli.exe
- macos-arm64/officecli
- macos-x64/officecli

When the resource is present and runtime preparation succeeds, the app code copies the first matching binary into its writable app-data runtime directory and exposes that directory to Codex sessions. Current Windows installer behavior is still unverified.

Current status:

- windows-x64: tracked and mapped by `tauri.windows.conf.json`; installer inclusion not yet verified
- macos-arm64: tracked historical/post-MVP asset
- macos-x64: tracked historical/post-MVP asset

Why we vendor binaries here instead of the full OfficeCLI source repository:

- The product target is for the BlackRain installer to ship Office support out of the box.
- We do not need OfficeCLI's full source history or build chain in this repo.
- Our product-specific integration lives in the Tauri runtime bridge, built-in plugin, and the current office-agent content skeleton. The installable workbench lifecycle is specified separately in `.specs/008-expert-workbench-package/` and is not implemented by this resource directory.

Current product scope:

- Windows installer config: OfficeCLI runtime mapping exists; build/unpack/install smoke is pending
- macOS installers: not built or validated for the current MVP
- Linux: not bundled in this product scope

This resource inventory proves only that binaries/assets are present. Windows installer inclusion and installed-runtime behavior require the NSIS smoke recorded in `.specs/007-windows-client/verification.md`; workbench installation and lifecycle require `.specs/008-expert-workbench-package/verification.md`.

Before release, the distributable NOTICE/third-party attribution must explicitly register OfficeCLI and the packaged installer must retain the license/vendor metadata. `apps/desktop/NOTICE` has not yet been updated for OfficeCLI.
