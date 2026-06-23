This directory vendors OfficeCLI release binaries directly into the BlackRain source tree.

Recommended layout examples:

- windows-x64/officecli.exe
- macos-arm64/officecli
- macos-x64/officecli

The app will copy the first matching binary into its writable app-data runtime
directory on first use and then expose that directory to bundled Codex sessions.

Current status:

- windows-x64: bundled
- macos-arm64: bundled
- macos-x64: bundled

Why we vendor binaries here instead of the full OfficeCLI source repository:

- We want the BlackRain installer to ship Office support out of the box.
- We do not need OfficeCLI's full source history or build chain in this repo.
- Our product-specific integration lives in the Tauri runtime bridge, built-in plugin, and office-agent workbench.

Current product scope:

- Windows installers: built-in OfficeCLI runtime
- macOS installers: built-in OfficeCLI runtime
- Linux: not bundled in this product scope
