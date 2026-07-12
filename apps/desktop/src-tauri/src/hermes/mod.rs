use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

use crate::remote_backend;
use crate::shared::hermes_core::client::HermesRunCreateRequest;
use crate::shared::hermes_core::protocol::HermesApprovalRequest;
use crate::shared::hermes_core::recovery::audit_remote_recovery;
use crate::shared::hermes_core::runner::{
    consume_run_events, is_terminal_status, start_task_run, WorkRunPresentation,
};
use crate::shared::hermes_core::runtime::{
    bind_runtime_workbench, repair_runtime, restart_runtime, rollback_runtime_workbench,
    runtime_api_client, runtime_diagnostics, start_runtime, HermesRuntimeDiagnostics,
};
use crate::shared::hermes_core::tasks::HermesTaskRecoveryState;
use crate::shared::hermes_core::types::{
    WorkError, WorkErrorKind, WorkEvent, WorkRuntimeState, WorkRuntimeStatus, WorkTask,
    WorkTaskStatus, WORK_SCHEMA_VERSION,
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
    #[serde(default)]
    project_file_refs: Vec<String>,
    instructions: Option<String>,
    model: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct HermesTaskContinueInput {
    task_id: String,
    prompt: String,
    #[serde(default)]
    project_file_refs: Vec<String>,
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

fn ensure_no_conflicting_activation(
    tasks: &[WorkTask],
    activation_id: &str,
    exclude_task_id: Option<&str>,
) -> Result<(), WorkError> {
    let conflict = tasks.iter().find(|task| {
        task.active_run_id.is_some()
            && exclude_task_id != Some(task.task_id.as_str())
            && task.activation_id.as_deref() != Some(activation_id)
    });
    if let Some(task) = conflict {
        let mut error = command_error(
            "workbench_activation_conflict",
            "Another workbench activation has an active Hermes run. Stop it before switching the WORK environment.",
            false,
        );
        error
            .details
            .insert("conflictingTaskId".into(), json!(task.task_id));
        return Err(error);
    }
    Ok(())
}

async fn restart_runtime_for_mcp_change(
    state: &AppState,
    binding: &crate::shared::hermes_core::config::HermesWorkbenchBindResult,
) -> Result<(), WorkError> {
    if !binding.mcp_changed || state.hermes_runtime.status().await.state != WorkRuntimeState::Ready
    {
        return Ok(());
    }
    state.hermes_runs.cancel_all().await;
    match restart_runtime(&state.hermes_paths, &state.hermes_runtime).await {
        Ok(_) => {
            schedule_task_recovery(state);
            Ok(())
        }
        Err(restart_error) => {
            let rollback_result =
                rollback_runtime_workbench(&state.hermes_paths, &binding.rollback);
            let recovery_result = if rollback_result.is_ok() {
                restart_runtime(&state.hermes_paths, &state.hermes_runtime).await
            } else {
                Err(restart_error.clone())
            };
            if recovery_result.is_ok() {
                schedule_task_recovery(state);
            }
            let mut error = restart_error;
            error.code = "hermes_mcp_transition_failed".into();
            error.message = if rollback_result.is_ok() && recovery_result.is_ok() {
                "Hermes could not start with the new MCP binding; the previous binding and runtime were restored."
                    .into()
            } else if rollback_result.is_ok() {
                "Hermes could not start with the new MCP binding; the previous binding was restored but the runtime still requires repair."
                    .into()
            } else {
                "Hermes could not start with the new MCP binding and its previous binding could not be restored; runtime repair is required."
                    .into()
            };
            error.retryable = rollback_result.is_ok();
            error.details.insert(
                "bindingRollback".into(),
                Value::String(
                    if rollback_result.is_ok() {
                        "restored"
                    } else {
                        "failed"
                    }
                    .into(),
                ),
            );
            error.details.insert(
                "runtimeRecovery".into(),
                Value::String(
                    if recovery_result.is_ok() {
                        "ready"
                    } else {
                        "repairRequired"
                    }
                    .into(),
                ),
            );
            Err(error)
        }
    }
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
    let _activation_guard = state.hermes_activation_gate.lock().await;
    let activation = state
        .workbench_activations
        .lock()
        .await
        .read(&input.activation_id)
        .map_err(|message| command_error("workbench_activation_required", &message, false))?;
    let workbench_desired = activation
        .to_hermes_desired_state()
        .map_err(|message| command_error("workbench_activation_invalid", &message, false))?;
    let mcp_servers = state
        .plugin_runtimes
        .lock()
        .await
        .resolve_mcp_servers(
            &activation.plugins,
            &activation.mcp_servers,
            &activation.environment_refs,
        )
        .map_err(|message| command_error("workbench_plugin_runtime_invalid", &message, false))?;
    let run_instructions = activation
        .build_run_instructions(&input.project_file_refs, input.instructions.as_deref())
        .map_err(|message| command_error("workbench_project_file_invalid", &message, false))?;
    let tasks = state.hermes_tasks.lock().await.load_tasks()?;
    ensure_no_conflicting_activation(&tasks, &activation.activation_id, None)?;
    let has_active_runs = tasks.iter().any(|task| task.active_run_id.is_some());
    let binding = bind_runtime_workbench(
        &state.hermes_paths,
        &workbench_desired,
        &mcp_servers,
        !has_active_runs,
    )?;
    restart_runtime_for_mcp_change(&state, &binding).await?;
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
            input: Value::String(input.prompt.clone()),
            instructions: Some(run_instructions),
            session_id: None,
            model: input.model,
            conversation_history: Vec::new(),
        },
        WorkRunPresentation {
            user_text: input.prompt,
            project_file_refs: input.project_file_refs,
        },
    )
    .await?;
    for event in &started.initial_events {
        let _ = app.emit("work-event", event.clone());
    }
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
    let _activation_guard = state.hermes_activation_gate.lock().await;
    let task = state.hermes_tasks.lock().await.load_task(&input.task_id)?;
    if task.active_run_id.is_some() || !is_terminal_status(&task.status) {
        return Err(command_error(
            "work_task_not_ready_for_continue",
            "WORK task must be terminal with no active run before continuing.",
            false,
        ));
    }
    let activation_id = task.activation_id.as_deref().ok_or_else(|| {
        command_error(
            "workbench_activation_required",
            "Legacy WORK task has no verified activation identity and cannot create a new run.",
            false,
        )
    })?;
    let activation = state
        .workbench_activations
        .lock()
        .await
        .read(activation_id)
        .map_err(|message| command_error("workbench_activation_required", &message, false))?;
    if activation.workbench_id != task.workbench_id
        || activation.workbench_version != task.workbench_version
        || activation.project.path != task.project_path
    {
        return Err(command_error(
            "workbench_activation_changed",
            "The verified workbench activation no longer matches this WORK task.",
            false,
        ));
    }
    let workbench_desired = activation
        .to_hermes_desired_state()
        .map_err(|message| command_error("workbench_activation_invalid", &message, false))?;
    let mcp_servers = state
        .plugin_runtimes
        .lock()
        .await
        .resolve_mcp_servers(
            &activation.plugins,
            &activation.mcp_servers,
            &activation.environment_refs,
        )
        .map_err(|message| command_error("workbench_plugin_runtime_invalid", &message, false))?;
    let run_instructions = activation
        .build_run_instructions(&input.project_file_refs, input.instructions.as_deref())
        .map_err(|message| command_error("workbench_project_file_invalid", &message, false))?;
    let tasks = state.hermes_tasks.lock().await.load_tasks()?;
    ensure_no_conflicting_activation(&tasks, activation_id, Some(&input.task_id))?;
    let has_active_runs = tasks.iter().any(|task| task.active_run_id.is_some());
    let binding = bind_runtime_workbench(
        &state.hermes_paths,
        &workbench_desired,
        &mcp_servers,
        !has_active_runs,
    )?;
    restart_runtime_for_mcp_change(&state, &binding).await?;
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
            input: Value::String(input.prompt.clone()),
            instructions: Some(run_instructions),
            session_id: Some(session_id),
            model: input.model,
            conversation_history: Vec::new(),
        },
        WorkRunPresentation {
            user_text: input.prompt,
            project_file_refs: input.project_file_refs,
        },
    )
    .await?;
    for event in &started.initial_events {
        let _ = app.emit("work-event", event.clone());
    }
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
    use super::{
        ensure_no_conflicting_activation, unsupported_remote_error, validate_bounded_text,
        HermesTaskStartInput,
    };
    use crate::shared::hermes_core::types::{
        WorkErrorKind, WorkTask, WorkTaskStatus, WORK_SCHEMA_VERSION,
    };

    fn task(task_id: &str, activation_id: Option<&str>, active_run_id: Option<&str>) -> WorkTask {
        WorkTask {
            schema_version: WORK_SCHEMA_VERSION,
            task_id: task_id.into(),
            activation_id: activation_id.map(str::to_string),
            workbench_id: "com.blackrain.office".into(),
            workbench_version: "0.1.0".into(),
            project_path: r"C:\Users\demo\Office Project".into(),
            hermes_session_id: Some(format!("session-{task_id}")),
            active_run_id: active_run_id.map(str::to_string),
            status: if active_run_id.is_some() {
                WorkTaskStatus::Running
            } else {
                WorkTaskStatus::Completed
            },
            last_event_sequence: 0,
            created_at: 1.0,
            updated_at: 1.0,
            recovery: Default::default(),
        }
    }

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
    fn task_start_contract_accepts_only_structured_project_file_references() {
        let value = serde_json::json!({
            "activationId": "activation-office-demo",
            "prompt": "整理季度报告",
            "projectFileRefs": ["C:\\Users\\demo\\Office Project\\quarterly.xlsx"]
        });
        let input = serde_json::from_value::<HermesTaskStartInput>(value).unwrap();
        assert_eq!(input.project_file_refs.len(), 1);

        let raw_attachment = serde_json::json!({
            "activationId": "activation-office-demo",
            "prompt": "整理季度报告",
            "attachments": [{"path": "C:\\escape", "bytes": "secret"}]
        });
        assert!(serde_json::from_value::<HermesTaskStartInput>(raw_attachment).is_err());
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

    #[test]
    fn active_runs_cannot_switch_to_another_or_unknown_activation() {
        let active = task("task-office", Some("activation-office"), Some("run-office"));
        assert!(ensure_no_conflicting_activation(
            std::slice::from_ref(&active),
            "activation-office",
            None,
        )
        .is_ok());
        assert_eq!(
            ensure_no_conflicting_activation(
                std::slice::from_ref(&active),
                "activation-finance",
                None,
            )
            .unwrap_err()
            .code,
            "workbench_activation_conflict"
        );

        let legacy = task("task-legacy", None, Some("run-legacy"));
        assert!(ensure_no_conflicting_activation(&[legacy], "activation-office", None).is_err());
        assert!(ensure_no_conflicting_activation(
            &[active],
            "activation-finance",
            Some("task-office"),
        )
        .is_ok());
    }
}
