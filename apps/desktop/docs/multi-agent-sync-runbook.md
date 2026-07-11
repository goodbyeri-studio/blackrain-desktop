# BlackRain Multi-Agent Sync Runbook

## Purpose

Keep BlackRain Desktop's Agents settings behavior in sync with the repository-local Codex checkout (`../../codex-upstream`) whenever the intended lock changes.

> The repository-level intended lock is authoritative. A local ignored checkout or `scripts/fetch-references.sh` comment is not proof that the lock is actually checked out; record `git rev-parse HEAD` in the relevant verification file.

- multi-agent feature flags
- `[agents]` config schema
- role resolution/config-file semantics
- role defaults (including built-ins)

## When To Run This

- After updating or checking out `../../codex-upstream`
- Before changing `src-tauri/src/shared/agents_config_core.rs`
- When users report a mismatch between BlackRain settings and Codex runtime behavior

## Upstream Source Of Truth (Check These First)

1. Feature keys, stages, defaults and legacy aliases:
- `../../codex-upstream/codex-rs/features/src/lib.rs`
- `../../codex-upstream/codex-rs/features/src/legacy.rs`
- `../../codex-upstream/codex-rs/features/src/feature_configs.rs`

2. Config schema + parsing:
- `../../codex-upstream/codex-rs/core/src/config/mod.rs`
- `../../codex-upstream/codex-rs/core/config.schema.json`

3. Role loading and built-ins:
- `../../codex-upstream/codex-rs/core/src/agent/role.rs`
- `../../codex-upstream/codex-rs/core/src/agent/builtins/explorer.toml`

4. Runtime thread-limit behavior:
- `../../codex-upstream/codex-rs/core/src/agent/control.rs`
- `../../codex-upstream/codex-rs/core/src/tools/handlers/multi_agents.rs`
- `../../codex-upstream/codex-rs/core/src/tools/handlers/multi_agents/*`
- `../../codex-upstream/codex-rs/core/src/tools/handlers/multi_agents_v2.rs`
- `../../codex-upstream/codex-rs/core/src/tools/handlers/multi_agents_v2/*`
- `../../codex-upstream/codex-rs/core/src/session/multi_agents.rs`

Notes:
- `../../codex-upstream/docs/config.md` points to web docs; treat code + schema above as canonical for compatibility work.

## Fast Upstream Diff Commands

Run from `apps/desktop/`:

```bash
cd ../../codex-upstream

git log --oneline -- \
  codex-rs/features/src/lib.rs \
  codex-rs/features/src/legacy.rs \
  codex-rs/features/src/feature_configs.rs \
  codex-rs/core/src/config/mod.rs \
  codex-rs/core/config.schema.json \
  codex-rs/core/src/agent/role.rs \
  codex-rs/core/src/agent/builtins/explorer.toml \
  codex-rs/core/src/agent/control.rs \
  codex-rs/core/src/tools/handlers/multi_agents.rs \
  codex-rs/core/src/tools/handlers/multi_agents_v2.rs \
  codex-rs/core/src/session/multi_agents.rs

rg -n "multi_agent_v2|multi_agent|max_concurrent_threads_per_session|max_threads|max_depth|AgentsToml|AgentRoleToml|config_file|apply_role_to_config|DEFAULT_ROLE_NAME|explorer|wait_agent|followup_task" \
  codex-rs/features/src/lib.rs \
  codex-rs/features/src/legacy.rs \
  codex-rs/features/src/feature_configs.rs \
  codex-rs/core/src/config/mod.rs \
  codex-rs/core/src/agent/role.rs \
  codex-rs/core/src/agent/control.rs \
  codex-rs/core/src/tools/handlers/multi_agents.rs \
  codex-rs/core/src/tools/handlers/multi_agents_v2.rs \
  codex-rs/core/src/session/multi_agents.rs
```

## BlackRain Files To Update If Upstream Changes

1. Shared read/write core:
- `src-tauri/src/shared/agents_config_core.rs`

2. Tauri/app + daemon adapters (keep parity):
- `src-tauri/src/codex/mod.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/bin/blackrain_daemon.rs`
- `src-tauri/src/bin/blackrain_daemon/rpc/codex.rs`
- `src-tauri/src/remote_backend/mod.rs`

3. Frontend settings contracts + UI:
- `src/services/tauri.ts`
- `src/features/settings/hooks/useSettingsAgentsSection.ts`
- `src/features/settings/hooks/useSettingsViewOrchestration.ts`
- `src/features/settings/components/sections/SettingsAgentsSection.tsx`
- `src/features/settings/components/sections/SettingsSectionContainers.tsx`

4. Tests:
- `src/services/tauri.test.ts`
- `src/features/settings/components/SettingsView.test.tsx`

## Sync Checklist

1. Feature flags
- Verify upstream v1 key remains `features.multi_agent` and legacy `collab` remains only an alias.
- Verify `features.multi_agent_v2` stage/default/config shape independently; do not treat it as a rename of v1.
- BlackRain currently reads/writes only v1 `features.multi_agent`; do not silently enable v2 from this UI.

2. Agents schema
- Verify `[agents]` shape still supports `max_threads`, `max_depth`, plus dynamic role tables.
- Verify role fields (`description`, `config_file`) and path semantics.
- Verify v2 settings under `[features.multi_agent_v2]` (for example `max_concurrent_threads_per_session` and wait timeouts).
- Verify the upstream conflict rule: enabling v2 while `[agents].max_threads` exists is rejected. BlackRain currently always writes `agents.max_threads`, so v2 needs an explicit migration/UI design before exposure.

3. Defaults/validation
- Check upstream default for `agents.max_threads` and validation constraints.
- Check upstream default for `agents.max_depth` and validation constraints.
- Reconcile BlackRain guardrails when upstream changes.

4. Role setup behavior
- Verify built-in role names/descriptions and built-in config files (currently includes `explorer.toml`).
- Verify per-role override keys used in role configs (for example `model`, `model_reasoning_effort`).

5. Runtime behavior
- Verify thread-limit enforcement still flows through agent control spawn/resume paths.
- Verify v1 tools separately: `spawn_agent`, `send_input`, `wait_agent`, `close_agent`, `resume_agent` (normally under the v1 namespace).
- Verify v2 tools separately: `spawn_agent`, `send_message`, `followup_task`, `wait_agent`, `interrupt_agent`, `list_agents`.
- Verify the selected version, namespace and tool visibility in the actual session; shared names do not imply identical payloads or semantics.

## Current Divergence / Compatibility Blockers

- Upstream Codex default `agents.max_threads` is `6`.
- BlackRain default `agents.max_depth` is `1`.
- BlackRain currently enforces a product cap of `12` for `agents.max_threads` and `4` for `agents.max_depth` in UI + backend.
- Upstream v1 `multi_agent` is stable/default-enabled in the inspected checkout, while BlackRain treats a missing flag as disabled. Confirm whether this product divergence is intentional before changing defaults.
- BlackRain's settings writer always persists `[agents].max_threads`; upstream rejects that key when `features.multi_agent_v2` is enabled. Until the settings model is version-aware, v2 must remain unavailable in the UI and be called out as incompatible with the current writer.

If upstream changes defaults, hard limits, v1/v2 compatibility or spawn behavior, update both:

- `src-tauri/src/shared/agents_config_core.rs`
- `src/features/settings/components/sections/SettingsAgentsSection.tsx`

## Validation Before Merge

```bash
npm run typecheck
npm run test -- src/services/tauri.test.ts src/features/settings/components/sections/SettingsAgentsSection.test.tsx src/features/settings/components/SettingsView.test.tsx
cd src-tauri && cargo check
```
