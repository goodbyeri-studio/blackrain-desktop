use std::sync::Arc;

use serde_json::json;
use tauri::State;

use crate::remote_backend;
use crate::shared::hermes_core::recovery::audit_remote_recovery;
use crate::shared::hermes_core::runtime::{
    repair_runtime, restart_runtime, runtime_api_client, runtime_diagnostics, start_runtime,
    HermesRuntimeDiagnostics,
};
use crate::shared::hermes_core::tasks::HermesTaskRecoveryState;
use crate::shared::hermes_core::types::{WorkError, WorkErrorKind, WorkRuntimeStatus};
use crate::state::AppState;

fn unsupported_remote_error() -> WorkError {
    WorkError {
        kind: WorkErrorKind::Unsupported,
        code: "unsupported_in_remote_backend".into(),
        message: "Hermes WORK runtime management is local-only in this release.".into(),
        retryable: false,
        http_status: None,
        request_id: None,
        details: [
            ("surface".into(), json!("work")),
            ("backend".into(), json!("remote")),
        ]
        .into_iter()
        .collect(),
    }
}

async fn require_local(state: &AppState) -> Result<(), WorkError> {
    if remote_backend::is_remote_mode(state).await {
        Err(unsupported_remote_error())
    } else {
        Ok(())
    }
}

fn schedule_task_recovery(state: &AppState) {
    let runtime = Arc::clone(&state.hermes_runtime);
    let tasks = Arc::clone(&state.hermes_tasks);
    let recovery = Arc::clone(&state.hermes_task_recovery);
    tauri::async_runtime::spawn(async move {
        let result = match runtime_api_client(&runtime).await {
            Ok(client) => audit_remote_recovery(&tasks, &client).await,
            Err(error) => Err(error),
        };
        *recovery.lock().await = HermesTaskRecoveryState::from_result(result);
    });
}

#[tauri::command]
pub(crate) async fn hermes_runtime_status(
    state: State<'_, AppState>,
) -> Result<WorkRuntimeStatus, WorkError> {
    require_local(&state).await?;
    Ok(state.hermes_runtime.status().await)
}

#[tauri::command]
pub(crate) async fn hermes_runtime_start(
    state: State<'_, AppState>,
) -> Result<WorkRuntimeStatus, WorkError> {
    require_local(&state).await?;
    let status = start_runtime(&state.hermes_paths, &state.hermes_runtime).await?;
    schedule_task_recovery(&state);
    Ok(status)
}

#[tauri::command]
pub(crate) async fn hermes_runtime_stop(
    state: State<'_, AppState>,
) -> Result<WorkRuntimeStatus, WorkError> {
    require_local(&state).await?;
    state.hermes_runtime.stop().await
}

#[tauri::command]
pub(crate) async fn hermes_runtime_restart(
    state: State<'_, AppState>,
) -> Result<WorkRuntimeStatus, WorkError> {
    require_local(&state).await?;
    let status = restart_runtime(&state.hermes_paths, &state.hermes_runtime).await?;
    schedule_task_recovery(&state);
    Ok(status)
}

#[tauri::command]
pub(crate) async fn hermes_runtime_repair(
    state: State<'_, AppState>,
) -> Result<WorkRuntimeStatus, WorkError> {
    require_local(&state).await?;
    repair_runtime(&state.hermes_paths, &state.hermes_runtime).await
}

#[tauri::command]
pub(crate) async fn hermes_runtime_diagnostics(
    state: State<'_, AppState>,
) -> Result<HermesRuntimeDiagnostics, WorkError> {
    require_local(&state).await?;
    Ok(runtime_diagnostics(&state.hermes_paths, &state.hermes_runtime).await)
}

#[cfg(test)]
mod tests {
    use super::unsupported_remote_error;
    use crate::shared::hermes_core::types::WorkErrorKind;

    #[test]
    fn remote_runtime_commands_return_stable_structured_error() {
        let error = unsupported_remote_error();
        assert_eq!(error.kind, WorkErrorKind::Unsupported);
        assert_eq!(error.code, "unsupported_in_remote_backend");
        assert_eq!(error.details["surface"], "work");
        assert_eq!(error.details["backend"], "remote");

        let serialized = serde_json::to_value(error).unwrap();
        assert_eq!(serialized["kind"], "unsupported");
        assert_eq!(serialized["code"], "unsupported_in_remote_backend");
    }
}
