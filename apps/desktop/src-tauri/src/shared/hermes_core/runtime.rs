use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use super::client::HermesApiClient;
use super::client::HermesHttpTrace;
use super::config::{
    summary, HermesConfigInspection, HermesConfigManager, HermesConfigSummary,
    HermesEnvironmentReferenceKind, HermesLaunchEnvironment, HermesMcpServerDesiredState,
    HermesPaths, HermesProviderDesiredState, HermesWorkbenchBindResult,
    HermesWorkbenchBindRollback, WorkbenchHermesDesiredState,
};
use super::credential_store::{
    ensure_api_server_key, provider_secret_get, resolve_environment_reference,
};
use super::process::HermesProcessSupervisor;
use super::types::{WorkError, WorkErrorKind, WorkRuntimeStatus};

pub(crate) const MANAGED_HERMES_PORT: u16 = 8642;
const DEFAULT_PROFILE_ID: &str = "default";
pub(crate) const OFFICECLI_SYSTEM_CAPABILITY_ID: &str = "officecli-1.0.117";

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
    let mcp_environment = resolve_mcp_launch_environment(&manager)?;
    let system_tool_paths = resolve_system_tool_paths(paths, &manager)?;
    let environment = HermesLaunchEnvironment::build(
        paths,
        MANAGED_HERMES_PORT,
        &bearer,
        &provider_secret,
        &mcp_environment,
        &system_tool_paths,
    )
    .map_err(config_error)?;
    supervisor.start(environment).await
}

fn resolve_system_tool_paths(
    paths: &HermesPaths,
    manager: &HermesConfigManager,
) -> Result<Vec<PathBuf>, WorkError> {
    let Some(workbench) = manager
        .load_workbench_desired_state()
        .map_err(config_error)?
    else {
        return Ok(Vec::new());
    };
    let app_data = paths.home.parent().ok_or_else(|| {
        runtime_error(
            "hermes_app_data_path_invalid",
            "Unable to resolve App data root for Hermes system capabilities.",
            false,
        )
    })?;
    let mut resolved = Vec::new();
    for reference in workbench
        .environment_refs
        .iter()
        .filter(|reference| reference.kind == HermesEnvironmentReferenceKind::SystemCapability)
    {
        let tool_root = match reference.reference_id.as_str() {
            OFFICECLI_SYSTEM_CAPABILITY_ID => app_data.join("tools").join("officecli"),
            _ => {
                return Err(runtime_error(
                    "hermes_system_capability_unsupported",
                    "WORK activation references an unsupported system capability.",
                    false,
                ));
            }
        };
        validate_system_tool_root(app_data, &tool_root)?;
        resolved.push(tool_root);
    }
    resolved.sort();
    resolved.dedup();
    Ok(resolved)
}

fn validate_system_tool_root(app_data: &Path, root: &Path) -> Result<(), WorkError> {
    let app_data_metadata = fs::symlink_metadata(app_data).map_err(|_| {
        runtime_error(
            "hermes_system_capability_missing",
            "BlackRain App data is unavailable for a verified WORK system capability.",
            false,
        )
    })?;
    if !app_data_metadata.is_dir() || is_link_like(&app_data_metadata) {
        return Err(runtime_error(
            "hermes_system_capability_invalid",
            "BlackRain App data is invalid for a verified WORK system capability.",
            false,
        ));
    }
    let relative = root.strip_prefix(app_data).map_err(|_| {
        runtime_error(
            "hermes_system_capability_invalid",
            "A verified WORK system capability escaped App data.",
            false,
        )
    })?;
    let mut current = app_data.to_path_buf();
    for component in relative.components() {
        current.push(component.as_os_str());
        let metadata = fs::symlink_metadata(&current).map_err(|_| {
            runtime_error(
                "hermes_system_capability_missing",
                "A verified WORK system capability is not installed.",
                false,
            )
        })?;
        if is_link_like(&metadata) {
            return Err(runtime_error(
                "hermes_system_capability_invalid",
                "A verified WORK system capability path contains a symlink.",
                false,
            ));
        }
    }
    if !root.is_dir() {
        return Err(runtime_error(
            "hermes_system_capability_invalid",
            "A verified WORK system capability root is invalid.",
            false,
        ));
    }
    let binary = [root.join("officecli.exe"), root.join("officecli")]
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| {
            runtime_error(
                "hermes_system_capability_missing",
                "A verified WORK system capability executable is missing.",
                false,
            )
        })?;
    let metadata = fs::symlink_metadata(&binary).map_err(|_| {
        runtime_error(
            "hermes_system_capability_missing",
            "A verified WORK system capability executable is missing.",
            false,
        )
    })?;
    if !metadata.is_file() || is_link_like(&metadata) {
        return Err(runtime_error(
            "hermes_system_capability_invalid",
            "A verified WORK system capability executable is invalid.",
            false,
        ));
    }
    Ok(())
}

fn is_link_like(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
        return metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0;
    }
    #[cfg(not(target_os = "windows"))]
    false
}

fn resolve_mcp_launch_environment(
    manager: &HermesConfigManager,
) -> Result<BTreeMap<String, String>, WorkError> {
    resolve_mcp_launch_environment_with(manager, resolve_environment_reference)
}

fn resolve_mcp_launch_environment_with<F>(
    manager: &HermesConfigManager,
    mut resolver: F,
) -> Result<BTreeMap<String, String>, WorkError>
where
    F: FnMut(&super::config::HermesEnvironmentReference) -> Result<Option<String>, String>,
{
    let mut environment = BTreeMap::new();
    for binding in manager
        .load_mcp_environment_bindings()
        .map_err(config_error)?
    {
        let value = resolver(&binding.reference)
            .map_err(credential_error)?
            .ok_or_else(|| {
                runtime_error(
                    "hermes_mcp_environment_required",
                    &format!(
                        "A required MCP environment reference is missing: {}.",
                        binding.reference.reference_id
                    ),
                    false,
                )
            })?;
        environment.insert(binding.process_env_key, value);
    }
    Ok(environment)
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
            let expected = manager
                .render_expected_config(desired)
                .map_err(config_error)?;
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
    use std::collections::BTreeMap;
    use std::fs;
    use std::path::PathBuf;

    use super::{
        configure_runtime_desired_state, ensure_config_matches_desired, load_runtime_desired_state,
        resolve_mcp_launch_environment_with, resolve_system_tool_paths,
        OFFICECLI_SYSTEM_CAPABILITY_ID,
    };
    use crate::shared::hermes_core::config::{
        HermesConfigManager, HermesEnvironmentReference, HermesEnvironmentReferenceKind,
        HermesMcpEnvironmentBinding, HermesMcpServerDesiredState, HermesPaths,
        HermesProviderDesiredState, WorkbenchHermesDesiredState,
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
    fn resolves_only_installed_core_owned_system_tool_capabilities() {
        let root = temp_root();
        let paths = HermesPaths::from_app_data_dir(&root);
        let manager = HermesConfigManager {
            paths: paths.clone(),
        };
        manager.apply(&desired("deepseek-chat")).unwrap();
        let skill_root = root.join("workbenches/office/skills/generate");
        fs::create_dir_all(&skill_root).unwrap();
        fs::write(skill_root.join("SKILL.md"), "# Generate\n").unwrap();
        manager
            .bind_workbench(
                &desired("deepseek-chat"),
                &WorkbenchHermesDesiredState {
                    workbench_id: "com.blackrain.office".into(),
                    workbench_version: "0.1.0".into(),
                    skill_roots: vec![skill_root],
                    plugin_ids: Vec::new(),
                    mcp_server_ids: Vec::new(),
                    environment_refs: vec![HermesEnvironmentReference {
                        kind: HermesEnvironmentReferenceKind::SystemCapability,
                        reference_id: OFFICECLI_SYSTEM_CAPABILITY_ID.into(),
                    }],
                    provider_secret_ref: None,
                    permission_grant_id: "grant-office".into(),
                },
                &[],
                true,
            )
            .unwrap();
        let tool_root = root.join("tools/officecli");
        fs::create_dir_all(&tool_root).unwrap();
        fs::write(tool_root.join("officecli"), b"fixture").unwrap();
        assert_eq!(
            resolve_system_tool_paths(&paths, &manager).unwrap(),
            vec![tool_root]
        );

        let mut unsupported = manager.load_workbench_desired_state().unwrap().unwrap();
        unsupported.environment_refs[0].reference_id = "untrusted-tool".into();
        manager
            .bind_workbench(&desired("deepseek-chat"), &unsupported, &[], true)
            .unwrap();
        assert_eq!(
            resolve_system_tool_paths(&paths, &manager)
                .unwrap_err()
                .code,
            "hermes_system_capability_unsupported"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn missing_system_tool_capability_fails_closed() {
        let root = temp_root();
        let paths = HermesPaths::from_app_data_dir(&root);
        let manager = HermesConfigManager {
            paths: paths.clone(),
        };
        manager.apply(&desired("deepseek-chat")).unwrap();
        let skill_root = root.join("workbenches/office/skills/generate");
        fs::create_dir_all(&skill_root).unwrap();
        fs::write(skill_root.join("SKILL.md"), "# Generate\n").unwrap();
        manager
            .bind_workbench(
                &desired("deepseek-chat"),
                &WorkbenchHermesDesiredState {
                    workbench_id: "com.blackrain.office".into(),
                    workbench_version: "0.1.0".into(),
                    skill_roots: vec![skill_root],
                    plugin_ids: Vec::new(),
                    mcp_server_ids: Vec::new(),
                    environment_refs: vec![HermesEnvironmentReference {
                        kind: HermesEnvironmentReferenceKind::SystemCapability,
                        reference_id: OFFICECLI_SYSTEM_CAPABILITY_ID.into(),
                    }],
                    provider_secret_ref: None,
                    permission_grant_id: "grant-office".into(),
                },
                &[],
                true,
            )
            .unwrap();
        assert_eq!(
            resolve_system_tool_paths(&paths, &manager)
                .unwrap_err()
                .code,
            "hermes_system_capability_missing"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_system_tool_capability_fails_closed() {
        use std::os::unix::fs::symlink;

        let root = temp_root();
        let paths = HermesPaths::from_app_data_dir(&root);
        let manager = HermesConfigManager {
            paths: paths.clone(),
        };
        manager.apply(&desired("deepseek-chat")).unwrap();
        let skill_root = root.join("workbenches/office/skills/generate");
        fs::create_dir_all(&skill_root).unwrap();
        fs::write(skill_root.join("SKILL.md"), "# Generate\n").unwrap();
        manager
            .bind_workbench(
                &desired("deepseek-chat"),
                &WorkbenchHermesDesiredState {
                    workbench_id: "com.blackrain.office".into(),
                    workbench_version: "0.1.0".into(),
                    skill_roots: vec![skill_root],
                    plugin_ids: Vec::new(),
                    mcp_server_ids: Vec::new(),
                    environment_refs: vec![HermesEnvironmentReference {
                        kind: HermesEnvironmentReferenceKind::SystemCapability,
                        reference_id: OFFICECLI_SYSTEM_CAPABILITY_ID.into(),
                    }],
                    provider_secret_ref: None,
                    permission_grant_id: "grant-office".into(),
                },
                &[],
                true,
            )
            .unwrap();
        let external = temp_root();
        fs::write(external.join("officecli"), b"fixture").unwrap();
        fs::create_dir_all(root.join("tools")).unwrap();
        symlink(&external, root.join("tools/officecli")).unwrap();
        assert_eq!(
            resolve_system_tool_paths(&paths, &manager)
                .unwrap_err()
                .code,
            "hermes_system_capability_invalid"
        );
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(external).unwrap();
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
    fn complete_mcp_binding_is_part_of_runtime_drift_validation() {
        let root = temp_root();
        let paths = HermesPaths::from_app_data_dir(&root);
        let provider = desired("deepseek-chat");
        configure_runtime_desired_state(&paths, &provider).unwrap();
        let skill_root = root.join("skills");
        fs::create_dir_all(skill_root.join("office")).unwrap();
        fs::write(skill_root.join("office").join("SKILL.md"), "# Office").unwrap();
        let reference = HermesEnvironmentReference {
            kind: HermesEnvironmentReferenceKind::ManagedVariable,
            reference_id: "office-license".into(),
        };
        let workbench = WorkbenchHermesDesiredState {
            workbench_id: "com.blackrain.office".into(),
            workbench_version: "0.1.0".into(),
            skill_roots: vec![skill_root],
            plugin_ids: vec!["com.blackrain.office-cli".into()],
            mcp_server_ids: vec!["com.blackrain.office-files".into()],
            environment_refs: vec![reference.clone()],
            provider_secret_ref: None,
            permission_grant_id: "grant-office".into(),
        };
        let server = HermesMcpServerDesiredState {
            id: "com.blackrain.office-files".into(),
            command: root.join("office-mcp.exe"),
            args: vec!["--stdio".into()],
            environment: BTreeMap::from([(
                "OFFICE_LICENSE".into(),
                HermesMcpEnvironmentBinding {
                    process_env_key: "BLACKRAIN_MCP_SECRET_00112233445566778899AABBCCDDEEFF".into(),
                    reference,
                },
            )]),
            timeout_seconds: 300,
            connect_timeout_seconds: 30,
            supports_parallel_tool_calls: false,
        };
        let manager = HermesConfigManager {
            paths: paths.clone(),
        };
        manager
            .bind_workbench(&provider, &workbench, &[server], true)
            .unwrap();

        ensure_config_matches_desired(&manager, &provider).unwrap();
        let environment = resolve_mcp_launch_environment_with(&manager, |reference| {
            assert_eq!(reference.reference_id, "office-license");
            Ok(Some("secret-value".into()))
        })
        .unwrap();
        assert_eq!(environment.len(), 1);
        assert_eq!(
            environment["BLACKRAIN_MCP_SECRET_00112233445566778899AABBCCDDEEFF"],
            "secret-value"
        );
        assert_eq!(
            resolve_mcp_launch_environment_with(&manager, |_| Ok(None))
                .unwrap_err()
                .code,
            "hermes_mcp_environment_required"
        );
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
