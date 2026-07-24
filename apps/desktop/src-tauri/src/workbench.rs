use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::remote_backend;
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
    project_path: String,
    project_preserved: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct OfficialWorkbenchActivationInput {
    workbench_id: String,
    project_path: String,
}

async fn require_local(state: &AppState) -> Result<(), String> {
    if remote_backend::is_remote_mode(state).await {
        return Err("Workbench package management is available only on the local client.".into());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn workbench_activation_list(
    state: State<'_, AppState>,
) -> Result<Vec<ActivatedWorkbenchContext>, String> {
    require_local(&state).await?;
    state.workbench_activations.lock().await.list()
}

#[tauri::command]
pub(crate) async fn workbench_activation_read(
    activation_id: String,
    state: State<'_, AppState>,
) -> Result<ActivatedWorkbenchContext, String> {
    require_local(&state).await?;
    state
        .workbench_activations
        .lock()
        .await
        .read(&activation_id)
}

#[tauri::command]
pub(crate) async fn workbench_bundled_inspect(
    workbench_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<WorkbenchPackageInspection, String> {
    require_local(&state).await?;
    if workbench_id != OFFICIAL_OFFICE_WORKBENCH_ID {
        return Err("Bundled workbench is not in the official allowlist.".into());
    }
    let package_root = crate::office::bundled_workbench_dir(&app)
        .ok_or_else(|| "Bundled Office workbench resource was not found.".to_string())?;
    inspect_workbench_package(&package_root)
}

#[tauri::command]
pub(crate) async fn workbench_official_activate(
    input: OfficialWorkbenchActivationInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<OfficialOfficeActivationResult, String> {
    require_local(&state).await?;
    if !cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        return Err("Official Office workbench activation requires Windows x64.".into());
    }
    if input.workbench_id != OFFICIAL_OFFICE_WORKBENCH_ID {
        return Err("Bundled workbench is not in the official allowlist.".into());
    }
    let package_root = crate::office::bundled_workbench_dir(&app)
        .ok_or_else(|| "Bundled Office workbench resource was not found.".to_string())?;
    let officecli_source = crate::office::bundled_officecli_windows_binary(&app)
        .ok_or_else(|| "Bundled OfficeCLI Windows x64 resource was not found.".to_string())?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve BlackRain App data: {error}"))?;
    let _activation_guard = state.workbench_activation_gate.lock().await;
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
}

#[tauri::command]
pub(crate) async fn workbench_activation_deactivate(
    activation_id: String,
    state: State<'_, AppState>,
) -> Result<WorkbenchDeactivationResult, String> {
    require_local(&state).await?;
    let _activation_guard = state.workbench_activation_gate.lock().await;
    let removed = state
        .workbench_activations
        .lock()
        .await
        .deactivate_verified(&activation_id)?;
    Ok(WorkbenchDeactivationResult {
        activation_id,
        project_path: removed.project.path,
        project_preserved: true,
    })
}

#[cfg(test)]
mod tests {
    use super::OfficialWorkbenchActivationInput;

    #[test]
    fn activation_input_rejects_unknown_fields() {
        assert!(
            serde_json::from_value::<OfficialWorkbenchActivationInput>(serde_json::json!({
                "workbenchId": "com.blackrain.office",
                "projectPath": "C:\\Users\\demo\\Office Project",
                "extra": true
            }))
            .is_err()
        );
    }
}
