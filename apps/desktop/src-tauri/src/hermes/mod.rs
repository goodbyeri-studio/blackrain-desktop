use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

use crate::remote_backend;
use crate::shared::hermes_core::client::HermesRunCreateRequest;
use crate::shared::hermes_core::protocol::HermesApprovalRequest;
use crate::shared::hermes_core::recovery::audit_remote_recovery;
use crate::shared::hermes_core::runner::{consume_run_events, is_terminal_status, start_task_run};
use crate::shared::hermes_core::runtime::{
    repair_runtime, restart_runtime, runtime_api_client, runtime_diagnostics, start_runtime,
    HermesRuntimeDiagnostics,
};
use crate::shared::hermes_core::tasks::HermesTaskRecoveryState;
use crate::shared::hermes_core::types::{
    WorkError, WorkErrorKind, WorkEvent, WorkRuntimeStatus, WorkTask, WorkTaskStatus,
    WORK_SCHEMA_VERSION,
};
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct HermesTaskStartInput {
    activation_id: String,
    prompt: String,
    instructions: Option<String>,
    model: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct HermesTaskContinueInput {
    task_id: String,
    prompt: String,
    instructions: Option<String>,
    model: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesTaskReadResult {
    task: WorkTask,
    events: Vec<WorkEvent>,
}

fn validate_bounded_text(label: &str, value: &str, max_chars: usize) -> Result<(), WorkError> {
    let count = value.chars().count();
    if value.trim().is_empty() || count > max_chars || value.chars().any(|value| value == '\0') {
        return Err(command_error(
            "invalid_work_input",
            &format!("WORK {label} must be non-empty and at most {max_chars} characters."),
            false,
        ));
    }
    Ok(())
}

fn command_error(code: &str, message: &str, retryable: bool) -> WorkError {
    WorkError {
        kind: WorkErrorKind::InvalidRequest,
        code: code.into(),
        message: message.into(),
        retryable,
        http_status: None,
        request_id: None,
        details: Default::default(),
    }
}

fn now_unix_seconds() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
}

fn spawn_run_consumer(
    app: AppHandle,
    state: &AppState,
    client: crate::shared::hermes_core::client::HermesApiClient,
    task_id: String,
    run_id: String,
    cancellation: crate::shared::hermes_core::client::HermesStreamCancellation,
) {
    let tasks = Arc::clone(&state.hermes_tasks);
    let runs = Arc::clone(&state.hermes_runs);
    tauri::async_runtime::spawn(async move {
        let emitted_app = app.clone();
        let result = consume_run_events(
            &tasks,
            &client,
            &task_id,
            &run_id,
            &cancellation,
            move |event| {
                let _ = emitted_app.emit("work-event", event);
            },
        )
        .await;
        if let Err(error) = result {
            let _ = tasks
                .lock()
                .await
                .reconcile_remote_error(&task_id, &run_id, &error);
        }
        runs.release(&task_id, Some(&run_id)).await;
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
    state.hermes_runs.cancel_all().await;
    state.hermes_runtime.stop().await
}

#[tauri::command]
pub(crate) async fn hermes_runtime_restart(
    state: State<'_, AppState>,
) -> Result<WorkRuntimeStatus, WorkError> {
    require_local(&state).await?;
    state.hermes_runs.cancel_all().await;
    let status = restart_runtime(&state.hermes_paths, &state.hermes_runtime).await?;
    schedule_task_recovery(&state);
    Ok(status)
}

#[tauri::command]
pub(crate) async fn hermes_runtime_repair(
    state: State<'_, AppState>,
) -> Result<WorkRuntimeStatus, WorkError> {
    require_local(&state).await?;
    state.hermes_runs.cancel_all().await;
    repair_runtime(&state.hermes_paths, &state.hermes_runtime).await
}

#[tauri::command]
pub(crate) async fn hermes_runtime_diagnostics(
    state: State<'_, AppState>,
) -> Result<HermesRuntimeDiagnostics, WorkError> {
    require_local(&state).await?;
    Ok(runtime_diagnostics(&state.hermes_paths, &state.hermes_runtime).await)
}

#[tauri::command]
pub(crate) async fn hermes_task_list(
    state: State<'_, AppState>,
) -> Result<Vec<WorkTask>, WorkError> {
    require_local(&state).await?;
    state.hermes_tasks.lock().await.load_tasks()
}

#[tauri::command]
pub(crate) async fn hermes_task_read(
    task_id: String,
    state: State<'_, AppState>,
) -> Result<HermesTaskReadResult, WorkError> {
    require_local(&state).await?;
    let store = state.hermes_tasks.lock().await;
    Ok(HermesTaskReadResult {
        task: store.load_task(&task_id)?,
        events: store.load_events(&task_id)?,
    })
}

#[tauri::command]
pub(crate) async fn hermes_task_start(
    input: HermesTaskStartInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<WorkTask, WorkError> {
    require_local(&state).await?;
    validate_bounded_text("prompt", &input.prompt, 1_048_576)?;
    if let Some(instructions) = &input.instructions {
        validate_bounded_text("instructions", instructions, 65_536)?;
    }
    if let Some(model) = &input.model {
        validate_bounded_text("model", model, 256)?;
    }
    let activation = state
        .workbench_activations
        .lock()
        .await
        .read(&input.activation_id)
        .map_err(|message| command_error("workbench_activation_required", &message, false))?;
    activation
        .to_hermes_desired_state()
        .map_err(|message| command_error("workbench_activation_invalid", &message, false))?;
    let now = now_unix_seconds();
    let task_id = format!("task-{}", uuid::Uuid::new_v4().simple());
    let task = WorkTask {
        schema_version: WORK_SCHEMA_VERSION,
        task_id: task_id.clone(),
        activation_id: Some(activation.activation_id),
        workbench_id: activation.workbench_id,
        workbench_version: activation.workbench_version,
        project_path: activation.project.path,
        hermes_session_id: None,
        active_run_id: None,
        status: WorkTaskStatus::Draft,
        last_event_sequence: 0,
        created_at: now,
        updated_at: now,
        recovery: Default::default(),
    };
    state.hermes_tasks.lock().await.upsert_task(&task)?;
    let client = runtime_api_client(&state.hermes_runtime).await?;
    let started = start_task_run(
        &state.hermes_tasks,
        &state.hermes_runs,
        &client,
        &task_id,
        &HermesRunCreateRequest {
            input: Value::String(input.prompt),
            instructions: input.instructions,
            session_id: None,
            model: input.model,
            conversation_history: Vec::new(),
        },
    )
    .await?;
    spawn_run_consumer(
        app,
        &state,
        client,
        task_id,
        started.run_id,
        started.cancellation,
    );
    Ok(started.task)
}

#[tauri::command]
pub(crate) async fn hermes_task_resume(
    task_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<WorkTask, WorkError> {
    require_local(&state).await?;
    let client = runtime_api_client(&state.hermes_runtime).await?;
    let task = state.hermes_tasks.lock().await.load_task(&task_id)?;
    let run_id = task.active_run_id.clone().ok_or_else(|| {
        command_error(
            "work_task_has_no_active_run",
            "WORK task has no active Hermes run to resume.",
            false,
        )
    })?;
    let upstream = client.run_status(&run_id).await;
    let task = match upstream {
        Ok(status) => {
            state
                .hermes_tasks
                .lock()
                .await
                .reconcile_remote_status(&task_id, &run_id, &status)?;
            state.hermes_tasks.lock().await.load_task(&task_id)?
        }
        Err(error) => {
            state
                .hermes_tasks
                .lock()
                .await
                .reconcile_remote_error(&task_id, &run_id, &error)?;
            return Err(error);
        }
    };
    if is_terminal_status(&task.status) {
        return Ok(task);
    }
    let cancellation = state.hermes_runs.activate(&task_id, &run_id).await?;
    spawn_run_consumer(app, &state, client, task_id, run_id, cancellation);
    Ok(task)
}

#[tauri::command]
pub(crate) async fn hermes_task_continue(
    input: HermesTaskContinueInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<WorkTask, WorkError> {
    require_local(&state).await?;
    validate_bounded_text("prompt", &input.prompt, 1_048_576)?;
    if let Some(instructions) = &input.instructions {
        validate_bounded_text("instructions", instructions, 65_536)?;
    }
    if let Some(model) = &input.model {
        validate_bounded_text("model", model, 256)?;
    }
    let task = state.hermes_tasks.lock().await.load_task(&input.task_id)?;
    if task.active_run_id.is_some() || !is_terminal_status(&task.status) {
        return Err(command_error(
            "work_task_not_ready_for_continue",
            "WORK task must be terminal with no active run before continuing.",
            false,
        ));
    }
    let session_id = task.hermes_session_id.ok_or_else(|| {
        command_error(
            "work_task_session_missing",
            "WORK task has no Hermes session available for continuation.",
            false,
        )
    })?;
    let client = runtime_api_client(&state.hermes_runtime).await?;
    let started = start_task_run(
        &state.hermes_tasks,
        &state.hermes_runs,
        &client,
        &input.task_id,
        &HermesRunCreateRequest {
            input: Value::String(input.prompt),
            instructions: input.instructions,
            session_id: Some(session_id),
            model: input.model,
            conversation_history: Vec::new(),
        },
    )
    .await?;
    spawn_run_consumer(
        app,
        &state,
        client,
        input.task_id,
        started.run_id,
        started.cancellation,
    );
    Ok(started.task)
}

#[tauri::command]
pub(crate) async fn hermes_task_approval(
    task_id: String,
    choice: String,
    resolve_all: Option<bool>,
    state: State<'_, AppState>,
) -> Result<WorkTask, WorkError> {
    require_local(&state).await?;
    let task = state.hermes_tasks.lock().await.load_task(&task_id)?;
    if task.status != WorkTaskStatus::WaitingForApproval {
        return Err(command_error(
            "work_task_not_waiting_for_approval",
            "WORK task is not waiting for an approval response.",
            false,
        ));
    }
    let run_id = task.active_run_id.ok_or_else(|| {
        command_error(
            "work_task_has_no_active_run",
            "WORK task has no active Hermes run for approval.",
            false,
        )
    })?;
    let client = runtime_api_client(&state.hermes_runtime).await?;
    client
        .resolve_approval(
            &run_id,
            &HermesApprovalRequest {
                choice,
                resolve_all: resolve_all.unwrap_or(false),
            },
        )
        .await?;
    state
        .hermes_tasks
        .lock()
        .await
        .set_run_status(&task_id, &run_id, WorkTaskStatus::Running)
}

#[tauri::command]
pub(crate) async fn hermes_task_stop(
    task_id: String,
    state: State<'_, AppState>,
) -> Result<WorkTask, WorkError> {
    require_local(&state).await?;
    let task = state.hermes_tasks.lock().await.load_task(&task_id)?;
    if task.status == WorkTaskStatus::Stopping {
        return Err(command_error(
            "work_task_stop_in_progress",
            "WORK task stop is already in progress.",
            false,
        ));
    }
    let run_id = task.active_run_id.ok_or_else(|| {
        command_error(
            "work_task_has_no_active_run",
            "WORK task has no active Hermes run to stop.",
            false,
        )
    })?;
    let client = runtime_api_client(&state.hermes_runtime).await?;
    state
        .hermes_tasks
        .lock()
        .await
        .set_run_status(&task_id, &run_id, WorkTaskStatus::Stopping)?;
    if let Err(error) = client.stop_run(&run_id).await {
        state
            .hermes_tasks
            .lock()
            .await
            .reconcile_remote_error(&task_id, &run_id, &error)?;
        return Err(error);
    }
    state.hermes_tasks.lock().await.load_task(&task_id)
}

#[tauri::command]
pub(crate) async fn hermes_task_delete_local_metadata(
    task_id: String,
    state: State<'_, AppState>,
) -> Result<bool, WorkError> {
    require_local(&state).await?;
    let task = state.hermes_tasks.lock().await.load_task(&task_id)?;
    if task.active_run_id.is_some()
        && !is_terminal_status(&task.status)
        && task.status != WorkTaskStatus::Orphaned
    {
        return Err(command_error(
            "work_task_still_active",
            "Stop or finish the Hermes run before deleting local WORK metadata.",
            false,
        ));
    }
    state
        .hermes_tasks
        .lock()
        .await
        .remove_task_metadata(&task_id)
}

#[tauri::command]
pub(crate) async fn hermes_task_recovery_status(
    state: State<'_, AppState>,
) -> Result<HermesTaskRecoveryState, WorkError> {
    require_local(&state).await?;
    Ok(state.hermes_task_recovery.lock().await.clone())
}

#[cfg(test)]
mod tests {
    use super::{unsupported_remote_error, validate_bounded_text, HermesTaskStartInput};
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

    #[test]
    fn task_start_contract_rejects_runtime_override_fields() {
        let value = serde_json::json!({
            "activationId": "activation-office-demo",
            "prompt": "整理季度报告",
            "host": "0.0.0.0",
            "port": 9999,
            "env": {"HERMES_HOME": "C:\\escape"}
        });
        assert!(serde_json::from_value::<HermesTaskStartInput>(value).is_err());
    }

    #[test]
    fn task_start_contract_bounds_user_controlled_text() {
        assert!(validate_bounded_text("prompt", "整理报告", 16).is_ok());
        assert_eq!(
            validate_bounded_text("prompt", "   ", 16).unwrap_err().code,
            "invalid_work_input"
        );
        assert_eq!(
            validate_bounded_text("prompt", "超过长度", 3)
                .unwrap_err()
                .code,
            "invalid_work_input"
        );
    }
}
