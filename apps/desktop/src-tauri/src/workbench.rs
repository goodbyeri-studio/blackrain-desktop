use serde_json::json;
use tauri::State;

use crate::remote_backend;
use crate::shared::hermes_core::types::{WorkError, WorkErrorKind};
use crate::shared::workbench_core::ActivatedWorkbenchContext;
use crate::state::AppState;

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
