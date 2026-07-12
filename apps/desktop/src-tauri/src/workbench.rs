use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Manager, State};

use crate::remote_backend;
use crate::shared::hermes_core::runtime::{runtime_api_client, unbind_runtime_workbench};
use crate::shared::hermes_core::types::{WorkError, WorkErrorKind, WorkTask};
use crate::shared::workbench_core::lifecycle::{
    install_and_activate_official_office, OfficialOfficeActivationRequest,
    OfficialOfficeActivationResult, OFFICIAL_OFFICE_WORKBENCH_ID,
};
use crate::shared::workbench_core::manifest::{
    inspect_workbench_package, WorkbenchPackageInspection,
};
use crate::shared::workbench_core::ActivatedWorkbenchContext;
use crate::state::AppState;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkbenchDeactivationResult {
    activation_id: String,
    stopped_task_ids: Vec<String>,
    project_path: String,
    project_preserved: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct OfficialWorkbenchActivationInput {
    workbench_id: String,
    project_path: String,
}

fn workbench_error(kind: WorkErrorKind, code: &str, message: String) -> WorkError {
    WorkError {
        kind,
        code: code.into(),
        message,
        retryable: false,
        http_status: None,
        request_id: None,
        details: Default::default(),
    }
}

async fn require_local(state: &AppState) -> Result<(), WorkError> {
    if remote_backend::is_remote_mode(state).await {
        return Err(WorkError {
            kind: WorkErrorKind::Unsupported,
            code: "unsupported_in_remote_backend".into(),
            message: "Workbench activation is local-only in this release.".into(),
            retryable: false,
            http_status: None,
            request_id: None,
            details: [
                ("surface".into(), json!("work")),
                ("resource".into(), json!("workbenchActivation")),
            ]
            .into_iter()
            .collect(),
        });
    }
    Ok(())
}

fn active_tasks_for_deactivation(
    tasks: &[WorkTask],
    activation_id: &str,
) -> Result<Vec<WorkTask>, WorkError> {
    let mut matching = Vec::new();
    for task in tasks.iter().filter(|task| task.active_run_id.is_some()) {
        if task.activation_id.as_deref() == Some(activation_id) {
            matching.push(task.clone());
        } else {
            return Err(workbench_error(
                WorkErrorKind::InvalidRequest,
                "workbench_deactivation_conflict",
                "Another activation or legacy WORK task still owns an active Hermes run.".into(),
            ));
        }
    }
    Ok(matching)
}

#[tauri::command]
pub(crate) async fn workbench_activation_list(
    state: State<'_, AppState>,
) -> Result<Vec<ActivatedWorkbenchContext>, WorkError> {
    require_local(&state).await?;
    state
        .workbench_activations
        .lock()
        .await
        .list()
        .map_err(|error| {
            workbench_error(
                WorkErrorKind::Persistence,
                "workbench_activation_store_invalid",
                error,
            )
        })
}

#[tauri::command]
pub(crate) async fn workbench_activation_read(
    activation_id: String,
    state: State<'_, AppState>,
) -> Result<ActivatedWorkbenchContext, WorkError> {
    require_local(&state).await?;
    state
        .workbench_activations
        .lock()
        .await
        .read(&activation_id)
        .map_err(|error| {
            workbench_error(
                WorkErrorKind::InvalidRequest,
                "workbench_activation_not_found",
                error,
            )
        })
}

#[tauri::command]
pub(crate) async fn workbench_bundled_inspect(
    workbench_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<WorkbenchPackageInspection, WorkError> {
    require_local(&state).await?;
    if workbench_id != "com.blackrain.office" {
        return Err(workbench_error(
            WorkErrorKind::InvalidRequest,
            "workbench_bundled_not_found",
            "Bundled workbench is not in the official allowlist.".into(),
        ));
    }
    let package_root = crate::office::bundled_workbench_dir(&app).ok_or_else(|| {
        workbench_error(
            WorkErrorKind::Persistence,
            "workbench_bundled_resource_missing",
            "Bundled Office workbench resource was not found.".into(),
        )
    })?;
    inspect_workbench_package(&package_root).map_err(|error| {
        workbench_error(
            WorkErrorKind::InvalidRequest,
            "workbench_manifest_invalid",
            error,
        )
    })
}

#[tauri::command]
pub(crate) async fn workbench_official_activate(
    input: OfficialWorkbenchActivationInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<OfficialOfficeActivationResult, WorkError> {
    require_local(&state).await?;
    if !cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        return Err(workbench_error(
            WorkErrorKind::Unsupported,
            "workbench_activation_windows_required",
            "Official Office workbench activation requires Windows x64 in the MVP release.".into(),
        ));
    }
    if input.workbench_id != OFFICIAL_OFFICE_WORKBENCH_ID {
        return Err(workbench_error(
            WorkErrorKind::InvalidRequest,
            "workbench_bundled_not_found",
            "Bundled workbench is not in the official allowlist.".into(),
        ));
    }
    let package_root = crate::office::bundled_workbench_dir(&app).ok_or_else(|| {
        workbench_error(
            WorkErrorKind::Persistence,
            "workbench_bundled_resource_missing",
            "Bundled Office workbench resource was not found.".into(),
        )
    })?;
    let officecli_source =
        crate::office::bundled_officecli_windows_binary(&app).ok_or_else(|| {
            workbench_error(
                WorkErrorKind::Persistence,
                "workbench_dependency_resource_missing",
                "Bundled OfficeCLI Windows x64 resource was not found.".into(),
            )
        })?;
    let app_data_dir = app.path().app_data_dir().map_err(|error| {
        workbench_error(
            WorkErrorKind::Persistence,
            "workbench_app_data_unavailable",
            format!("Unable to resolve BlackRain App data: {error}"),
        )
    })?;
    let _activation_guard = state.hermes_activation_gate.lock().await;
    let activation_store = state.workbench_activations.lock().await;
    install_and_activate_official_office(
        OfficialOfficeActivationRequest {
            app_data_dir,
            package_root,
            officecli_source,
            project_path: input.project_path.into(),
        },
        &activation_store,
    )
    .await
    .map_err(|error| {
        workbench_error(
            WorkErrorKind::Persistence,
            "workbench_official_activation_failed",
            error,
        )
    })
}

#[tauri::command]
pub(crate) async fn workbench_activation_deactivate(
    activation_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<WorkbenchDeactivationResult, WorkError> {
    require_local(&state).await?;
    let _activation_guard = state.hermes_activation_gate.lock().await;
    let activation = state
        .workbench_activations
        .lock()
        .await
        .read(&activation_id)
        .map_err(|error| {
            workbench_error(
                WorkErrorKind::InvalidRequest,
                "workbench_activation_not_found",
                error,
            )
        })?;
    let tasks = state.hermes_tasks.lock().await.load_tasks()?;
    let activation_task_ids = tasks
        .iter()
        .filter(|task| task.activation_id.as_deref() == Some(&activation_id))
        .map(|task| task.task_id.clone())
        .collect::<Vec<_>>();
    let active_tasks = active_tasks_for_deactivation(&tasks, &activation_id)?;

    if let Ok(client) = runtime_api_client(&state.hermes_runtime).await {
        for task in &active_tasks {
            if let Some(run_id) = task.active_run_id.as_deref() {
                let _ = client.stop_run(run_id).await;
            }
        }
    }
    state.hermes_runtime.stop().await?;
    state.hermes_runs.cancel_all().await;

    let mut stopped_task_ids = Vec::with_capacity(active_tasks.len());
    for task in active_tasks {
        let run_id = task
            .active_run_id
            .as_deref()
            .expect("deactivation active task has a run id");
        state
            .hermes_tasks
            .lock()
            .await
            .cancel_run_for_deactivation(&task.task_id, &activation_id, run_id)?;
        stopped_task_ids.push(task.task_id);
    }
    stopped_task_ids.sort();
    for task_id in activation_task_ids {
        let follow_ups = state
            .hermes_tasks
            .lock()
            .await
            .fail_follow_ups_for_deactivation(&task_id)?;
        crate::hermes::emit_follow_ups(&app, &task_id, follow_ups);
    }

    unbind_runtime_workbench(&state.hermes_paths)?;
    let removed = state
        .workbench_activations
        .lock()
        .await
        .deactivate_verified(&activation_id)
        .map_err(|error| {
            workbench_error(
                WorkErrorKind::Persistence,
                "workbench_deactivation_persist_failed",
                error,
            )
        })?;
    debug_assert_eq!(removed.project.path, activation.project.path);
    Ok(WorkbenchDeactivationResult {
        activation_id,
        stopped_task_ids,
        project_path: activation.project.path,
        project_preserved: true,
    })
}

#[cfg(test)]
mod tests {
    use super::active_tasks_for_deactivation;
    use crate::shared::hermes_core::types::{WorkTask, WorkTaskStatus, WORK_SCHEMA_VERSION};

    fn task(task_id: &str, activation_id: Option<&str>, active: bool) -> WorkTask {
        WorkTask {
            schema_version: WORK_SCHEMA_VERSION,
            task_id: task_id.into(),
            activation_id: activation_id.map(str::to_string),
            workbench_id: "com.blackrain.office".into(),
            workbench_version: "0.1.0".into(),
            project_path: r"C:\Users\demo\Office Project".into(),
            hermes_session_id: Some(format!("session-{task_id}")),
            active_run_id: active.then(|| format!("run-{task_id}")),
            status: if active {
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
    fn deactivation_scope_accepts_only_matching_active_runs() {
        let tasks = vec![
            task("active", Some("activation-office"), true),
            task("done", Some("activation-other"), false),
        ];
        let matching = active_tasks_for_deactivation(&tasks, "activation-office").unwrap();
        assert_eq!(matching.len(), 1);
        assert_eq!(matching[0].task_id, "active");

        let conflict = vec![task("legacy", None, true)];
        assert_eq!(
            active_tasks_for_deactivation(&conflict, "activation-office")
                .unwrap_err()
                .code,
            "workbench_deactivation_conflict"
        );
    }
}
