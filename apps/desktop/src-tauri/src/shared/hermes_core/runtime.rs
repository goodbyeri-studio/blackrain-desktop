use std::collections::BTreeMap;
use std::fs;
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use super::client::HermesApiClient;
use super::client::HermesHttpTrace;
use super::config::{
    render_config_with_workbench, summary, HermesConfigInspection, HermesConfigManager,
    HermesConfigSummary, HermesLaunchEnvironment, HermesMcpServerDesiredState, HermesPaths,
    HermesProviderDesiredState, HermesWorkbenchBindResult, HermesWorkbenchBindRollback,
    WorkbenchHermesDesiredState,
};
use super::credential_store::{ensure_api_server_key, provider_secret_get};
use super::process::HermesProcessSupervisor;
use super::types::{WorkError, WorkErrorKind, WorkRuntimeStatus};

pub(crate) const MANAGED_HERMES_PORT: u16 = 8642;
const DEFAULT_PROFILE_ID: &str = "default";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesRuntimeDiagnostics {
    pub(crate) status: WorkRuntimeStatus,
    pub(crate) config_state: String,
    pub(crate) config_summary: Option<HermesConfigSummary>,
    pub(crate) recent_logs: Vec<String>,
    pub(crate) recent_requests: Vec<HermesHttpTrace>,
}

pub(crate) fn configure_runtime_desired_state(
    paths: &HermesPaths,
    desired: &HermesProviderDesiredState,
) -> Result<HermesConfigSummary, WorkError> {
    HermesConfigManager {
        paths: paths.clone(),
    }
    .apply(desired)
    .map_err(config_error)
}

pub(crate) fn bind_runtime_workbench(
    paths: &HermesPaths,
    workbench: &WorkbenchHermesDesiredState,
    mcp_servers: &[HermesMcpServerDesiredState],
    allow_mcp_change: bool,
) -> Result<HermesWorkbenchBindResult, WorkError> {
    let manager = HermesConfigManager {
        paths: paths.clone(),
    };
    let provider = manager.load_desired_state().map_err(config_error)?;
    manager
        .bind_workbench(&provider, workbench, mcp_servers, allow_mcp_change)
        .map_err(config_error)
}

pub(crate) fn rollback_runtime_workbench(
    paths: &HermesPaths,
    rollback: &HermesWorkbenchBindRollback,
) -> Result<(), WorkError> {
    HermesConfigManager {
        paths: paths.clone(),
    }
    .rollback_workbench_binding(rollback)
    .map_err(config_error)
}

pub(crate) fn unbind_runtime_workbench(
    paths: &HermesPaths,
) -> Result<HermesWorkbenchBindResult, WorkError> {
    let manager = HermesConfigManager {
        paths: paths.clone(),
    };
    let provider = manager.load_desired_state().map_err(config_error)?;
    manager
        .unbind_workbench(&provider, true)
        .map_err(config_error)
}

pub(crate) async fn start_runtime(
    paths: &HermesPaths,
    supervisor: &Arc<HermesProcessSupervisor>,
) -> Result<WorkRuntimeStatus, WorkError> {
    let manager = HermesConfigManager {
        paths: paths.clone(),
    };
    let desired = load_runtime_desired_state(paths, &manager)?;
    ensure_config_matches_desired(&manager, &desired)?;
    let bearer = ensure_api_server_key(DEFAULT_PROFILE_ID, false).map_err(credential_error)?;
    let provider_secret = provider_secret_get(&desired.provider_id)
        .map_err(credential_error)?
        .ok_or_else(|| {
            runtime_error(
                "hermes_provider_secret_required",
                "The configured Hermes provider secret is missing from the system credential store.",
                false,
            )
        })?;
    let environment =
        HermesLaunchEnvironment::build(paths, MANAGED_HERMES_PORT, &bearer, &provider_secret)
            .map_err(config_error)?;
    supervisor.start(environment).await
}

pub(crate) async fn restart_runtime(
    paths: &HermesPaths,
    supervisor: &Arc<HermesProcessSupervisor>,
) -> Result<WorkRuntimeStatus, WorkError> {
    supervisor.stop().await?;
    start_runtime(paths, supervisor).await
}

pub(crate) async fn repair_runtime(
    paths: &HermesPaths,
    supervisor: &Arc<HermesProcessSupervisor>,
) -> Result<WorkRuntimeStatus, WorkError> {
    supervisor.stop().await?;
    let manager = HermesConfigManager {
        paths: paths.clone(),
    };
    let desired = load_runtime_desired_state(paths, &manager)?;
    manager.repair(&desired).map_err(config_error)?;
    Ok(supervisor.status().await)
}

pub(crate) async fn runtime_diagnostics(
    paths: &HermesPaths,
    supervisor: &Arc<HermesProcessSupervisor>,
) -> HermesRuntimeDiagnostics {
    let manager = HermesConfigManager {
        paths: paths.clone(),
    };
    let (config_state, config_summary) = match manager.inspect() {
        Ok(HermesConfigInspection::Missing) => ("missing".into(), None),
        Ok(HermesConfigInspection::Valid) => match (
            manager.load_desired_state(),
            manager.load_workbench_desired_state(),
        ) {
            (Ok(desired), Ok(_)) => ("valid".into(), Some(summary(&desired))),
            _ => ("desiredStateInvalid".into(), None),
        },
        Ok(HermesConfigInspection::RepairRequired(_)) => ("repairRequired".into(), None),
        Err(_) => ("inspectionFailed".into(), None),
    };
    HermesRuntimeDiagnostics {
        status: supervisor.status().await,
        config_state,
        config_summary,
        recent_logs: supervisor.recent_logs(),
        recent_requests: supervisor.recent_http_traces(),
    }
}

pub(crate) async fn runtime_api_client(
    supervisor: &Arc<HermesProcessSupervisor>,
) -> Result<HermesApiClient, WorkError> {
    let bearer = ensure_api_server_key(DEFAULT_PROFILE_ID, false).map_err(credential_error)?;
    supervisor.api_client(&bearer).await
}

fn ensure_config_matches_desired(
    manager: &HermesConfigManager,
    desired: &HermesProviderDesiredState,
) -> Result<(), WorkError> {
    match manager.inspect().map_err(config_error)? {
        HermesConfigInspection::Missing => {
            manager.apply(desired).map_err(config_error)?;
            Ok(())
        }
        HermesConfigInspection::RepairRequired(plan) => {
            let mut error = runtime_error(
                "hermes_config_repair_required",
                "Hermes config requires repair before the runtime can start.",
                false,
            );
            error.details.insert(
                "repairPlan".into(),
                serde_json::to_value(plan).unwrap_or_default(),
            );
            Err(error)
        }
        HermesConfigInspection::Valid => {
            let current = fs::read_to_string(&manager.paths.config)
                .map_err(|error| config_error(format!("Unable to read Hermes config: {error}")))?;
            let workbench = manager
                .load_workbench_desired_state()
                .map_err(config_error)?;
            let expected =
                render_config_with_workbench(desired, workbench.as_ref()).map_err(config_error)?;
            if current == expected {
                Ok(())
            } else {
                Err(runtime_error(
                    "hermes_config_desired_state_mismatch",
                    "Hermes config differs from the App-owned desired state and must be repaired.",
                    false,
                ))
            }
        }
    }
}

fn load_runtime_desired_state(
    paths: &HermesPaths,
    manager: &HermesConfigManager,
) -> Result<HermesProviderDesiredState, WorkError> {
    manager.load_desired_state().map_err(|error| {
        let code = if paths.desired_state.exists() {
            "hermes_desired_state_invalid"
        } else {
            "hermes_configuration_required"
        };
        runtime_error(code, &error, false)
    })
}

fn credential_error(message: String) -> WorkError {
    runtime_error("hermes_credential_error", &message, false)
}

fn config_error(message: String) -> WorkError {
    WorkError {
        kind: WorkErrorKind::Persistence,
        code: "hermes_config_error".into(),
        message,
        retryable: false,
        http_status: None,
        request_id: None,
        details: BTreeMap::new(),
    }
}

fn runtime_error(code: &str, message: &str, retryable: bool) -> WorkError {
    WorkError {
        kind: WorkErrorKind::Runtime,
        code: code.into(),
        message: message.into(),
        retryable,
        http_status: None,
        request_id: None,
        details: BTreeMap::new(),
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use super::{
        configure_runtime_desired_state, ensure_config_matches_desired, load_runtime_desired_state,
    };
    use crate::shared::hermes_core::config::{
        HermesConfigManager, HermesPaths, HermesProviderDesiredState,
    };

    fn desired(model: &str) -> HermesProviderDesiredState {
        HermesProviderDesiredState::blackrain_new_api(
            "https://new-api.example.com/v1".into(),
            model.into(),
            Some(131_072),
        )
    }

    fn temp_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "blackrain-hermes-runtime-test-{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn configured_desired_state_is_non_secret_and_startable() {
        let root = temp_root();
        let paths = HermesPaths::from_app_data_dir(&root);
        let summary = configure_runtime_desired_state(&paths, &desired("deepseek-chat")).unwrap();
        assert!(!summary.contains_inline_secret);
        let persisted = fs::read_to_string(&paths.desired_state).unwrap();
        assert!(!persisted.contains("api_key"));
        let manager = HermesConfigManager {
            paths: paths.clone(),
        };
        ensure_config_matches_desired(&manager, &manager.load_desired_state().unwrap()).unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn config_drift_fails_closed_until_repair() {
        let root = temp_root();
        let paths = HermesPaths::from_app_data_dir(&root);
        configure_runtime_desired_state(&paths, &desired("deepseek-chat")).unwrap();
        fs::write(
            &paths.config,
            fs::read_to_string(&paths.config)
                .unwrap()
                .replace("deepseek-chat", "drifted-model"),
        )
        .unwrap();
        let manager = HermesConfigManager {
            paths: paths.clone(),
        };
        let error = ensure_config_matches_desired(&manager, &manager.load_desired_state().unwrap())
            .unwrap_err();
        assert_eq!(error.code, "hermes_config_desired_state_mismatch");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn missing_desired_state_requires_configuration_for_start_and_repair() {
        let root = temp_root();
        let paths = HermesPaths::from_app_data_dir(&root);
        let manager = HermesConfigManager {
            paths: paths.clone(),
        };
        let error = load_runtime_desired_state(&paths, &manager).unwrap_err();
        assert_eq!(error.code, "hermes_configuration_required");
        assert!(!error.retryable);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn invalid_desired_state_fails_closed_without_echoing_contents() {
        let root = temp_root();
        let paths = HermesPaths::from_app_data_dir(&root);
        fs::create_dir_all(&paths.home).unwrap();
        fs::write(&paths.desired_state, br#"{"api_key":"do-not-echo"}"#).unwrap();
        let manager = HermesConfigManager {
            paths: paths.clone(),
        };
        let error = load_runtime_desired_state(&paths, &manager).unwrap_err();
        assert_eq!(error.code, "hermes_desired_state_invalid");
        assert!(!error.message.contains("do-not-echo"));
        fs::remove_dir_all(root).unwrap();
    }
}
