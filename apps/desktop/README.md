# BlackRain Desktop

BlackRain Desktop is the Windows Electron client for the upstream Codex app-server. The original `codex.exe app-server` remains the only agent runtime.

## Development

Requirements: Windows 11 x64 and Node.js `22.12.x`.

```powershell
npm.cmd ci
npm.cmd run electron:start
```

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run test
npm.cmd run lint
npm.cmd run check:host-boundary
npm.cmd run electron:runtime:verify
npm.cmd run electron:node-runtime:verify
npm.cmd run electron:browser-client:verify
npm.cmd run electron:app-server:probe
npm.cmd run electron:package
npm.cmd run electron:smoke
npm.cmd run electron:e2e
npm.cmd run electron:make:release
```

Windows release acceptance requires a signed MSIX and the product matrix in `.specs/002-electron-migration/verification.md`. Automated package and smoke results do not replace installation, upgrade, rollback, uninstall, login/MFA, input method, DPI, multi-monitor, sleep/resume, and crash-recovery acceptance.

## Architecture

- `electron/main`: window, app-server lifecycle, browser, files, Git, terminal, updates and system permissions.
- `electron/preload`: typed allowlisted host API.
- `src`: React renderer without Node.js or raw IPC access.
- `resources`: pinned Codex, Node and Browser client release resources.

See the repository root documentation and `.specs/002-electron-migration/` for product boundaries and current evidence.
