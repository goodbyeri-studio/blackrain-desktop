# BlackRain Desktop application

This is the Electron product application for the open-source Codex Desktop. It uses the original `codex app-server` / `codex-rs` as the only agent runtime; Electron owns the desktop host and Browser.

macOS is the current release target. Existing Windows-oriented packaging scripts are historical migration state, not a macOS release path.

```sh
npm ci
npm run electron:start
npm run typecheck
npm run test
npm run lint
npm run check:host-boundary
```

Read the [repository README](../../README.md), [architecture](../../docs/architecture.md), [Browser contract](../../docs/browser.md), and [development guide](../../docs/development.md) before changing this application.
