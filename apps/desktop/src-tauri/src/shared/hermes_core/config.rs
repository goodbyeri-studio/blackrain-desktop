use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

const MANAGED_HEADER: &str = "# BlackRain managed Hermes config v1";
const MAX_SKILL_TREE_ENTRIES: usize = 50_000;
const MAX_SKILL_TREE_DEPTH: usize = 32;
pub(crate) const PROVIDER_API_KEY_ENV: &str = "BLACKRAIN_HERMES_PROVIDER_API_KEY";

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
    pub(crate) skill_roots: Vec<PathBuf>,
    pub(crate) plugin_ids: Vec<String>,
    pub(crate) mcp_server_ids: Vec<String>,
    pub(crate) provider_secret_ref: Option<HermesSecretReference>,
    pub(crate) permission_grant_id: String,
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
        validate_unique_paths(&self.skill_roots)?;
        Ok(())
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
        let workbench = self.load_workbench_desired_state()?;
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
        let rendered = render_config_with_workbench(desired, workbench.as_ref())?;
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
    ) -> Result<HermesConfigSummary, String> {
        provider.validate()?;
        workbench.validate()?;
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
        if let HermesConfigInspection::RepairRequired(plan) = self.inspect()? {
            return Err(format!(
                "Hermes config requires repair before binding a workbench: {} ({})",
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
        persist_workbench_desired_state(&self.paths.workbench_desired_state, workbench)?;
        persist_desired_state(&self.paths.desired_state, provider)?;
        let rendered = render_config_with_workbench(provider, Some(workbench))?;
        atomic_write(&self.paths.config, rendered.as_bytes())?;
        if !self.paths.last_good_config.exists() {
            atomic_write(&self.paths.last_good_config, rendered.as_bytes())?;
        }
        tighten_file_permissions(&self.paths.config)?;
        Ok(summary(provider))
    }

    pub(crate) fn repair(
        &self,
        desired: &HermesProviderDesiredState,
    ) -> Result<(HermesConfigSummary, Option<PathBuf>), String> {
        desired.validate()?;
        let workbench = self.load_workbench_desired_state()?;
        fs::create_dir_all(&self.paths.home).map_err(|error| error.to_string())?;
        let rendered = render_config_with_workbench(desired, workbench.as_ref())?;
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
        let desired = serde_json::from_slice::<WorkbenchHermesDesiredState>(&bytes)
            .map_err(|error| format!("Hermes workbench desired state is invalid: {error}"))?;
        desired.validate()?;
        validate_skill_roots_for_binding(&desired.skill_roots)?;
        Ok(Some(desired))
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
        api_port: u16,
        api_server_key: &str,
        provider_api_key: &str,
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
        Ok(Self { values })
    }

    pub(crate) fn values(&self) -> &BTreeMap<String, String> {
        &self.values
    }

    pub(crate) fn redacted_summary(&self) -> BTreeMap<String, String> {
        self.values
            .iter()
            .map(|(key, value)| {
                let safe = if key == "API_SERVER_KEY" || key == PROVIDER_API_KEY_ENV {
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
    desired.validate()?;
    if let Some(workbench) = workbench {
        workbench.validate()?;
    }
    let provider_identity = format!("custom:{}", desired.provider_id);
    let mut output = format!(
        "{MANAGED_HEADER}\nmodel:\n  default: {}\n  provider: {}\nproviders:\n  {}:\n    name: {}\n    base_url: {}\n    key_env: {}\n    api_mode: \"chat_completions\"\n    default_model: {}\n    discover_models: {}\n",
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
    if let Some(workbench) = workbench {
        output.push_str("skills:\n  external_dirs:\n");
        for root in &workbench.skill_roots {
            output.push_str(&format!("    - {}\n", yaml_quote(&root.to_string_lossy())));
        }
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

fn persist_workbench_desired_state(
    path: &Path,
    desired: &WorkbenchHermesDesiredState,
) -> Result<(), String> {
    let body = serde_json::to_vec_pretty(desired)
        .map_err(|error| format!("Unable to serialize Hermes workbench desired state: {error}"))?;
    atomic_write(path, &body)?;
    tighten_file_permissions(path)
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
        || !value.chars().all(|character| {
            character.is_ascii_uppercase() || character.is_ascii_digit() || character == '_'
        })
    {
        return Err("Hermes provider key_env must be an uppercase environment key.".into());
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
        render_config, HermesConfigInspection, HermesConfigManager, HermesLaunchEnvironment,
        HermesPaths, HermesProviderDesiredState, WorkbenchHermesDesiredState, PROVIDER_API_KEY_ENV,
    };
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
        WorkbenchHermesDesiredState {
            workbench_id: "com.blackrain.office".into(),
            workbench_version: "0.1.0".into(),
            skill_roots: vec![skill_root],
            plugin_ids: vec!["com.blackrain.office-cli".into()],
            mcp_server_ids: Vec::new(),
            provider_secret_ref: Some(super::HermesSecretReference::ProviderCredential {
                provider_id: "blackrain-new-api".into(),
            }),
            permission_grant_id: "grant-office-demo".into(),
        }
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
        let root = PathBuf::from("/app-data/blackrain");
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
            .bind_workbench(&desired("deepseek-chat"), &workbench(skill_root.clone()))
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
            .bind_workbench(&desired("deepseek-chat"), &workbench(skill_root))
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
        let paths = HermesPaths::from_app_data_dir(&PathBuf::from("/app-data/blackrain"));
        let api_key = "a".repeat(64);
        let environment =
            HermesLaunchEnvironment::build(&paths, 8642, &api_key, "provider-secret").unwrap();
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
        assert!(!environment
            .redacted_summary()
            .values()
            .any(|value| value == &api_key));
    }

    #[test]
    fn launch_environment_rejects_weak_api_server_keys() {
        let paths = HermesPaths::from_app_data_dir(&PathBuf::from("/app-data/blackrain"));
        let error =
            HermesLaunchEnvironment::build(&paths, 8642, "short", "provider-secret").unwrap_err();
        assert!(error.contains("too short"));
    }

    #[test]
    fn workbench_desired_state_rejects_arbitrary_environment_fields() {
        let payload = serde_json::json!({
            "workbenchId": "office-agent",
            "workbenchVersion": "0.1.0",
            "skillRoots": ["/tmp/skills"],
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
        let state: WorkbenchHermesDesiredState = serde_json::from_value(serde_json::json!({
            "workbenchId": "office-agent",
            "workbenchVersion": "0.1.0",
            "skillRoots": ["/tmp/skills"],
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
