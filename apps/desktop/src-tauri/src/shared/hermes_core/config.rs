use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

const MANAGED_HEADER: &str = "# BlackRain managed Hermes config v1";
const HERMES_WORKBENCH_BINDING_SCHEMA_VERSION: u32 = 1;
const MAX_SKILL_TREE_ENTRIES: usize = 50_000;
const MAX_SKILL_TREE_DEPTH: usize = 32;
pub(crate) const PROVIDER_API_KEY_ENV: &str = "BLACKRAIN_HERMES_PROVIDER_API_KEY";
pub(crate) const MCP_ROUTER_BEARER_ENV: &str = "BLACKRAIN_MCP_ROUTER_BEARER";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct HermesPaths {
    pub(crate) home: PathBuf,
    pub(crate) config: PathBuf,
    pub(crate) last_good_config: PathBuf,
    pub(crate) desired_state: PathBuf,
    pub(crate) workbench_desired_state: PathBuf,
}

impl HermesPaths {
    pub(crate) fn from_app_data_dir(app_data_dir: &Path) -> Self {
        let home = app_data_dir.join("hermes-home");
        Self {
            config: home.join("config.yaml"),
            last_good_config: home.join("config.yaml.last-good"),
            desired_state: home.join("desired-state.v1.json"),
            workbench_desired_state: home.join("workbench-desired-state.v1.json"),
            home,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub(crate) struct HermesProviderDesiredState {
    pub(crate) provider_id: String,
    pub(crate) display_name: String,
    pub(crate) base_url: String,
    pub(crate) model: String,
    pub(crate) key_env: String,
    pub(crate) context_length: Option<u64>,
    pub(crate) discover_models: bool,
}

impl HermesProviderDesiredState {
    pub(crate) fn blackrain_new_api(
        base_url: String,
        model: String,
        context_length: Option<u64>,
    ) -> Self {
        Self {
            provider_id: "blackrain-new-api".into(),
            display_name: "BlackRain new-api".into(),
            base_url,
            model,
            key_env: PROVIDER_API_KEY_ENV.into(),
            context_length,
            discover_models: true,
        }
    }

    pub(crate) fn validate(&self) -> Result<(), String> {
        validate_provider_id(&self.provider_id)?;
        if self.provider_id.eq_ignore_ascii_case("custom") {
            return Err("Bare custom provider ids are forbidden; use a named provider.".into());
        }
        validate_non_empty("provider display name", &self.display_name)?;
        validate_http_url(&self.base_url)?;
        validate_non_empty("model", &self.model)?;
        validate_env_key(&self.key_env)?;
        if self.key_env != PROVIDER_API_KEY_ENV {
            return Err(format!(
                "Hermes provider key_env must be the App-managed {PROVIDER_API_KEY_ENV} variable."
            ));
        }
        if let Some(context_length) = self.context_length {
            if context_length < 1024 {
                return Err("Hermes context length must be at least 1024 tokens.".into());
            }
        }
        Ok(())
    }
}

/// 工作台只能声明资源引用，不能注入任意进程环境或覆盖 Hermes 全局配置。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub(crate) struct WorkbenchHermesDesiredState {
    pub(crate) workbench_id: String,
    pub(crate) workbench_version: String,
    #[serde(default)]
    pub(crate) project_root: PathBuf,
    pub(crate) skill_roots: Vec<PathBuf>,
    pub(crate) plugin_ids: Vec<String>,
    pub(crate) mcp_server_ids: Vec<String>,
    #[serde(default)]
    pub(crate) environment_refs: Vec<HermesEnvironmentReference>,
    pub(crate) provider_secret_ref: Option<HermesSecretReference>,
    pub(crate) permission_grant_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum HermesEnvironmentReferenceKind {
    ProviderCredential,
    ManagedVariable,
    SystemCapability,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct HermesEnvironmentReference {
    pub(crate) kind: HermesEnvironmentReferenceKind,
    pub(crate) reference_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct HermesMcpEnvironmentBinding {
    pub(crate) process_env_key: String,
    pub(crate) reference: HermesEnvironmentReference,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct HermesMcpServerDesiredState {
    pub(crate) id: String,
    pub(crate) command: PathBuf,
    #[serde(default)]
    pub(crate) args: Vec<String>,
    #[serde(default)]
    pub(crate) environment: BTreeMap<String, HermesMcpEnvironmentBinding>,
    pub(crate) timeout_seconds: u64,
    pub(crate) connect_timeout_seconds: u64,
    #[serde(default)]
    pub(crate) supports_parallel_tool_calls: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct HermesMcpRouterConfig {
    pub(crate) url: String,
}

impl HermesMcpRouterConfig {
    pub(crate) fn validate(&self) -> Result<(), String> {
        let port = self
            .url
            .strip_prefix("http://127.0.0.1:")
            .and_then(|value| value.strip_suffix("/mcp"))
            .and_then(|value| value.parse::<u16>().ok())
            .filter(|value| *value != 0)
            .ok_or_else(|| {
                "Hermes MCP router URL must be an exact loopback /mcp URL with a valid port."
                    .to_string()
            })?;
        let _ = port;
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HermesWorkbenchBinding {
    schema_version: u32,
    workbench: WorkbenchHermesDesiredState,
    #[serde(default)]
    mcp_servers: Vec<HermesMcpServerDesiredState>,
}

impl WorkbenchHermesDesiredState {
    pub(crate) fn validate(&self) -> Result<(), String> {
        validate_non_empty("workbench id", &self.workbench_id)?;
        validate_non_empty("workbench version", &self.workbench_version)?;
        validate_non_empty("permission grant id", &self.permission_grant_id)?;
        if self.skill_roots.is_empty() {
            return Err("Hermes workbench requires at least one skill root.".into());
        }
        if self
            .skill_roots
            .iter()
            .any(|path| !is_safe_absolute_path(path))
        {
            return Err("Hermes workbench skill roots must be absolute safe paths.".into());
        }
        for plugin_id in &self.plugin_ids {
            validate_non_empty("plugin id", plugin_id)?;
        }
        for server_id in &self.mcp_server_ids {
            validate_non_empty("MCP server id", server_id)?;
        }
        if let Some(secret_ref) = &self.provider_secret_ref {
            secret_ref.validate()?;
        }
        let mut environment_refs = HashSet::new();
        for reference in &self.environment_refs {
            reference.validate()?;
            if !environment_refs.insert(reference) {
                return Err("Hermes workbench environment references must be unique.".into());
            }
        }
        validate_unique_paths(&self.skill_roots)?;
        Ok(())
    }
}

impl HermesMcpServerDesiredState {
    pub(crate) fn validate(&self) -> Result<(), String> {
        validate_non_empty("MCP server id", &self.id)?;
        if !is_safe_absolute_path(&self.command) {
            return Err("Hermes MCP command must be an absolute safe path.".into());
        }
        if self.args.len() > 128
            || self
                .args
                .iter()
                .any(|argument| argument.len() > 4096 || argument.contains('\0'))
        {
            return Err("Hermes MCP arguments are invalid or exceed bounded limits.".into());
        }
        for (child_env_key, binding) in &self.environment {
            validate_env_key(child_env_key)?;
            validate_mcp_child_env_key(child_env_key)?;
            validate_mcp_process_env_key(&binding.process_env_key)?;
            binding.reference.validate()?;
            if binding.reference.kind == HermesEnvironmentReferenceKind::SystemCapability {
                return Err(
                    "Hermes MCP environment cannot resolve a system capability as a secret value."
                        .into(),
                );
            }
        }
        if !(1..=3600).contains(&self.timeout_seconds)
            || !(1..=300).contains(&self.connect_timeout_seconds)
        {
            return Err("Hermes MCP timeout values are outside the allowed range.".into());
        }
        Ok(())
    }
}

impl HermesEnvironmentReference {
    pub(crate) fn validate(&self) -> Result<(), String> {
        validate_reference_id(&self.reference_id)
    }
}

fn is_safe_absolute_path(path: &Path) -> bool {
    if path.is_absolute() {
        return !path
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir));
    }
    let Some(value) = path.to_str() else {
        return false;
    };
    let windows_absolute = value.starts_with("\\\\")
        || (value.len() >= 3
            && value.as_bytes()[0].is_ascii_alphabetic()
            && value.as_bytes()[1] == b':'
            && matches!(value.as_bytes()[2], b'\\' | b'/'));
    windows_absolute
        && !value.contains('\0')
        && !value.split(['/', '\\']).any(|segment| segment == "..")
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub(crate) enum HermesSecretReference {
    ProviderCredential {
        #[serde(rename = "providerId")]
        provider_id: String,
    },
}

impl HermesSecretReference {
    pub(crate) fn validate(&self) -> Result<(), String> {
        match self {
            Self::ProviderCredential { provider_id } => validate_provider_id(provider_id),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesConfigSummary {
    pub(crate) provider_id: String,
    pub(crate) provider_identity: String,
    pub(crate) base_url: String,
    pub(crate) model: String,
    pub(crate) key_env: String,
    pub(crate) contains_inline_secret: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct HermesWorkbenchBindResult {
    pub(crate) config_summary: HermesConfigSummary,
    pub(crate) mcp_changed: bool,
    pub(crate) process_environment_changed: bool,
    pub(crate) rollback: HermesWorkbenchBindRollback,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct HermesWorkbenchBindRollback {
    workbench_binding: Option<Vec<u8>>,
    config: Option<Vec<u8>>,
    last_good_config: Option<Vec<u8>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesRepairPlan {
    pub(crate) reason: String,
    pub(crate) config_path: String,
    pub(crate) last_good_path: String,
    pub(crate) last_good_available: bool,
    pub(crate) action: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum HermesConfigInspection {
    Missing,
    Valid,
    RepairRequired(HermesRepairPlan),
}

#[derive(Debug, Clone)]
pub(crate) struct HermesConfigManager {
    pub(crate) paths: HermesPaths,
}

impl HermesConfigManager {
    pub(crate) fn new(app_data_dir: &Path) -> Self {
        Self {
            paths: HermesPaths::from_app_data_dir(app_data_dir),
        }
    }

    pub(crate) fn inspect(&self) -> Result<HermesConfigInspection, String> {
        if !self.paths.config.exists() {
            return Ok(HermesConfigInspection::Missing);
        }
        let content = fs::read_to_string(&self.paths.config).map_err(|error| {
            format!(
                "Unable to read Hermes config {}: {error}",
                self.paths.config.display()
            )
        })?;
        match validate_managed_config_contents(&content) {
            Ok(()) => Ok(HermesConfigInspection::Valid),
            Err(reason) => Ok(HermesConfigInspection::RepairRequired(
                self.repair_plan(reason),
            )),
        }
    }

    pub(crate) fn apply(
        &self,
        desired: &HermesProviderDesiredState,
    ) -> Result<HermesConfigSummary, String> {
        desired.validate()?;
        let binding = self.load_workbench_binding()?;
        if let HermesConfigInspection::RepairRequired(plan) = self.inspect()? {
            return Err(format!(
                "Hermes config requires repair before update: {} ({})",
                plan.reason, plan.config_path
            ));
        }
        fs::create_dir_all(&self.paths.home).map_err(|error| {
            format!(
                "Unable to create isolated HERMES_HOME {}: {error}",
                self.paths.home.display()
            )
        })?;
        if self.paths.config.is_file() {
            let previous = fs::read(&self.paths.config)
                .map_err(|error| format!("Unable to read previous Hermes config: {error}"))?;
            atomic_write(&self.paths.last_good_config, &previous)?;
        }
        let router = self.load_current_router_config()?;
        let rendered =
            render_config_with_binding_and_router(desired, binding.as_ref(), router.as_ref())?;
        // desired-state 是 App 的非敏感真源。先持久化它，确保随后 config 写入失败时
        // repair 仍有可用输入；反向顺序会留下无法自动修复的“新 config + 旧/缺失 desired”。
        persist_desired_state(&self.paths.desired_state, desired)?;
        atomic_write(&self.paths.config, rendered.as_bytes())?;
        if !self.paths.last_good_config.exists() {
            atomic_write(&self.paths.last_good_config, rendered.as_bytes())?;
        }
        tighten_file_permissions(&self.paths.config)?;
        Ok(summary(desired))
    }

    pub(crate) fn bind_workbench(
        &self,
        provider: &HermesProviderDesiredState,
        workbench: &WorkbenchHermesDesiredState,
        mcp_servers: &[HermesMcpServerDesiredState],
        allow_mcp_change: bool,
    ) -> Result<HermesWorkbenchBindResult, String> {
        provider.validate()?;
        workbench.validate()?;
        validate_mcp_binding(workbench, mcp_servers)?;
        let previous_binding = self.load_workbench_binding()?;
        let previous_mcp = previous_binding
            .as_ref()
            .map(|binding| binding.mcp_servers.as_slice())
            .unwrap_or(&[]);
        let mcp_changed = previous_mcp != mcp_servers;
        let process_environment_changed = previous_binding
            .as_ref()
            .map(|binding| binding.workbench.project_root.as_path())
            != Some(workbench.project_root.as_path());
        if (mcp_changed || process_environment_changed) && !allow_mcp_change {
            return Err(
                "Hermes process binding cannot change while any WORK run is active.".into(),
            );
        }
        if let Some(HermesSecretReference::ProviderCredential { provider_id }) =
            &workbench.provider_secret_ref
        {
            if provider_id != &provider.provider_id {
                return Err(
                    "Hermes workbench provider credential does not match the configured provider."
                        .into(),
                );
            }
        }
        validate_skill_roots_for_binding(&workbench.skill_roots)?;
        validate_project_root_for_binding(&workbench.project_root)?;
        if let HermesConfigInspection::RepairRequired(plan) = self.inspect()? {
            return Err(format!(
                "Hermes config requires repair before binding a workbench: {} ({})",
                plan.reason, plan.config_path
            ));
        }
        let binding = HermesWorkbenchBinding {
            schema_version: HERMES_WORKBENCH_BINDING_SCHEMA_VERSION,
            workbench: workbench.clone(),
            mcp_servers: mcp_servers.to_vec(),
        };
        self.apply_workbench_binding(
            provider,
            Some(&binding),
            mcp_changed,
            process_environment_changed,
            true,
        )
    }

    pub(crate) fn unbind_workbench(
        &self,
        provider: &HermesProviderDesiredState,
        allow_mcp_change: bool,
    ) -> Result<HermesWorkbenchBindResult, String> {
        provider.validate()?;
        let previous_binding = self.load_workbench_binding()?;
        let mcp_changed = previous_binding
            .as_ref()
            .is_some_and(|binding| !binding.mcp_servers.is_empty());
        let process_environment_changed = previous_binding.is_some();
        if (mcp_changed || process_environment_changed) && !allow_mcp_change {
            return Err(
                "Hermes process binding cannot change while any WORK run is active.".into(),
            );
        }
        if let HermesConfigInspection::RepairRequired(plan) = self.inspect()? {
            return Err(format!(
                "Hermes config requires repair before unbinding a workbench: {} ({})",
                plan.reason, plan.config_path
            ));
        }
        self.apply_workbench_binding(
            provider,
            None,
            mcp_changed,
            process_environment_changed,
            false,
        )
    }

    fn apply_workbench_binding(
        &self,
        provider: &HermesProviderDesiredState,
        binding: Option<&HermesWorkbenchBinding>,
        mcp_changed: bool,
        process_environment_changed: bool,
        preserve_router: bool,
    ) -> Result<HermesWorkbenchBindResult, String> {
        fs::create_dir_all(&self.paths.home).map_err(|error| {
            format!(
                "Unable to create isolated HERMES_HOME {}: {error}",
                self.paths.home.display()
            )
        })?;
        let rollback = self.capture_workbench_bind_rollback()?;
        let router = if preserve_router {
            self.load_current_router_config()?
        } else {
            None
        };
        let apply_result = (|| {
            if let Some(previous) = rollback.config.as_deref() {
                atomic_write(&self.paths.last_good_config, previous)?;
            }
            match binding {
                Some(binding) => {
                    persist_workbench_binding(&self.paths.workbench_desired_state, binding)?;
                }
                None => restore_optional_file(
                    &self.paths.workbench_desired_state,
                    None,
                    "Hermes workbench binding",
                )?,
            }
            persist_desired_state(&self.paths.desired_state, provider)?;
            let rendered =
                render_config_with_binding_and_router(provider, binding, router.as_ref())?;
            atomic_write(&self.paths.config, rendered.as_bytes())?;
            if !self.paths.last_good_config.exists() {
                atomic_write(&self.paths.last_good_config, rendered.as_bytes())?;
            }
            tighten_file_permissions(&self.paths.config)
        })();
        if let Err(error) = apply_result {
            return match self.rollback_workbench_binding(&rollback) {
                Ok(()) => Err(error),
                Err(rollback_error) => Err(format!(
                    "{error}; unable to roll back Hermes workbench binding: {rollback_error}"
                )),
            };
        }
        Ok(HermesWorkbenchBindResult {
            config_summary: summary(provider),
            mcp_changed,
            process_environment_changed,
            rollback,
        })
    }

    pub(crate) fn rollback_workbench_binding(
        &self,
        rollback: &HermesWorkbenchBindRollback,
    ) -> Result<(), String> {
        restore_optional_file(
            &self.paths.workbench_desired_state,
            rollback.workbench_binding.as_deref(),
            "Hermes workbench binding",
        )?;
        restore_optional_file(
            &self.paths.config,
            rollback.config.as_deref(),
            "Hermes config",
        )?;
        restore_optional_file(
            &self.paths.last_good_config,
            rollback.last_good_config.as_deref(),
            "Hermes last-good config",
        )?;
        Ok(())
    }

    fn capture_workbench_bind_rollback(&self) -> Result<HermesWorkbenchBindRollback, String> {
        Ok(HermesWorkbenchBindRollback {
            workbench_binding: read_optional_file(
                &self.paths.workbench_desired_state,
                "Hermes workbench binding",
            )?,
            config: read_optional_file(&self.paths.config, "Hermes config")?,
            last_good_config: read_optional_file(
                &self.paths.last_good_config,
                "Hermes last-good config",
            )?,
        })
    }

    pub(crate) fn repair(
        &self,
        desired: &HermesProviderDesiredState,
    ) -> Result<(HermesConfigSummary, Option<PathBuf>), String> {
        desired.validate()?;
        let binding = self.load_workbench_binding()?;
        fs::create_dir_all(&self.paths.home).map_err(|error| error.to_string())?;
        let rendered = render_config_with_binding(desired, binding.as_ref())?;
        // repair 也先冻结可恢复的 desired-state，再移动现有 config。
        persist_desired_state(&self.paths.desired_state, desired)?;
        let quarantined = if self.paths.config.exists() {
            let quarantine = self
                .paths
                .home
                .join(format!("config.yaml.corrupt-{}", Uuid::new_v4().simple()));
            fs::rename(&self.paths.config, &quarantine)
                .map_err(|error| format!("Unable to quarantine corrupt Hermes config: {error}"))?;
            Some(quarantine)
        } else {
            None
        };
        atomic_write(&self.paths.config, rendered.as_bytes())?;
        tighten_file_permissions(&self.paths.config)?;
        Ok((summary(desired), quarantined))
    }

    pub(crate) fn load_desired_state(&self) -> Result<HermesProviderDesiredState, String> {
        let bytes = fs::read(&self.paths.desired_state).map_err(|error| {
            format!(
                "Unable to read Hermes desired state {}: {error}",
                self.paths.desired_state.display()
            )
        })?;
        let desired = serde_json::from_slice::<HermesProviderDesiredState>(&bytes)
            .map_err(|error| format!("Hermes desired state is invalid: {error}"))?;
        desired.validate()?;
        Ok(desired)
    }

    pub(crate) fn load_workbench_desired_state(
        &self,
    ) -> Result<Option<WorkbenchHermesDesiredState>, String> {
        Ok(self
            .load_workbench_binding()?
            .map(|binding| binding.workbench))
    }

    pub(crate) fn load_mcp_server_desired_states(
        &self,
    ) -> Result<Vec<HermesMcpServerDesiredState>, String> {
        Ok(self
            .load_workbench_binding()?
            .map(|binding| binding.mcp_servers)
            .unwrap_or_default())
    }

    pub(crate) fn render_expected_config(
        &self,
        desired: &HermesProviderDesiredState,
    ) -> Result<String, String> {
        let binding = self.load_workbench_binding()?;
        render_config_with_binding(desired, binding.as_ref())
    }

    pub(crate) fn apply_router_config(
        &self,
        desired: &HermesProviderDesiredState,
        router: &HermesMcpRouterConfig,
    ) -> Result<(), String> {
        desired.validate()?;
        router.validate()?;
        if let HermesConfigInspection::RepairRequired(plan) = self.inspect()? {
            return Err(format!(
                "Hermes config requires repair before attaching the managed MCP router: {} ({})",
                plan.reason, plan.config_path
            ));
        }
        let binding = self.load_workbench_binding()?;
        let rendered =
            render_config_with_binding_and_router(desired, binding.as_ref(), Some(router))?;
        if self.paths.config.is_file() {
            let previous = fs::read(&self.paths.config)
                .map_err(|error| format!("Unable to read previous Hermes config: {error}"))?;
            atomic_write(&self.paths.last_good_config, &previous)?;
        }
        atomic_write(&self.paths.config, rendered.as_bytes())?;
        tighten_file_permissions(&self.paths.config)
    }

    pub(crate) fn render_expected_config_with_router(
        &self,
        desired: &HermesProviderDesiredState,
        router: &HermesMcpRouterConfig,
    ) -> Result<String, String> {
        let binding = self.load_workbench_binding()?;
        render_config_with_binding_and_router(desired, binding.as_ref(), Some(router))
    }

    fn load_current_router_config(&self) -> Result<Option<HermesMcpRouterConfig>, String> {
        if !self.paths.config.is_file() {
            return Ok(None);
        }
        let content = fs::read_to_string(&self.paths.config)
            .map_err(|error| format!("Unable to read Hermes config: {error}"))?;
        let marker = "mcp_servers:\n  blackrain-router:\n    url: ";
        let Some((_, suffix)) = content.split_once(marker) else {
            return Ok(None);
        };
        let encoded = suffix.lines().next().unwrap_or_default();
        let url = serde_json::from_str::<String>(encoded)
            .map_err(|_| "Managed Hermes MCP router URL is invalid.".to_string())?;
        let router = HermesMcpRouterConfig { url };
        router.validate()?;
        Ok(Some(router))
    }

    fn load_workbench_binding(&self) -> Result<Option<HermesWorkbenchBinding>, String> {
        if !self.paths.workbench_desired_state.exists() {
            return Ok(None);
        }
        reject_symlink(
            &self.paths.workbench_desired_state,
            "workbench desired state",
        )?;
        let bytes = fs::read(&self.paths.workbench_desired_state).map_err(|error| {
            format!(
                "Unable to read Hermes workbench desired state {}: {error}",
                self.paths.workbench_desired_state.display()
            )
        })?;
        let value: serde_json::Value = serde_json::from_slice(&bytes)
            .map_err(|error| format!("Hermes workbench binding is invalid: {error}"))?;
        let binding = match serde_json::from_value::<HermesWorkbenchBinding>(value.clone()) {
            Ok(binding) => binding,
            Err(binding_error) => {
                let legacy = serde_json::from_value::<WorkbenchHermesDesiredState>(value)
                    .map_err(|_| format!("Hermes workbench binding is invalid: {binding_error}"))?;
                if !legacy.mcp_server_ids.is_empty() {
                    return Err(
                        "Legacy Hermes workbench binding contains unresolved MCP servers and must be rebound."
                            .into(),
                    );
                }
                HermesWorkbenchBinding {
                    schema_version: HERMES_WORKBENCH_BINDING_SCHEMA_VERSION,
                    workbench: legacy,
                    mcp_servers: Vec::new(),
                }
            }
        };
        if binding.schema_version != HERMES_WORKBENCH_BINDING_SCHEMA_VERSION {
            return Err(format!(
                "Unsupported Hermes workbench binding schema version {}.",
                binding.schema_version
            ));
        }
        binding.workbench.validate()?;
        validate_skill_roots_for_binding(&binding.workbench.skill_roots)?;
        if !binding.workbench.project_root.as_os_str().is_empty() {
            validate_project_root_for_binding(&binding.workbench.project_root)?;
        }
        validate_mcp_binding(&binding.workbench, &binding.mcp_servers)?;
        Ok(Some(binding))
    }

    fn repair_plan(&self, reason: String) -> HermesRepairPlan {
        HermesRepairPlan {
            reason,
            config_path: self.paths.config.to_string_lossy().to_string(),
            last_good_path: self.paths.last_good_config.to_string_lossy().to_string(),
            last_good_available: self.paths.last_good_config.is_file(),
            action: "Quarantine the corrupt config, regenerate it from App-owned desired state, then restart Hermes.".into(),
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct HermesLaunchEnvironment {
    values: BTreeMap<String, String>,
}

impl HermesLaunchEnvironment {
    pub(crate) fn build(
        paths: &HermesPaths,
        write_safe_root: Option<&Path>,
        api_port: u16,
        api_server_key: &str,
        provider_api_key: &str,
        mcp_environment: &BTreeMap<String, String>,
        tool_paths: &[PathBuf],
    ) -> Result<Self, String> {
        if api_port == 0 {
            return Err("Hermes API port must be non-zero.".into());
        }
        validate_secret("Hermes API server key", api_server_key, 32)?;
        validate_secret("Hermes provider API key", provider_api_key, 1)?;
        let mut values = BTreeMap::new();
        values.insert(
            "HERMES_HOME".into(),
            paths.home.to_string_lossy().to_string(),
        );
        values.insert("API_SERVER_ENABLED".into(), "true".into());
        values.insert("API_SERVER_HOST".into(), "127.0.0.1".into());
        values.insert("API_SERVER_PORT".into(), api_port.to_string());
        values.insert("API_SERVER_KEY".into(), api_server_key.into());
        values.insert(PROVIDER_API_KEY_ENV.into(), provider_api_key.into());
        values.insert("CUA_DRIVER_RS_TELEMETRY_ENABLED".into(), "0".into());
        if let Some(write_safe_root) = write_safe_root {
            validate_project_root_for_binding(write_safe_root)?;
            values.insert(
                "HERMES_WRITE_SAFE_ROOT".into(),
                write_safe_root.to_string_lossy().to_string(),
            );
        }
        if !tool_paths.is_empty() {
            if tool_paths.iter().any(|path| !is_safe_absolute_path(path)) {
                return Err("Hermes system tool paths must be absolute safe paths.".into());
            }
            let mut entries = tool_paths.to_vec();
            if let Some(parent_path) = std::env::var_os("PATH") {
                entries.extend(std::env::split_paths(&parent_path));
            }
            let joined = std::env::join_paths(entries)
                .map_err(|error| format!("Unable to compose Hermes system tool PATH: {error}"))?;
            values.insert("PATH".into(), joined.to_string_lossy().to_string());
        }
        for (key, value) in mcp_environment {
            if key != MCP_ROUTER_BEARER_ENV {
                validate_mcp_process_env_key(key)?;
            }
            if value.is_empty() || value.len() > 65_536 || value.chars().any(char::is_control) {
                return Err("Hermes MCP environment values must be non-empty, bounded, and contain no control characters.".into());
            }
            values.insert(key.clone(), value.clone());
        }
        Ok(Self { values })
    }

    pub(crate) fn values(&self) -> &BTreeMap<String, String> {
        &self.values
    }

    pub(crate) fn redacted_summary(&self) -> BTreeMap<String, String> {
        self.values
            .iter()
            .map(|(key, value)| {
                let safe = if key == "API_SERVER_KEY"
                    || key == PROVIDER_API_KEY_ENV
                    || key == MCP_ROUTER_BEARER_ENV
                    || key.starts_with("BLACKRAIN_MCP_SECRET_")
                {
                    "<redacted>".into()
                } else {
                    value.clone()
                };
                (key.clone(), safe)
            })
            .collect()
    }
}

pub(crate) fn render_config(desired: &HermesProviderDesiredState) -> Result<String, String> {
    render_config_with_workbench(desired, None)
}

pub(crate) fn render_config_with_workbench(
    desired: &HermesProviderDesiredState,
    workbench: Option<&WorkbenchHermesDesiredState>,
) -> Result<String, String> {
    let binding = workbench.map(|workbench| HermesWorkbenchBinding {
        schema_version: HERMES_WORKBENCH_BINDING_SCHEMA_VERSION,
        workbench: workbench.clone(),
        mcp_servers: Vec::new(),
    });
    render_config_with_binding(desired, binding.as_ref())
}

fn render_config_with_binding(
    desired: &HermesProviderDesiredState,
    binding: Option<&HermesWorkbenchBinding>,
) -> Result<String, String> {
    render_config_with_binding_and_router(desired, binding, None)
}

fn render_config_with_binding_and_router(
    desired: &HermesProviderDesiredState,
    binding: Option<&HermesWorkbenchBinding>,
    router: Option<&HermesMcpRouterConfig>,
) -> Result<String, String> {
    desired.validate()?;
    if let Some(router) = router {
        router.validate()?;
    }
    if let Some(binding) = binding {
        binding.workbench.validate()?;
        validate_mcp_binding(&binding.workbench, &binding.mcp_servers)?;
    }
    let provider_identity = format!("custom:{}", desired.provider_id);
    let mut output = format!(
        "{MANAGED_HEADER}\nagent:\n  disabled_toolsets:\n    - memory\n    - session_search\n    - cronjob\nmemory:\n  memory_enabled: false\n  user_profile_enabled: false\n  provider: \"\"\nmodel:\n  default: {}\n  provider: {}\nproviders:\n  {}:\n    name: {}\n    base_url: {}\n    key_env: {}\n    api_mode: \"chat_completions\"\n    default_model: {}\n    discover_models: {}\n",
        yaml_quote(&desired.model),
        yaml_quote(&provider_identity),
        desired.provider_id,
        yaml_quote(&desired.display_name),
        yaml_quote(&desired.base_url),
        yaml_quote(&desired.key_env),
        yaml_quote(&desired.model),
        desired.discover_models,
    );
    if let Some(context_length) = desired.context_length {
        output.push_str(&format!(
            "    models:\n      {}:\n        context_length: {context_length}\n",
            yaml_quote(&desired.model)
        ));
    }
    if let Some(binding) = binding {
        output.push_str("skills:\n  external_dirs:\n");
        for root in &binding.workbench.skill_roots {
            output.push_str(&format!("    - {}\n", yaml_quote(&root.to_string_lossy())));
        }
    }
    if let Some(router) = router {
        output.push_str("mcp_servers:\n  blackrain-router:\n");
        output.push_str(&format!("    url: {}\n", yaml_quote(&router.url)));
        output.push_str("    headers:\n");
        output.push_str(&format!(
            "      Authorization: {}\n",
            yaml_quote(&format!("Bearer ${{{MCP_ROUTER_BEARER_ENV}}}"))
        ));
        output.push_str("    connect_timeout: 20\n    timeout: 3600\n    skip_preflight: true\n");
    }
    Ok(output)
}

pub(crate) fn summary(desired: &HermesProviderDesiredState) -> HermesConfigSummary {
    HermesConfigSummary {
        provider_id: desired.provider_id.clone(),
        provider_identity: format!("custom:{}", desired.provider_id),
        base_url: desired.base_url.clone(),
        model: desired.model.clone(),
        key_env: desired.key_env.clone(),
        contains_inline_secret: false,
    }
}

fn persist_desired_state(path: &Path, desired: &HermesProviderDesiredState) -> Result<(), String> {
    let body = serde_json::to_vec_pretty(desired)
        .map_err(|error| format!("Unable to serialize Hermes desired state: {error}"))?;
    atomic_write(path, &body)?;
    tighten_file_permissions(path)
}

fn persist_workbench_binding(path: &Path, binding: &HermesWorkbenchBinding) -> Result<(), String> {
    let body = serde_json::to_vec_pretty(binding)
        .map_err(|error| format!("Unable to serialize Hermes workbench binding: {error}"))?;
    atomic_write(path, &body)?;
    tighten_file_permissions(path)
}

fn read_optional_file(path: &Path, label: &str) -> Result<Option<Vec<u8>>, String> {
    if !path.exists() {
        return Ok(None);
    }
    reject_symlink(path, label)?;
    if !path.is_file() {
        return Err(format!("{label} must be a regular file."));
    }
    fs::read(path)
        .map(Some)
        .map_err(|error| format!("Unable to read {label} {}: {error}", path.display()))
}

fn restore_optional_file(path: &Path, bytes: Option<&[u8]>, label: &str) -> Result<(), String> {
    match bytes {
        Some(bytes) => atomic_write(path, bytes),
        None if !path.exists() => Ok(()),
        None => {
            reject_symlink(path, label)?;
            if !path.is_file() {
                return Err(format!("{label} must be a regular file."));
            }
            fs::remove_file(path)
                .map_err(|error| format!("Unable to remove {label} {}: {error}", path.display()))
        }
    }
}

fn validate_mcp_binding(
    workbench: &WorkbenchHermesDesiredState,
    mcp_servers: &[HermesMcpServerDesiredState],
) -> Result<(), String> {
    let allowed_environment_refs: HashSet<_> = workbench.environment_refs.iter().collect();
    let mut desired_ids = workbench.mcp_server_ids.clone();
    desired_ids.sort();
    let mut resolved_ids = Vec::with_capacity(mcp_servers.len());
    for server in mcp_servers {
        server.validate()?;
        if server
            .environment
            .values()
            .any(|binding| !allowed_environment_refs.contains(&binding.reference))
        {
            return Err(
                "Hermes MCP binding requires an environment reference not granted by the workbench activation."
                    .into(),
            );
        }
        resolved_ids.push(server.id.clone());
    }
    resolved_ids.sort();
    resolved_ids.dedup();
    if resolved_ids.len() != mcp_servers.len() || resolved_ids != desired_ids {
        return Err(
            "Hermes MCP binding must resolve every activated MCP server exactly once.".into(),
        );
    }
    Ok(())
}

fn validate_unique_paths(paths: &[PathBuf]) -> Result<(), String> {
    let mut seen = HashSet::new();
    for path in paths {
        let normalized = path.to_string_lossy().replace('\\', "/");
        let normalized = if normalized.as_bytes().get(1) == Some(&b':') {
            normalized.to_ascii_lowercase()
        } else {
            normalized
        };
        if !seen.insert(normalized) {
            return Err("Hermes workbench skill roots must be unique.".into());
        }
    }
    Ok(())
}

fn validate_skill_roots_for_binding(paths: &[PathBuf]) -> Result<(), String> {
    for root in paths {
        reject_symlink(root, "skill root")?;
        if !root.is_dir() {
            return Err(format!(
                "Hermes workbench skill root does not exist or is not a directory: {}",
                root.display()
            ));
        }
        let mut stack = vec![(root.clone(), 0usize)];
        let mut entries = 0usize;
        let mut found_skill = false;
        while let Some((directory, depth)) = stack.pop() {
            if depth > MAX_SKILL_TREE_DEPTH {
                return Err("Hermes workbench skill tree exceeds the maximum depth.".into());
            }
            for entry in fs::read_dir(&directory).map_err(|error| {
                format!(
                    "Unable to inspect Hermes workbench skill directory {}: {error}",
                    directory.display()
                )
            })? {
                let entry = entry.map_err(|error| error.to_string())?;
                entries += 1;
                if entries > MAX_SKILL_TREE_ENTRIES {
                    return Err("Hermes workbench skill tree exceeds the bounded size.".into());
                }
                let path = entry.path();
                let file_type = entry.file_type().map_err(|error| error.to_string())?;
                if file_type.is_symlink() {
                    return Err(format!(
                        "Hermes workbench skill tree cannot contain symbolic links: {}",
                        path.display()
                    ));
                }
                if file_type.is_dir() {
                    stack.push((path, depth + 1));
                } else if file_type.is_file() && entry.file_name() == "SKILL.md" {
                    found_skill = true;
                }
            }
        }
        if !found_skill {
            return Err(format!(
                "Hermes workbench skill root contains no SKILL.md: {}",
                root.display()
            ));
        }
    }
    Ok(())
}

fn validate_project_root_for_binding(project_root: &Path) -> Result<(), String> {
    if !is_safe_absolute_path(project_root) || !project_root.is_dir() {
        return Err("Hermes workbench project root must be an existing directory.".into());
    }
    reject_symlink(project_root, "project root")
}

fn reject_symlink(path: &Path, label: &str) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|error| {
        format!(
            "Unable to inspect Hermes {label} {}: {error}",
            path.display()
        )
    })?;
    if metadata.file_type().is_symlink() {
        return Err(format!(
            "Hermes {label} cannot be a symbolic link: {}",
            path.display()
        ));
    }
    Ok(())
}

fn validate_managed_config_contents(content: &str) -> Result<(), String> {
    if !content.starts_with(MANAGED_HEADER) {
        return Err("missing BlackRain managed header".into());
    }
    if !content.contains(
        "\nagent:\n  disabled_toolsets:\n    - memory\n    - session_search\n    - cronjob\n",
    ) {
        return Err(
            "Hermes memory, session recall, and unattended cron toolsets must be disabled".into(),
        );
    }
    if !content.contains(
        "\nmemory:\n  memory_enabled: false\n  user_profile_enabled: false\n  provider: \"\"\n",
    ) {
        return Err("Hermes persistent memory must be disabled".into());
    }
    if !content.contains("\nmodel:\n") || !content.contains("\nproviders:\n") {
        return Err("missing model/providers sections".into());
    }
    if content.contains("provider: \"custom\"") || !content.contains("provider: \"custom:") {
        return Err("model provider must be a named custom provider".into());
    }
    if !content.contains("key_env: \"BLACKRAIN_HERMES_PROVIDER_API_KEY\"") {
        return Err("provider key_env is missing or unmanaged".into());
    }
    if content.contains("api_key:") {
        return Err("inline provider secrets are forbidden".into());
    }
    Ok(())
}

fn yaml_quote(value: &str) -> String {
    serde_json::to_string(value).expect("JSON string quoting cannot fail")
}

fn validate_provider_id(value: &str) -> Result<(), String> {
    if value.is_empty()
        || !value.chars().all(|character| {
            character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
        })
        || !value
            .chars()
            .next()
            .is_some_and(|character| character.is_ascii_lowercase() || character.is_ascii_digit())
    {
        return Err("Hermes provider id must use lowercase letters, digits, and hyphens.".into());
    }
    Ok(())
}

fn validate_http_url(value: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if !(trimmed.starts_with("http://") || trimmed.starts_with("https://"))
        || trimmed.chars().any(char::is_whitespace)
        || trimmed.contains('?')
        || trimmed.contains('#')
        || trimmed.contains('@')
    {
        return Err(
            "Hermes provider base_url must be an absolute HTTP(S) URL without credentials, query, or fragment."
                .into(),
        );
    }
    Ok(())
}

fn validate_env_key(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 128
        || !value.chars().all(|character| {
            character.is_ascii_uppercase() || character.is_ascii_digit() || character == '_'
        })
    {
        return Err(
            "Hermes environment key must use uppercase ASCII letters, digits, or underscore."
                .into(),
        );
    }
    Ok(())
}

fn validate_mcp_process_env_key(value: &str) -> Result<(), String> {
    const PREFIX: &str = "BLACKRAIN_MCP_SECRET_";
    let Some(suffix) = value.strip_prefix(PREFIX) else {
        return Err(
            "Hermes MCP process environment keys must use the App-managed namespace.".into(),
        );
    };
    if suffix.len() != 32
        || !suffix
            .chars()
            .all(|character| character.is_ascii_digit() || matches!(character, 'A'..='F'))
    {
        return Err(
            "Hermes MCP process environment keys must contain a 32-character uppercase hex suffix."
                .into(),
        );
    }
    Ok(())
}

fn validate_mcp_child_env_key(value: &str) -> Result<(), String> {
    const RESERVED: &[&str] = &[
        "APPDATA",
        "COMSPEC",
        "HOME",
        "LANG",
        "LOCALAPPDATA",
        "PATH",
        "PATHEXT",
        "SYSTEMROOT",
        "TEMP",
        "TMP",
        "USERPROFILE",
        "WINDIR",
        "CODEX_HOME",
        "HERMES_HOME",
    ];
    if RESERVED
        .iter()
        .any(|reserved| value.eq_ignore_ascii_case(reserved))
        || value
            .to_ascii_uppercase()
            .starts_with("BLACKRAIN_MCP_ROUTER_")
    {
        return Err("Hermes MCP child environment key is reserved by the managed runtime.".into());
    }
    Ok(())
}

fn validate_reference_id(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 256
        || value.chars().any(|character| {
            !(character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-' | ':'))
        })
    {
        return Err("Hermes environment reference id is invalid.".into());
    }
    Ok(())
}

fn validate_non_empty(label: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty() || value.chars().any(char::is_control) {
        return Err(format!(
            "Hermes {label} must be non-empty and contain no control characters."
        ));
    }
    Ok(())
}

fn validate_secret(label: &str, value: &str, min_length: usize) -> Result<(), String> {
    if value.len() < min_length || value.chars().any(char::is_control) {
        return Err(format!(
            "{label} is missing, too short, or contains control characters."
        ));
    }
    Ok(())
}

pub(crate) fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Invalid Hermes config path: {}", path.display()))?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temp = parent.join(format!(".blackrain-hermes-{}.tmp", Uuid::new_v4().simple()));
    fs::write(&temp, data).map_err(|error| format!("Unable to write Hermes temp file: {error}"))?;
    tighten_file_permissions(&temp)?;
    replace_file_atomic(&temp, path).map_err(|error| {
        let _ = fs::remove_file(&temp);
        format!("Unable to atomically replace {}: {error}", path.display())
    })
}

#[cfg(not(target_os = "windows"))]
fn replace_file_atomic(source: &Path, destination: &Path) -> std::io::Result<()> {
    fs::rename(source, destination)
}

#[cfg(target_os = "windows")]
fn replace_file_atomic(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    const MOVEFILE_REPLACE_EXISTING: u32 = 0x1;
    const MOVEFILE_WRITE_THROUGH: u32 = 0x8;
    #[link(name = "Kernel32")]
    extern "system" {
        fn MoveFileExW(existing: *const u16, replacement: *const u16, flags: u32) -> i32;
    }
    let source_wide = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let destination_wide = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    // SAFETY: both UTF-16 buffers are NUL-terminated and live for the duration of the call.
    let result = unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            destination_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if result == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(unix)]
pub(crate) fn tighten_file_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
        .map_err(|error| format!("Unable to restrict {} permissions: {error}", path.display()))
}

#[cfg(not(unix))]
pub(crate) fn tighten_file_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        render_config, validate_managed_config_contents, HermesConfigInspection,
        HermesConfigManager, HermesLaunchEnvironment, HermesMcpServerDesiredState, HermesPaths,
        HermesProviderDesiredState, WorkbenchHermesDesiredState, PROVIDER_API_KEY_ENV,
    };
    use std::collections::BTreeMap;
    use std::fs;
    use std::path::PathBuf;
    use uuid::Uuid;

    fn temp_root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "blackrain-hermes-config-{}",
            Uuid::new_v4().simple()
        ))
    }

    fn desired(model: &str) -> HermesProviderDesiredState {
        HermesProviderDesiredState::blackrain_new_api(
            "https://new-api.example.test/v1".into(),
            model.into(),
            Some(128_000),
        )
    }

    fn workbench(skill_root: PathBuf) -> WorkbenchHermesDesiredState {
        let project_root = skill_root
            .parent()
            .expect("fixture skill root has a parent")
            .to_path_buf();
        WorkbenchHermesDesiredState {
            workbench_id: "com.blackrain.office".into(),
            workbench_version: "0.1.0".into(),
            project_root,
            skill_roots: vec![skill_root],
            plugin_ids: vec!["com.blackrain.office-cli".into()],
            mcp_server_ids: Vec::new(),
            environment_refs: vec![super::HermesEnvironmentReference {
                kind: super::HermesEnvironmentReferenceKind::ProviderCredential,
                reference_id: "blackrain-new-api".into(),
            }],
            provider_secret_ref: Some(super::HermesSecretReference::ProviderCredential {
                provider_id: "blackrain-new-api".into(),
            }),
            permission_grant_id: "grant-office-demo".into(),
        }
    }

    fn mcp_server(command: PathBuf) -> HermesMcpServerDesiredState {
        HermesMcpServerDesiredState {
            id: "com.blackrain.office-files".into(),
            command,
            args: vec!["--stdio".into()],
            environment: BTreeMap::new(),
            timeout_seconds: 300,
            connect_timeout_seconds: 30,
            supports_parallel_tool_calls: false,
        }
    }

    fn absolute_test_path(components: &[&str]) -> PathBuf {
        let mut path = std::env::temp_dir();
        path.extend(components);
        path
    }

    #[test]
    fn renders_named_provider_without_inline_secrets() {
        let rendered = render_config(&desired("deepseek-chat")).unwrap();
        assert!(rendered.contains("provider: \"custom:blackrain-new-api\""));
        assert!(rendered.contains("providers:\n  blackrain-new-api:"));
        assert!(rendered.contains(&format!("key_env: \"{PROVIDER_API_KEY_ENV}\"")));
        assert!(rendered.contains("api_mode: \"chat_completions\""));
        assert!(!rendered.contains("api_key:"));
        assert!(!rendered.contains("provider: \"custom\""));
    }

    #[test]
    fn renders_cross_workbench_memory_and_session_recall_disabled() {
        let rendered = render_config(&desired("deepseek-chat")).unwrap();

        assert!(rendered.contains(
            "agent:\n  disabled_toolsets:\n    - memory\n    - session_search\n    - cronjob\n"
        ));
        assert!(rendered.contains(
            "memory:\n  memory_enabled: false\n  user_profile_enabled: false\n  provider: \"\"\n"
        ));
        validate_managed_config_contents(&rendered).unwrap();
    }

    #[test]
    fn renders_unattended_cron_disabled() {
        let rendered = render_config(&desired("deepseek-chat")).unwrap();

        assert!(rendered.contains("    - cronjob\n"));
        validate_managed_config_contents(&rendered).unwrap();
    }

    #[test]
    fn rendered_live_probe_config_matches_versioned_fixture() {
        let desired = HermesProviderDesiredState::blackrain_new_api(
            "http://127.0.0.1:18765/v1".into(),
            "blackrain-fixture".into(),
            Some(128_000),
        );
        let desired = HermesProviderDesiredState {
            provider_id: "blackrain-live-probe".into(),
            display_name: "BlackRain live probe".into(),
            discover_models: false,
            ..desired
        };

        assert_eq!(
            render_config(&desired).unwrap(),
            include_str!("../../../test-fixtures/hermes/v2026.7.7.2/blackrain-managed-config.yaml")
        );
    }

    #[test]
    fn rejects_bare_custom_provider_ids() {
        let mut state = desired("deepseek-chat");
        state.provider_id = "custom".into();
        assert!(state.validate().unwrap_err().contains("Bare custom"));
    }

    #[test]
    fn rejects_provider_key_env_outside_app_managed_namespace() {
        let mut state = desired("deepseek-chat");
        state.key_env = "USER_CONTROLLED_PROVIDER_KEY".into();
        assert!(state.validate().unwrap_err().contains(PROVIDER_API_KEY_ENV));
    }

    #[test]
    fn paths_are_isolated_under_app_data() {
        let root = absolute_test_path(&["app-data", "blackrain"]);
        let paths = HermesPaths::from_app_data_dir(&root);
        assert_eq!(paths.home, root.join("hermes-home"));
        assert_eq!(
            paths.desired_state,
            root.join("hermes-home/desired-state.v1.json")
        );
        assert!(!paths.home.ends_with(".hermes"));
    }

    #[test]
    fn apply_is_atomic_and_preserves_last_good_config() {
        let root = temp_root();
        let manager = HermesConfigManager::new(&root);
        manager.apply(&desired("deepseek-chat")).unwrap();
        assert_eq!(manager.load_desired_state().unwrap().model, "deepseek-chat");
        let first = fs::read_to_string(&manager.paths.config).unwrap();
        manager.apply(&desired("glm-5")).unwrap();
        let second = fs::read_to_string(&manager.paths.config).unwrap();
        let last_good = fs::read_to_string(&manager.paths.last_good_config).unwrap();
        assert!(first.contains("deepseek-chat"));
        assert!(second.contains("glm-5"));
        assert_eq!(last_good, first);
        let leftovers = fs::read_dir(&manager.paths.home)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().ends_with(".tmp"))
            .count();
        assert_eq!(leftovers, 0);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn binds_verified_skill_roots_as_external_dirs_and_preserves_them_on_provider_update() {
        let root = temp_root();
        let skill_root = root.join("installed-workbench").join("skills");
        fs::create_dir_all(skill_root.join("office-author")).unwrap();
        fs::write(
            skill_root.join("office-author").join("SKILL.md"),
            "---\nname: office-author\n---\n",
        )
        .unwrap();
        let manager = HermesConfigManager::new(&root);
        manager.apply(&desired("deepseek-chat")).unwrap();
        manager
            .bind_workbench(
                &desired("deepseek-chat"),
                &workbench(skill_root.clone()),
                &[],
                true,
            )
            .unwrap();

        let bound = fs::read_to_string(&manager.paths.config).unwrap();
        assert!(bound.contains("skills:\n  external_dirs:\n"));
        assert!(bound.contains(&serde_json::to_string(&skill_root.to_string_lossy()).unwrap()));
        assert!(manager.paths.workbench_desired_state.is_file());

        manager.apply(&desired("glm-5")).unwrap();
        let updated = fs::read_to_string(&manager.paths.config).unwrap();
        assert!(updated.contains("glm-5"));
        assert!(updated.contains(&serde_json::to_string(&skill_root.to_string_lossy()).unwrap()));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn persists_resolved_mcp_desired_state_but_renders_only_managed_router() {
        let root = temp_root();
        let skill_root = root.join("installed-workbench").join("skills");
        fs::create_dir_all(skill_root.join("office-author")).unwrap();
        fs::write(
            skill_root.join("office-author").join("SKILL.md"),
            "---\nname: office-author\n---\n",
        )
        .unwrap();
        let command = root.join("plugins").join("office-mcp");
        fs::create_dir_all(command.parent().unwrap()).unwrap();
        fs::write(&command, "fixture").unwrap();
        let mut workbench = workbench(skill_root);
        workbench.mcp_server_ids = vec!["com.blackrain.office-files".into()];
        workbench
            .environment_refs
            .push(super::HermesEnvironmentReference {
                kind: super::HermesEnvironmentReferenceKind::ManagedVariable,
                reference_id: "office-license".into(),
            });
        let mut server = mcp_server(command);
        server.environment.insert(
            "OFFICE_LICENSE".into(),
            super::HermesMcpEnvironmentBinding {
                process_env_key: "BLACKRAIN_MCP_SECRET_00112233445566778899AABBCCDDEEFF".into(),
                reference: super::HermesEnvironmentReference {
                    kind: super::HermesEnvironmentReferenceKind::ManagedVariable,
                    reference_id: "office-license".into(),
                },
            },
        );
        let mcp_servers = vec![server];
        let manager = HermesConfigManager::new(&root);
        manager.apply(&desired("deepseek-chat")).unwrap();

        let error = manager
            .bind_workbench(&desired("deepseek-chat"), &workbench, &mcp_servers, false)
            .unwrap_err();
        assert!(error.contains("while any WORK run is active"));

        let result = manager
            .bind_workbench(&desired("deepseek-chat"), &workbench, &mcp_servers, true)
            .unwrap();
        assert!(result.mcp_changed);
        assert!(result.process_environment_changed);
        assert_eq!(result.config_summary.model, "deepseek-chat");
        let base_rendered = fs::read_to_string(&manager.paths.config).unwrap();
        assert!(!base_rendered.contains("mcp_servers:\n"));
        manager
            .apply_router_config(
                &desired("deepseek-chat"),
                &super::HermesMcpRouterConfig {
                    url: "http://127.0.0.1:48123/mcp".into(),
                },
            )
            .unwrap();
        let rendered = fs::read_to_string(&manager.paths.config).unwrap();
        assert!(rendered.contains("mcp_servers:\n"));
        assert!(rendered.contains("blackrain-router:\n"));
        assert!(rendered.contains("url: \"http://127.0.0.1:48123/mcp\""));
        assert!(rendered.contains("Authorization: \"Bearer ${BLACKRAIN_MCP_ROUTER_BEARER}\""));
        assert!(!rendered.contains("com.blackrain.office-files"));
        assert!(!rendered.contains("    command:"));
        assert!(!rendered.contains("BLACKRAIN_MCP_SECRET_"));
        assert!(!rendered.contains("office-license-secret"));
        let persisted_binding = fs::read_to_string(&manager.paths.workbench_desired_state).unwrap();
        assert!(!persisted_binding.contains("office-license-secret"));
        let unchanged = manager
            .bind_workbench(&desired("deepseek-chat"), &workbench, &mcp_servers, false)
            .unwrap();
        assert!(!unchanged.mcp_changed);
        assert!(!unchanged.process_environment_changed);

        let mut different_project = workbench.clone();
        different_project.project_root = root.join("another-project");
        fs::create_dir_all(&different_project.project_root).unwrap();
        assert!(manager
            .bind_workbench(
                &desired("deepseek-chat"),
                &different_project,
                &mcp_servers,
                false,
            )
            .unwrap_err()
            .contains("while any WORK run is active"));
        let changed_project = manager
            .bind_workbench(
                &desired("deepseek-chat"),
                &different_project,
                &mcp_servers,
                true,
            )
            .unwrap();
        assert!(!changed_project.mcp_changed);
        assert!(changed_project.process_environment_changed);
        manager
            .rollback_workbench_binding(&changed_project.rollback)
            .unwrap();

        let mut different_environment_workbench = workbench.clone();
        different_environment_workbench.environment_refs[1].reference_id = "finance-license".into();
        let mut different_environment_servers = mcp_servers.clone();
        let environment = different_environment_servers[0]
            .environment
            .get_mut("OFFICE_LICENSE")
            .unwrap();
        environment.process_env_key =
            "BLACKRAIN_MCP_SECRET_FFEEDDCCBBAA99887766554433221100".into();
        environment.reference.reference_id = "finance-license".into();
        assert!(manager
            .bind_workbench(
                &desired("deepseek-chat"),
                &different_environment_workbench,
                &different_environment_servers,
                false,
            )
            .unwrap_err()
            .contains("while any WORK run is active"));

        let mut without_mcp = workbench.clone();
        without_mcp.mcp_server_ids.clear();
        let before_blocked_removal = fs::read_to_string(&manager.paths.config).unwrap();
        let error = manager
            .bind_workbench(&desired("deepseek-chat"), &without_mcp, &[], false)
            .unwrap_err();
        assert!(error.contains("while any WORK run is active"));
        assert_eq!(
            fs::read_to_string(&manager.paths.config).unwrap(),
            before_blocked_removal
        );

        let removed = manager
            .bind_workbench(&desired("deepseek-chat"), &without_mcp, &[], true)
            .unwrap();
        assert!(removed.mcp_changed);
        assert!(!removed.process_environment_changed);
        let removed_config = fs::read_to_string(&manager.paths.config).unwrap();
        assert!(removed_config.contains("blackrain-router:\n"));
        assert!(!removed_config.contains("com.blackrain.office-files"));

        manager
            .rollback_workbench_binding(&removed.rollback)
            .unwrap();
        let restored = fs::read_to_string(&manager.paths.config).unwrap();
        assert!(restored.contains("mcp_servers:\n"));
        assert!(restored.contains("blackrain-router:\n"));
        assert!(!restored.contains("com.blackrain.office-files"));

        let unbound = manager
            .unbind_workbench(&desired("deepseek-chat"), true)
            .unwrap();
        assert!(unbound.mcp_changed);
        assert!(unbound.process_environment_changed);
        let base_config = fs::read_to_string(&manager.paths.config).unwrap();
        assert!(!base_config.contains("skills:\n"));
        assert!(!base_config.contains("blackrain-router:\n"));
        assert!(!base_config.contains("com.blackrain.office-files"));
        assert!(!manager.paths.workbench_desired_state.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn loads_legacy_skills_only_binding_but_rejects_unresolved_legacy_mcp() {
        let root = temp_root();
        let skill_root = root.join("installed-workbench").join("skills");
        fs::create_dir_all(skill_root.join("office-author")).unwrap();
        fs::write(
            skill_root.join("office-author").join("SKILL.md"),
            "---\nname: office-author\n---\n",
        )
        .unwrap();
        let manager = HermesConfigManager::new(&root);
        manager.apply(&desired("deepseek-chat")).unwrap();
        let legacy = workbench(skill_root);
        let mut legacy_value = serde_json::to_value(&legacy).unwrap();
        legacy_value.as_object_mut().unwrap().remove("projectRoot");
        fs::write(
            &manager.paths.workbench_desired_state,
            serde_json::to_vec_pretty(&legacy_value).unwrap(),
        )
        .unwrap();

        manager.apply(&desired("glm-5")).unwrap();
        assert!(fs::read_to_string(&manager.paths.config)
            .unwrap()
            .contains("skills:\n"));
        let rebound = manager
            .bind_workbench(&desired("glm-5"), &legacy, &[], true)
            .unwrap();
        assert!(rebound.process_environment_changed);
        assert!(fs::read_to_string(&manager.paths.workbench_desired_state)
            .unwrap()
            .contains("projectRoot"));

        let mut unresolved = legacy;
        unresolved.mcp_server_ids = vec!["com.blackrain.office-files".into()];
        fs::write(
            &manager.paths.workbench_desired_state,
            serde_json::to_vec_pretty(&unresolved).unwrap(),
        )
        .unwrap();
        assert!(manager
            .apply(&desired("glm-5"))
            .unwrap_err()
            .contains("unresolved MCP servers"));
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinks_inside_a_bound_skill_tree() {
        use std::os::unix::fs::symlink;

        let root = temp_root();
        let skill_root = root.join("installed-workbench").join("skills");
        let outside = root.join("outside");
        fs::create_dir_all(skill_root.join("office-author")).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("SKILL.md"), "---\nname: escaped\n---\n").unwrap();
        symlink(&outside, skill_root.join("office-author").join("escaped")).unwrap();
        fs::write(
            skill_root.join("office-author").join("SKILL.md"),
            "---\nname: office-author\n---\n",
        )
        .unwrap();
        let manager = HermesConfigManager::new(&root);
        manager.apply(&desired("deepseek-chat")).unwrap();

        let error = manager
            .bind_workbench(&desired("deepseek-chat"), &workbench(skill_root), &[], true)
            .unwrap_err();
        assert!(error.contains("cannot contain symbolic links"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn corrupt_config_requires_explicit_repair_and_is_quarantined() {
        let root = temp_root();
        let manager = HermesConfigManager::new(&root);
        manager.apply(&desired("deepseek-chat")).unwrap();
        fs::write(&manager.paths.config, "provider: custom\napi_key: leaked\n").unwrap();
        let inspection = manager.inspect().unwrap();
        assert!(matches!(
            inspection,
            HermesConfigInspection::RepairRequired(_)
        ));
        assert!(manager.apply(&desired("glm-5")).is_err());
        let (_, quarantined) = manager.repair(&desired("glm-5")).unwrap();
        let quarantined = quarantined.expect("corrupt config quarantine");
        assert!(quarantined.is_file());
        assert!(fs::read_to_string(&manager.paths.config)
            .unwrap()
            .contains("glm-5"));
        assert!(manager.paths.last_good_config.is_file());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn launch_environment_is_loopback_only_and_redacted() {
        let paths = HermesPaths::from_app_data_dir(&absolute_test_path(&["app-data", "blackrain"]));
        let api_key = "a".repeat(64);
        let mcp_environment = BTreeMap::from([(
            "BLACKRAIN_MCP_SECRET_00112233445566778899AABBCCDDEEFF".into(),
            "office-license-secret".into(),
        )]);
        let environment = HermesLaunchEnvironment::build(
            &paths,
            None,
            8642,
            &api_key,
            "provider-secret",
            &mcp_environment,
            &[],
        )
        .unwrap();
        assert_eq!(environment.values()["API_SERVER_HOST"], "127.0.0.1");
        assert_eq!(environment.values()["API_SERVER_ENABLED"], "true");
        assert_eq!(environment.values()["CUA_DRIVER_RS_TELEMETRY_ENABLED"], "0");
        assert_eq!(
            environment.redacted_summary()["API_SERVER_KEY"],
            "<redacted>"
        );
        assert_eq!(
            environment.redacted_summary()[PROVIDER_API_KEY_ENV],
            "<redacted>"
        );
        assert_eq!(
            environment.redacted_summary()["BLACKRAIN_MCP_SECRET_00112233445566778899AABBCCDDEEFF"],
            "<redacted>"
        );
        assert!(!environment
            .redacted_summary()
            .values()
            .any(|value| value == &api_key));
    }

    #[test]
    fn launch_environment_limits_file_writes_to_the_verified_project() {
        let root = temp_root();
        let paths = HermesPaths::from_app_data_dir(&root);
        let project_root = root.join("verified-project");
        fs::create_dir_all(&project_root).unwrap();
        let environment = HermesLaunchEnvironment::build(
            &paths,
            Some(&project_root),
            8642,
            &"a".repeat(64),
            "provider-secret",
            &BTreeMap::new(),
            &[],
        )
        .unwrap();

        assert_eq!(
            environment.values()["HERMES_WRITE_SAFE_ROOT"],
            project_root.to_string_lossy()
        );
        assert_eq!(
            environment.redacted_summary()["HERMES_WRITE_SAFE_ROOT"],
            project_root.to_string_lossy()
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn launch_environment_rejects_weak_api_server_keys() {
        let paths = HermesPaths::from_app_data_dir(&absolute_test_path(&["app-data", "blackrain"]));
        let error = HermesLaunchEnvironment::build(
            &paths,
            None,
            8642,
            "short",
            "provider-secret",
            &BTreeMap::new(),
            &[],
        )
        .unwrap_err();
        assert!(error.contains("too short"));
    }

    #[test]
    fn rejects_noncanonical_mcp_process_environment_keys() {
        let paths = HermesPaths::from_app_data_dir(&absolute_test_path(&["app-data", "blackrain"]));
        for key in [
            "BLACKRAIN_MCP_SECRET_",
            "BLACKRAIN_MCP_SECRET_NOT_HEX_________________________",
            "BLACKRAIN_MCP_SECRET_00112233445566778899aabbccddeeff",
            "OTHER_SECRET_00112233445566778899AABBCCDDEEFF",
        ] {
            let error = HermesLaunchEnvironment::build(
                &paths,
                None,
                8642,
                &"a".repeat(64),
                "provider-secret",
                &BTreeMap::from([(key.into(), "secret".into())]),
                &[],
            )
            .unwrap_err();
            assert!(error.contains("MCP process environment keys"));
        }
    }

    #[test]
    fn plugin_binding_cannot_claim_the_core_router_bearer_key() {
        let mut server = mcp_server(absolute_test_path(&["managed", "plugin.exe"]));
        server.environment.insert(
            "PLUGIN_TOKEN".into(),
            super::HermesMcpEnvironmentBinding {
                process_env_key: super::MCP_ROUTER_BEARER_ENV.into(),
                reference: super::HermesEnvironmentReference {
                    kind: super::HermesEnvironmentReferenceKind::ManagedVariable,
                    reference_id: "plugin-token".into(),
                },
            },
        );
        assert!(server
            .validate()
            .unwrap_err()
            .contains("App-managed namespace"));
    }

    #[test]
    fn plugin_binding_cannot_override_managed_child_process_baseline() {
        let mut server = mcp_server(absolute_test_path(&["managed", "plugin.exe"]));
        server.environment.insert(
            "PATH".into(),
            super::HermesMcpEnvironmentBinding {
                process_env_key: "BLACKRAIN_MCP_SECRET_00112233445566778899AABBCCDDEEFF".into(),
                reference: super::HermesEnvironmentReference {
                    kind: super::HermesEnvironmentReferenceKind::ManagedVariable,
                    reference_id: "plugin-path".into(),
                },
            },
        );
        assert!(server.validate().unwrap_err().contains("reserved"));
    }

    #[test]
    fn launch_environment_prepends_only_core_resolved_system_tool_paths() {
        let paths = HermesPaths::from_app_data_dir(&absolute_test_path(&["app-data", "blackrain"]));
        let tool_root = absolute_test_path(&["app-data", "blackrain", "tools", "officecli"]);
        let environment = HermesLaunchEnvironment::build(
            &paths,
            None,
            8642,
            &"a".repeat(64),
            "provider-secret",
            &BTreeMap::new(),
            std::slice::from_ref(&tool_root),
        )
        .unwrap();
        let first = std::env::split_paths(std::ffi::OsStr::new(&environment.values()["PATH"]))
            .next()
            .unwrap();
        assert_eq!(first, tool_root);
        assert!(!environment.values().contains_key("BLACKRAIN_TOOL_PATH"));
    }

    #[test]
    fn workbench_desired_state_rejects_arbitrary_environment_fields() {
        let project_root = absolute_test_path(&["project"]);
        let skill_root = absolute_test_path(&["skills"]);
        let payload = serde_json::json!({
            "workbenchId": "office-agent",
            "workbenchVersion": "0.1.0",
            "projectRoot": project_root,
            "skillRoots": [skill_root],
            "pluginIds": ["office-cli"],
            "mcpServerIds": [],
            "providerSecretRef": {
                "kind": "providerCredential",
                "providerId": "blackrain-new-api"
            },
            "permissionGrantId": "grant-1",
            "environment": {"PATH": "/untrusted"}
        });
        assert!(serde_json::from_value::<WorkbenchHermesDesiredState>(payload).is_err());
    }

    #[test]
    fn workbench_desired_state_accepts_only_structured_secret_references() {
        let project_root = absolute_test_path(&["project"]);
        let skill_root = absolute_test_path(&["skills"]);
        let state: WorkbenchHermesDesiredState = serde_json::from_value(serde_json::json!({
            "workbenchId": "office-agent",
            "workbenchVersion": "0.1.0",
            "projectRoot": project_root,
            "skillRoots": [skill_root],
            "pluginIds": ["office-cli"],
            "mcpServerIds": [],
            "providerSecretRef": {
                "kind": "providerCredential",
                "providerId": "blackrain-new-api"
            },
            "permissionGrantId": "grant-1"
        }))
        .unwrap();
        state.validate().unwrap();
    }
}
