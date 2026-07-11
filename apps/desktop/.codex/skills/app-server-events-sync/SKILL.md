---
name: app-server-events-sync
description: Maintain BlackRain Desktop and Codex app-server protocol parity. Use when asked to audit supported or missing app-server notifications/requests, trace event routing, diagnose schema drift in app-server payloads, or update docs/app-server-events.md after upstream Codex changes.
---

# App-Server Events Sync

Use this skill to keep BlackRain Desktop app-server integration accurate as the repository-local `../../codex-upstream` evolves.

## Canonical Source

Start with:
- `docs/app-server-events.md`

Treat that file as the canonical runbook and update it when behavior changes.

## Workflow

1. Confirm upstream baseline:
- From `apps/desktop/`, read the checked-out hash from `../../codex-upstream`, compare it with the repository-level intended lock, and update the hash/status banner in `docs/app-server-events.md`.

2. Compare notification methods:
- Diff Codex v2 notification method set against BlackRain routing in `src/utils/appServerEvents.ts` and `src/features/app/hooks/useAppServerEvents.ts`.
- Update `Supported Events` and `Missing Events` sections in `docs/app-server-events.md`.

3. Compare request methods:
- Diff Codex v2 client/server request sets against BlackRain outgoing and inbound handling.
- Update `Supported Requests`, `Missing Client Requests`, and `Server Requests` sections.

4. Investigate schema drift when lists look unchanged:
- Inspect v2 payload structs in `../../codex-upstream/codex-rs/app-server-protocol/src/protocol/v2.rs`.
- Compare parser and normalization edges in `src/utils/appServerEvents.ts`, `src/features/app/hooks/useAppServerEvents.ts`, and `src/features/threads/utils/threadNormalize.ts`.

5. Implement support when requested:
- Add method/type support at parsing edges first.
- Route in app event hook.
- Update thread/item reducers and rendering only if needed.
- Keep app/daemon parity and avoid duplicated logic.

6. Validate:
- Run targeted tests for touched files.
- Run `npm run typecheck`.
- Run `npm run test` for frontend behavior changes.
- Run `cd src-tauri && cargo check` for backend changes.

## Key Files

- Routing/types: `src/utils/appServerEvents.ts`
- Event router: `src/features/app/hooks/useAppServerEvents.ts`
- Handler composition: `src/features/threads/hooks/useThreadEventHandlers.ts`
- Item/turn handlers: `src/features/threads/hooks/useThreadItemEvents.ts`, `src/features/threads/hooks/useThreadTurnEvents.ts`
- Normalization: `src/features/threads/utils/threadNormalize.ts`
- State: `src/features/threads/hooks/useThreadsReducer.ts`
- Outgoing requests: `src/services/tauri.ts`, `src-tauri/src/shared/codex_core.rs`
- Daemon RPC: `src-tauri/src/bin/blackrain_daemon/rpc.rs` and `rpc/*`

## References

- Quick command set: `references/quick-commands.md`
- Canonical runbook: `docs/app-server-events.md`

## Output Expectations

When asked for an audit or update:
- Report concrete supported and missing method deltas.
- Cite exact files that need edits.
- Update `docs/app-server-events.md` in the same change when behavior changed.
- Distinguish “wiring exists”, “protocol shape verified”, “GUI/Windows verified”, and “release-ready”; never collapse them into one completion claim.
- Call out deliberate non-support explicitly (for example deprecated methods).
