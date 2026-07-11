# BlackRain Desktop Agent Guide

BlackRain-owned docs should describe current live state by default. Explicitly labeled upstream snapshots, historical protocol baselines and POC records may be retained, but must never be presented as current product truth.

## Scope

This file is the agent contract for how to work in this repo.
Detailed navigation/runbooks live in:

- `docs/codebase-map.md` (task-oriented file map: "if you need X, edit Y")
- `docs/multi-agent-sync-runbook.md` (upstream `../../codex-upstream` sync checklist for multi-agent/config behavior)
- `../../README.md` (repository status and product entry)
- `../../docs/commands.md` (canonical setup/build/release commands)
- `../../.specs/008-expert-workbench-package/` (workbench package and lifecycle contract)

## Project Snapshot

BlackRain Desktop is the Core runtime for installable expert workbenches. It is a Tauri app derived from CodexMonitor. The current tracked implementation primarily orchestrates Codex agents; the workbench-first information architecture, WORK/Hermes product integration, and workbench lifecycle must not be described as complete until they are wired and verified.

- Frontend: React + Vite (`src/`)
- Backend app: Tauri Rust process (`src-tauri/src/lib.rs`)
- Backend daemon: JSON-RPC process (`src-tauri/src/bin/blackrain_daemon.rs`)
- Shared backend source of truth: `src-tauri/src/shared/*`

## Non-Negotiable Architecture Rules

1. Put shared/domain backend logic in `src-tauri/src/shared/*` first.
2. Keep app and daemon as thin adapters around shared cores.
3. Do not duplicate logic between app and daemon.
4. Keep JSON-RPC method names and payload shapes stable unless intentionally changing contracts.
5. Keep frontend IPC contracts in sync with backend command surfaces.
6. Workbench packages declare desired state; only the App/Core may install resources or write engine activation config. Do not let a workbench become a second configuration writer.

## Backend Routing Rules

For backend behavior changes, follow this order:

1. Shared core (`src-tauri/src/shared/*`) when behavior is cross-runtime.
2. App adapter and Tauri command surface (`src-tauri/src/lib.rs` + adapter module).
3. Frontend IPC wrapper (`src/services/tauri.ts`).
4. Daemon RPC surface (`src-tauri/src/bin/blackrain_daemon/rpc.rs` + `rpc/*`).

If you add a backend command, update all relevant layers and tests.

## Frontend Routing Rules

- Keep `src/App.tsx` as composition/wiring root.
- Move stateful orchestration into:
  - `src/features/app/hooks/*`
  - `src/features/app/bootstrap/*`
  - `src/features/app/orchestration/*`
- Keep presentational UI in feature components.
- Keep Tauri calls in `src/services/tauri.ts` only.
- Keep event subscription fanout in `src/services/events.ts`.

## Import Aliases

Use project aliases for frontend imports:

- `@/*` -> `src/*`
- `@app/*` -> `src/features/app/*`
- `@settings/*` -> `src/features/settings/*`
- `@threads/*` -> `src/features/threads/*`
- `@services/*` -> `src/services/*`
- `@utils/*` -> `src/utils/*`

## Key File Anchors

- Frontend composition root: `src/App.tsx`
- Frontend IPC wrapper: `src/services/tauri.ts`
- Frontend event hub: `src/services/events.ts`
- App command registry: `src-tauri/src/lib.rs`
- Daemon entrypoint: `src-tauri/src/bin/blackrain_daemon.rs`
- Daemon RPC router: `src-tauri/src/bin/blackrain_daemon/rpc.rs`
- Shared workspaces core: `src-tauri/src/shared/workspaces_core.rs` + `src-tauri/src/shared/workspaces_core/*`
- Shared git UI core: `src-tauri/src/shared/git_ui_core.rs` + `src-tauri/src/shared/git_ui_core/*`
- Threads reducer entrypoint: `src/features/threads/hooks/useThreadsReducer.ts`
- Threads reducer slices: `src/features/threads/hooks/threadReducer/*`

For broader path maps, use `docs/codebase-map.md`.

## Thread Hierarchy Invariants

- `setThreads` reconciliation must preserve incoming order while retaining required local anchors (active/processing/ancestor summaries) when payloads are partial.
- Never resurrect hidden threads during reconciliation (`hiddenThreadIdsByWorkspace` still wins).
- `useThreadRows` renders children under parents only when parent summaries are present in the visible list; missing parent summaries will promote children to roots.

## Follow-up Behavior Map

For Queue vs Steer follow-up behavior, start here:

- Settings model + defaults: `src/types.ts`, `src/features/settings/hooks/useAppSettings.ts`
- Settings persistence/migration: `src-tauri/src/types.rs`, `src-tauri/src/storage.rs`
- Composer runtime behavior: `src/features/composer/components/Composer.tsx`
- Send intent routing: `src/features/threads/hooks/useQueuedSend.ts`, `src/features/threads/hooks/useThreadMessaging.ts`
- App/layout wiring: `src/features/app/hooks/useComposerController.ts`, `src/features/layout/hooks/layoutNodes/buildPrimaryNodes.tsx`, `src/App.tsx`

## App/Daemon Parity Checklist

When changing backend behavior that can run remotely:

1. Shared core logic updated (or explicitly app-only/daemon-only).
2. App surface updated (`src-tauri/src/lib.rs` + adapter).
3. Frontend IPC updated (`src/services/tauri.ts`) when needed.
4. Daemon RPC updated (`rpc.rs` + `rpc/*`) when needed.
5. Contract/test coverage updated.

## Design System Rule (High-Level)

Use existing design-system primitives and tokens for shared shell chrome.
Do not reintroduce duplicated modal/toast/panel/popover shell styling in feature CSS.

(See existing DS files and lint guardrails for implementation details.)

## Safety and Git Behavior

- Prefer safe git operations (`status`, `diff`, `log`).
- Do not reset/revert unrelated user changes.
- If unrelated changes appear, continue focusing on owned files unless they block correctness.
- If conflicts impact correctness, call them out and choose the safest path.
- Fix root cause, not band-aids.

## Validation Matrix

Run validations based on touched areas:

- Always: `npm run typecheck`
- Frontend behavior/state/hooks/components: `npm run test`
- Rust backend changes: `cd src-tauri && cargo check`
- Use targeted tests for touched modules before full-suite runs when iterating.

## Quick Runbook

Canonical Windows setup, dev, validation and release commands live in `../../docs/commands.md`; do not maintain a second command list here. Run commands from the working directory specified there. macOS/Linux commands remain upstream or post-MVP references only and are not required validation for the current release line.

During iteration, focused test filtering is allowed for the touched module, followed by the validation set required by the change scope above.

## Hotspots

Use extra care in high-churn/high-complexity files:

- `src/App.tsx`
- `src/features/settings/components/SettingsView.tsx`
- `src/features/threads/hooks/useThreadsReducer.ts`
- `src-tauri/src/shared/git_ui_core.rs`
- `src-tauri/src/shared/workspaces_core.rs`
- `src-tauri/src/bin/blackrain_daemon/rpc.rs`

## Canonical References

- Task-oriented code map: `docs/codebase-map.md`
- Multi-agent upstream sync runbook: `docs/multi-agent-sync-runbook.md`
- Repository status: `../../README.md`
- Setup/build/release/test commands: `../../docs/commands.md`
