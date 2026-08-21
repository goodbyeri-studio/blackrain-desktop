# App-Server Events Reference（当前上游锁：Codex rust-v0.146.0 / `e363b08c9175ac1cbe5893615dd2cb9ddf95043b`）

> **状态说明（2026-08-05）**：本文件的长清单保留历史方法审计；当前实现与验证只看 Electron shared schema、main App Server runtime、fixture 测试及 `.specs/002-electron-migration/verification.md`。锁升级后必须重跑 bundled probe，不得从历史清单推导 Windows 产品通过。

This document helps agents quickly answer:
- Which app-server events the BlackRain shell routed at the recorded baseline.
- Which requests were recorded at that baseline, and how to refresh them.
- Where to look in BlackRain to add support.
- Where to look in `../../codex-upstream` to compare event lists and find emitters.

When updating this document:
1. From `apps/desktop/`, fetch refs with `git -C ../../codex-upstream fetch --all --prune`.
2. Checkout or inspect the repository-level locked commit, then update the hash in the title.
3. Compare Codex events vs BlackRain routing.
4. Compare Codex client request methods vs BlackRain outgoing request methods.
5. Compare Codex server request methods vs BlackRain inbound request handling.
6. Update supported and missing lists below.

## Where To Look In BlackRain Desktop

Primary app-server event source of truth (methods + typed parsing helpers):
- `electron/shared/agent.ts`

Primary event router:
- `src/services/events.ts`

Event handler composition:
- `src/features/threads/hooks/`

Thread/turn/item handlers:
- `src/features/threads/hooks/useThreadTurnEvents.ts`
- `src/features/threads/hooks/useThreadItemEvents.ts`
- `src/features/threads/hooks/useThreadApprovalEvents.ts`
- `src/features/threads/hooks/useThreadUserInputEvents.ts`
- `src/features/skills/hooks/useSkills.ts`

State updates:
- `src/features/threads/hooks/useThreadsReducer.ts`

Item normalization / display shaping:
- `src/utils/threadItems.ts`

UI rendering of items:
- `src/features/messages/components/Messages.tsx`

Primary outgoing request layer:
- `src/services/desktop.ts`
- `electron/shared/agent.ts`
- `electron/main/app-server/app-server-runtime.ts`
- `electron/main/ipc/register-ipc.ts`

## Supported Notifications (Codex v2)

These are the Codex v2 `ServerNotification` methods that BlackRain supported at
the recorded baseline in `src/utils/appServerEvents.ts` (`SUPPORTED_APP_SERVER_METHODS`) and
then either routes in `useAppServerEvents.ts` or handles in feature-specific
subscriptions.

- `account/login/completed`
- `account/rateLimits/updated`
- `account/updated`
- `app/list/updated`
- `error`
- `hook/completed`
- `hook/started`
- `item/agentMessage/delta`
- `item/commandExecution/outputDelta`
- `item/commandExecution/terminalInteraction`
- `item/completed`
- `item/fileChange/outputDelta`
- `item/plan/delta`
- `item/reasoning/summaryPartAdded`
- `item/reasoning/summaryTextDelta`
- `item/reasoning/textDelta`
- `item/started`
- `thread/archived`
- `thread/closed`
- `thread/name/updated`
- `thread/started`
- `thread/status/changed`
- `thread/tokenUsage/updated`
- `thread/unarchived`
- `turn/completed`
- `turn/diff/updated`
- `turn/plan/updated`
- `turn/started`

## Additional Stream Methods Handled In BlackRain

These arrive on the same frontend event stream but are not Codex v2
`ServerNotification` methods:

- approval requests ending in `requestApproval`, including
  `item/commandExecution/requestApproval`,
  `item/fileChange/requestApproval`, and
  `item/permissions/requestApproval`, via suffix match in
  `isApprovalRequestMethod(method)`
- `item/tool/requestUserInput` (a Codex v2 server request, not a notification)
- `codex/backgroundThread` (历史兼容事件；不属于当前 Electron 生产入口)
- `codex/connected` (历史兼容事件；不属于当前 Electron 生产入口)
- `codex/event/skills_update_available` (handled via
  `isSkillsUpdateAvailableEvent(...)` in `useSkills.ts`)

## Conversation Compaction Signals (Codex v2)

At the recorded baseline, Codex exposed two compaction signals:

- Preferred: `item/started` + `item/completed` with `item.type = "contextCompaction"` (`ThreadItem::ContextCompaction`).
- Deprecated: `thread/compacted` (`ContextCompactedNotification`).

Recorded BlackRain status:

- It routes `item/started` and `item/completed`, so the preferred signal reaches the frontend event layer.
- It renders/stores `contextCompaction` items via the normal item lifecycle.
- It no longer routes deprecated `thread/compacted`.

## Missing Events at the Recorded Baseline (Codex v2 Notifications)

Compared against Codex app-server protocol v2 notifications at that historical
baseline, the following events were not routed:

- `configWarning`
- `command/exec/outputDelta`
- `deprecationNotice`
- `fuzzyFileSearch/sessionCompleted`
- `fuzzyFileSearch/sessionUpdated`
- `item/mcpToolCall/progress`
- `item/autoApprovalReview/completed`
- `item/autoApprovalReview/started`
- `mcpServer/oauthLogin/completed`
- `mcpServer/startupStatus/updated`
- `model/rerouted`
- `rawResponseItem/completed`
- `serverRequest/resolved`
- `skills/changed`
- `thread/compacted` (deprecated; intentionally not routed)
- `thread/realtime/closed`
- `thread/realtime/error`
- `thread/realtime/itemAdded`
- `thread/realtime/outputAudio/delta`
- `thread/realtime/started`
- `thread/realtime/transcriptUpdated`
- `windows/worldWritableWarning`
- `windowsSandbox/setupCompleted`

## Supported Requests at the Recorded Baseline (BlackRain -> App-Server, v2)

These are v2 request methods recorded for the BlackRain shell at this historical baseline:

- `thread/start`
- `thread/resume`
- `thread/fork`
- `thread/list`
- `thread/archive`
- `thread/compact/start`
- `thread/name/set`
- `turn/start`
- `turn/steer` (used for explicit steer follow-ups while a turn is active)
- `turn/interrupt`
- `review/start`
- `model/list`
- `experimentalFeature/list`
- `collaborationMode/list`
- `mcpServerStatus/list`
- `account/login/start`
- `account/login/cancel`
- `account/rateLimits/read`
- `account/read`
- `skills/list`
- `app/list`

Notes:
- At the recorded baseline, `turn/start` forwarded the optional `serviceTier` override (`"fast"` for `/fast`, `null` for default/off) alongside `model`, `effort`, and `collaborationMode`.

## Missing Client Requests (Codex v2 ClientRequest Methods)

Compared against Codex v2 request methods at the recorded baseline, the shell did not send:

- `account/logout`
- `command/exec`
- `command/exec/resize`
- `command/exec/terminate`
- `command/exec/write`
- `config/batchWrite`
- `config/mcpServer/reload`
- `config/read`
- `config/value/write`
- `configRequirements/read`
- `externalAgentConfig/detect`
- `externalAgentConfig/import`
- `feedback/upload`
- `fs/copy`
- `fs/createDirectory`
- `fs/getMetadata`
- `fs/readDirectory`
- `fs/readFile`
- `fs/remove`
- `fs/writeFile`
- `fuzzyFileSearch/sessionStart`
- `fuzzyFileSearch/sessionStop`
- `fuzzyFileSearch/sessionUpdate`
- `mcpServer/oauth/login`
- `mock/experimentalMethod`
- `plugin/install`
- `plugin/list`
- `plugin/read`
- `plugin/uninstall`
- `skills/config/write`
- `thread/backgroundTerminals/clean`
- `thread/decrement_elicitation`
- `thread/increment_elicitation`
- `thread/loaded/list`
- `thread/metadata/update`
- `thread/read`
- `thread/realtime/appendAudio`
- `thread/realtime/appendText`
- `thread/realtime/start`
- `thread/realtime/stop`
- `thread/rollback`
- `thread/shellCommand`
- `thread/unarchive`
- `thread/unsubscribe`
- `windowsSandbox/setupStart`

## Server Requests at the Recorded Baseline (App-Server -> BlackRain, v2)

Supported server requests at that baseline:

- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`
- `item/permissions/requestApproval`
- `item/tool/requestUserInput`

Missing server requests at that baseline:

- `item/tool/call`
- `account/chatgptAuthTokens/refresh`
- `mcpServer/elicitation/request`

## Where To Look In ../../codex-upstream

Start here for the authoritative v2 notification list:
- `../../codex-upstream/codex-rs/app-server-protocol/src/protocol/common.rs`

Useful follow-ups:
- Notification payload types:
  - `../../codex-upstream/codex-rs/app-server-protocol/src/protocol/v2.rs`
- Emitters / wiring from core events to server notifications:
  - `../../codex-upstream/codex-rs/app-server/src/bespoke_event_handling.rs`
- Human-readable protocol notes:
  - `../../codex-upstream/codex-rs/app-server/README.md`

## Quick Comparison Workflow

Use this workflow to update the lists above:

1. Get the current Codex hash:
   - `git -C ../../codex-upstream fetch --all --prune && git -C ../../codex-upstream rev-parse HEAD`
2. List Codex v2 notification methods:
   - `git -C ../../codex-upstream show HEAD:codex-rs/app-server-protocol/src/protocol/common.rs | awk '/server_notification_definitions! \\{/,/client_notification_definitions! \\{/' | rg -N -o '=>\\s*\"[^\"]+\"|rename = \"[^\"]+\"' | sed -E 's/.*\"([^\"]+)\".*/\\1/' | sort -u`
3. List BlackRain routed methods:
   - `rg -n \"SUPPORTED_APP_SERVER_METHODS\" src/utils/appServerEvents.ts`
4. Update the Supported and Missing sections.

## Quick Request Comparison Workflow

Use this workflow to update request support lists:

1. Get the current Codex hash:
   - `git -C ../../codex-upstream fetch --all --prune && git -C ../../codex-upstream rev-parse HEAD`
2. List Codex client request methods:
   - `git -C ../../codex-upstream show HEAD:codex-rs/app-server-protocol/src/protocol/common.rs | awk '/client_request_definitions! \\{/,/\\/\\/\\/ DEPRECATED APIs below/' | rg -N -o '=>\\s*\"[^\"]+\"\\s*\\{' | sed -E 's/.*\"([^\"]+)\".*/\\1/' | sort -u`
3. List Codex server request methods:
   - `git -C ../../codex-upstream show HEAD:codex-rs/app-server-protocol/src/protocol/common.rs | awk '/server_request_definitions! \\{/,/\\/\\/\\/ DEPRECATED APIs below/' | rg -N -o '=>\\s*\"[^\"]+\"\\s*\\{' | sed -E 's/.*\"([^\"]+)\".*/\\1/' | sort -u`
4. List BlackRain outgoing requests from `electron/main/app-server/app-server-runtime.ts`, `electron/main/ipc/register-ipc.ts` and `electron/shared/agent.ts`.
5. Update the Supported Requests, Missing Client Requests, and Server Requests sections.

## Schema Drift Workflow (Best)

Use this when the method list is unchanged but behavior looks off.

1. Confirm the current Codex hash:
   - `git -C ../../codex-upstream fetch --all --prune && git -C ../../codex-upstream rev-parse HEAD`
2. Inspect the authoritative notification structs:
   - `git -C ../../codex-upstream show HEAD:codex-rs/app-server-protocol/src/protocol/v2.rs | rg -n \"struct .*Notification\"`
3. For a specific method, jump to its struct definition:
   - Example: `git -C ../../codex-upstream show HEAD:codex-rs/app-server-protocol/src/protocol/v2.rs | rg -n \"struct TurnPlanUpdatedNotification|struct ThreadTokenUsageUpdatedNotification|struct AccountRateLimitsUpdatedNotification|struct ItemStartedNotification|struct ItemCompletedNotification\"`
4. Compare payload shapes to the router expectations:
   - Parser/source of truth: `src/utils/appServerEvents.ts`
   - Router: `src/features/app/hooks/useAppServerEvents.ts`
   - Turn/plan/token/rate-limit normalization: `src/features/threads/utils/threadNormalize.ts`
   - Item shaping for display: `src/utils/threadItems.ts`
5. Verify the ThreadItem schema (many UI issues start here):
   - `git -C ../../codex-upstream show HEAD:codex-rs/app-server-protocol/src/protocol/v2.rs | rg -n \"enum ThreadItem|CommandExecution|FileChange|McpToolCall|EnteredReviewMode|ExitedReviewMode|ContextCompaction\"`
6. Check for camelCase vs snake_case mismatches:
   - The protocol uses `#[serde(rename_all = \"camelCase\")]`, but fields are often declared in snake_case.
   - BlackRain generally defends against this by checking both forms (for example in `threadNormalize.ts` and `useAppServerEvents.ts`), while centralizing method/type parsing in `appServerEvents.ts`.
7. If a schema change is found, fix it at the edges first:
   - Prefer updating `src/utils/appServerEvents.ts`, `useAppServerEvents.ts`, and `threadNormalize.ts` rather than spreading conditionals into components.

## Notes

- Not all missing events must be surfaced in the conversation view; some may
  be better as toasts, settings warnings, or debug-only entries.
- For conversation view changes, prefer:
  - Add method/type support in `src/utils/appServerEvents.ts`
  - Route in `useAppServerEvents.ts`
  - Handle in `useThreadTurnEvents.ts` or `useThreadItemEvents.ts`
  - Update state in `useThreadsReducer.ts`
  - Render in `Messages.tsx`
- `turn/diff/updated` is now fully wired:
  - Routed in `useAppServerEvents.ts`
  - Handled in `useThreadTurnEvents.ts` / `useThreadEventHandlers.ts`
  - Stored in `useThreadsReducer.ts` (`turnDiffByThread`)
  - Exposed by `useThreads.ts` for UI consumers
- Steering behavior while a turn is processing:
  - BlackRain attempts `turn/steer` only when steer capability is enabled, the thread is processing, and an active turn id exists.
  - If `turn/steer` fails, BlackRain does not fall back to `turn/start`; it clears stale processing/turn state when applicable, surfaces an error, and returns `steer_failed`.
  - Local queue fallback on `steer_failed` is handled in the composer queued-send flow (`useQueuedSend`), not by all direct `sendUserMessageToThread` callers.
- Feature toggles in Settings:
  - `experimentalFeature/list` is an app-server request.
  - Toggle writes use local/daemon command surfaces (`set_codex_feature_flag` and app settings update),
    which write `config.toml`; they are not app-server `ClientRequest` methods.
