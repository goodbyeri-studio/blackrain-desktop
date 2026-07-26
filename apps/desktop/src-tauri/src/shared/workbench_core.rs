use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub(crate) mod lifecycle;
pub(crate) mod manifest;

pub(crate) const ACTIVATED_WORKBENCH_SCHEMA_VERSION: u32 = 1;
const ACTIVATION_STORE_SCHEMA_VERSION: u32 = 1;
const MAX_ACTIVATIONS: usize = 1024;

#[derive(Debug, Clone)]
pub(crate) struct ActivatedWorkbenchStore {
    root: PathBuf,
    path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ActivatedWorkbenchEnvelope {
    schema_version: u32,
    activations: Vec<ActivatedWorkbenchContext>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ActivatedProjectContext {
    pub(crate) project_id: String,
    pub(crate) path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ActivatedTaskContext {
    pub(crate) task_id: String,
    pub(crate) entry_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ActivatedComponentRef {
    pub(crate) id: String,
    pub(crate) version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ActivatedMcpServerRef {
    pub(crate) id: String,
    pub(crate) plugin_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ActivatedEnvironmentRefKind {
    ProviderCredential,
    ManagedVariable,
    SystemCapability,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ActivatedEnvironmentRef {
    pub(crate) kind: ActivatedEnvironmentRefKind,
    pub(crate) reference_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ActivatedFileAccess {
    ReadOnly,
    ReadWrite,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ActivatedFilePermission {
    pub(crate) path: String,
    pub(crate) access: ActivatedFileAccess,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ActivatedPermissionGrant {
    pub(crate) grant_id: String,
    pub(crate) files: Vec<ActivatedFilePermission>,
    #[serde(default)]
    pub(crate) network_domains: Vec<String>,
    #[serde(default)]
    pub(crate) process_ids: Vec<String>,
}

/// 只能由 Core 在工作台 install/verify/activate 成功后签发和持久化。
/// 本 contract 不携带 secret、任意环境值、MCP command 或 binary path。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ActivatedWorkbenchContext {
    pub(crate) schema_version: u32,
    pub(crate) activation_id: String,
    pub(crate) workbench_id: String,
    pub(crate) workbench_version: String,
    pub(crate) project: ActivatedProjectContext,
    pub(crate) task: Option<ActivatedTaskContext>,
    pub(crate) skill_roots: Vec<String>,
    #[serde(default)]
    pub(crate) plugins: Vec<ActivatedComponentRef>,
    #[serde(default)]
    pub(crate) mcp_servers: Vec<ActivatedMcpServerRef>,
    #[serde(default)]
    pub(crate) environment_refs: Vec<ActivatedEnvironmentRef>,
    pub(crate) permissions: ActivatedPermissionGrant,
    pub(crate) verified_at: f64,
}

impl ActivatedWorkbenchContext {
    pub(crate) fn validate(&self) -> Result<(), String> {
        if self.schema_version != ACTIVATED_WORKBENCH_SCHEMA_VERSION {
            return Err(format!(
                "Unsupported activated workbench schema version {}.",
                self.schema_version
            ));
        }
        validate_identifier("activation id", &self.activation_id)?;
        validate_identifier("workbench id", &self.workbench_id)?;
        validate_identifier("workbench version", &self.workbench_version)?;
        validate_identifier("project id", &self.project.project_id)?;
        validate_absolute_path("project path", &self.project.path)?;
        if let Some(task) = &self.task {
            validate_identifier("task id", &task.task_id)?;
            validate_identifier("task entry id", &task.entry_id)?;
        }
        if self.skill_roots.is_empty() {
            return Err("Activated workbench must contain at least one skill root.".into());
        }
        for path in &self.skill_roots {
            validate_absolute_path("skill root", path)?;
        }
        validate_unique_refs(
            "plugin",
            self.plugins.iter().map(|plugin| plugin.id.as_str()),
        )?;
        for plugin in &self.plugins {
            validate_identifier("plugin id", &plugin.id)?;
            validate_identifier("plugin version", &plugin.version)?;
        }
        validate_unique_refs(
            "MCP server",
            self.mcp_servers.iter().map(|server| server.id.as_str()),
        )?;
        let plugin_ids: HashSet<_> = self
            .plugins
            .iter()
            .map(|plugin| plugin.id.as_str())
            .collect();
        for server in &self.mcp_servers {
            validate_identifier("MCP server id", &server.id)?;
            validate_identifier("MCP plugin id", &server.plugin_id)?;
            if !plugin_ids.contains(server.plugin_id.as_str()) {
                return Err(format!(
                    "Activated MCP server {} references an inactive plugin {}.",
                    server.id, server.plugin_id
                ));
            }
        }
        let mut environment_ids = HashSet::new();
        let mut provider_credentials = 0usize;
        for reference in &self.environment_refs {
            validate_identifier("environment reference id", &reference.reference_id)?;
            let key = format!("{:?}:{}", reference.kind, reference.reference_id);
            if !environment_ids.insert(key) {
                return Err("Activated environment references must be unique.".into());
            }
            if reference.kind == ActivatedEnvironmentRefKind::ProviderCredential {
                provider_credentials += 1;
            }
        }
        if provider_credentials > 1 {
            return Err("An activation accepts at most one provider credential reference.".into());
        }
        self.permissions.validate(&self.project.path)?;
        if !self.verified_at.is_finite() || self.verified_at <= 0.0 {
            return Err("Activated workbench verifiedAt must be a positive timestamp.".into());
        }
        Ok(())
    }
}

impl ActivatedWorkbenchStore {
    pub(crate) fn new(app_data_dir: &Path) -> Self {
        let root = app_data_dir.join("workbenches");
        Self {
            path: root.join("activations.v1.json"),
            root,
        }
    }

    pub(crate) fn list(&self) -> Result<Vec<ActivatedWorkbenchContext>, String> {
        let mut activations = self.load()?.activations;
        activations.sort_by(|left, right| {
            right
                .verified_at
                .total_cmp(&left.verified_at)
                .then_with(|| left.activation_id.cmp(&right.activation_id))
        });
        Ok(activations)
    }

    pub(crate) fn read(&self, activation_id: &str) -> Result<ActivatedWorkbenchContext, String> {
        validate_identifier("activation id", activation_id)?;
        self.load()?
            .activations
            .into_iter()
            .find(|context| context.activation_id == activation_id)
            .ok_or_else(|| format!("Activated workbench {activation_id} was not found."))
    }

    /// 仅供未来 008 install/verify pipeline 调用；不得暴露为普通前端命令。
    pub(crate) fn persist_verified(
        &self,
        context: ActivatedWorkbenchContext,
    ) -> Result<ActivatedWorkbenchContext, String> {
        context.validate()?;
        let mut envelope = self.load()?;
        if let Some(existing) = envelope
            .activations
            .iter_mut()
            .find(|entry| entry.activation_id == context.activation_id)
        {
            let mut comparable = existing.clone();
            comparable.verified_at = context.verified_at;
            if comparable != context {
                return Err(
                    "Activated workbench ids are immutable; issue a new activation id for changed resources."
                        .into(),
                );
            }
            *existing = context.clone();
        } else {
            if envelope.activations.len() >= MAX_ACTIVATIONS {
                return Err("Activated workbench store reached its bounded capacity.".into());
            }
            envelope.activations.push(context.clone());
        }
        self.persist(&envelope)?;
        Ok(context)
    }

    /// 仅供 Core 生命周期命令在受控任务和引擎资源已收敛后调用。
    pub(crate) fn deactivate_verified(
        &self,
        activation_id: &str,
    ) -> Result<ActivatedWorkbenchContext, String> {
        validate_identifier("activation id", activation_id)?;
        let mut envelope = self.load()?;
        let index = envelope
            .activations
            .iter()
            .position(|context| context.activation_id == activation_id)
            .ok_or_else(|| format!("Activated workbench {activation_id} was not found."))?;
        let context = envelope.activations.remove(index);
        self.persist(&envelope)?;
        Ok(context)
    }

    fn load(&self) -> Result<ActivatedWorkbenchEnvelope, String> {
        self.ensure_root()?;
        if !self.path.exists() {
            return Ok(ActivatedWorkbenchEnvelope {
                schema_version: ACTIVATION_STORE_SCHEMA_VERSION,
                activations: Vec::new(),
            });
        }
        reject_symlink(&self.path)?;
        let bytes = fs::read(&self.path).map_err(|error| {
            format!(
                "Unable to read activated workbench store {}: {error}",
                self.path.display()
            )
        })?;
        let envelope: ActivatedWorkbenchEnvelope = serde_json::from_slice(&bytes)
            .map_err(|error| format!("Activated workbench store is invalid: {error}"))?;
        if envelope.schema_version != ACTIVATION_STORE_SCHEMA_VERSION {
            return Err(format!(
                "Unsupported activated workbench store schema version {}.",
                envelope.schema_version
            ));
        }
        if envelope.activations.len() > MAX_ACTIVATIONS {
            return Err("Activated workbench store exceeds its bounded capacity.".into());
        }
        let mut ids = HashSet::new();
        for context in &envelope.activations {
            context.validate()?;
            if !ids.insert(context.activation_id.as_str()) {
                return Err("Activated workbench store contains duplicate activation ids.".into());
            }
        }
        Ok(envelope)
    }

    fn persist(&self, envelope: &ActivatedWorkbenchEnvelope) -> Result<(), String> {
        self.ensure_root()?;
        let bytes = serde_json::to_vec_pretty(envelope)
            .map_err(|error| format!("Unable to serialize activated workbench store: {error}"))?;
        atomic_write(&self.path, &bytes)
    }

    fn ensure_root(&self) -> Result<(), String> {
        if self.root.exists() {
            reject_symlink(&self.root)?;
        }
        fs::create_dir_all(&self.root).map_err(|error| {
            format!(
                "Unable to create activated workbench store {}: {error}",
                self.root.display()
            )
        })?;
        reject_symlink(&self.root)
    }
}

impl ActivatedPermissionGrant {
    fn validate(&self, project_path: &str) -> Result<(), String> {
        validate_identifier("permission grant id", &self.grant_id)?;
        if self.files.is_empty() {
            return Err("Activated permission grant must contain a file root.".into());
        }
        let mut covers_project = false;
        let mut file_roots = HashSet::new();
        for file in &self.files {
            validate_absolute_path("permission file root", &file.path)?;
            let normalized = normalize_path(&file.path);
            if !file_roots.insert(normalized.clone()) {
                return Err("Activated permission file roots must be unique.".into());
            }
            covers_project |= path_contains(&file.path, project_path);
        }
        if !covers_project {
            return Err("Activated permission grant does not cover the project path.".into());
        }
        validate_unique_refs("process", self.process_ids.iter().map(String::as_str))?;
        for process_id in &self.process_ids {
            validate_identifier("process id", process_id)?;
        }
        validate_unique_refs(
            "network domain",
            self.network_domains.iter().map(String::as_str),
        )?;
        for domain in &self.network_domains {
            if domain.is_empty()
                || domain.len() > 253
                || domain.chars().any(char::is_whitespace)
                || domain.contains('/')
                || domain.contains(':')
            {
                return Err(format!("Invalid activated network domain {domain}."));
            }
        }
        Ok(())
    }
}

fn validate_identifier(label: &str, value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 256
        || value.chars().any(|character| {
            !(character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-' | ':'))
        })
    {
        return Err(format!("Invalid activated workbench {label}."));
    }
    Ok(())
}

fn validate_unique_refs<'a>(
    label: &str,
    values: impl Iterator<Item = &'a str>,
) -> Result<(), String> {
    let mut seen = HashSet::new();
    for value in values {
        if !seen.insert(value) {
            return Err(format!("Activated {label} references must be unique."));
        }
    }
    Ok(())
}

fn validate_absolute_path(label: &str, value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.contains('\0')
        || value.chars().any(char::is_control)
        || !is_portable_absolute_path(value)
        || value.split(['/', '\\']).any(|segment| segment == "..")
    {
        return Err(format!("Activated {label} must be an absolute safe path."));
    }
    Ok(())
}

fn is_portable_absolute_path(value: &str) -> bool {
    value.starts_with('/')
        || value.starts_with("\\\\")
        || (value.len() >= 3
            && value.as_bytes()[0].is_ascii_alphabetic()
            && value.as_bytes()[1] == b':'
            && matches!(value.as_bytes()[2], b'\\' | b'/'))
}

fn normalize_path(value: &str) -> String {
    let normalized = value.replace('\\', "/").trim_end_matches('/').to_string();
    if normalized.as_bytes().get(1) == Some(&b':') {
        normalized.to_ascii_lowercase()
    } else {
        normalized
    }
}

fn path_contains(root: &str, candidate: &str) -> bool {
    let root = normalize_path(root);
    let candidate = normalize_path(candidate);
    candidate == root || candidate.starts_with(&format!("{root}/"))
}

pub(crate) fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Invalid workbench data path: {}", path.display()))?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temp = parent.join(format!(
        ".blackrain-workbench-{}.tmp",
        uuid::Uuid::new_v4().simple()
    ));
    fs::write(&temp, data)
        .map_err(|error| format!("Unable to write workbench temp file: {error}"))?;
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

fn reject_symlink(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() {
        return Err(format!(
            "Activated workbench path cannot be a symlink: {}",
            path.display()
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use super::{
        ActivatedWorkbenchContext, ActivatedWorkbenchStore, ACTIVATED_WORKBENCH_SCHEMA_VERSION,
    };

    fn temp_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "blackrain-workbench-activation-{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn fixture() -> ActivatedWorkbenchContext {
        serde_json::from_str(include_str!(
            "../../test-fixtures/workbench/v1/activated-workbench-context.json"
        ))
        .unwrap()
    }

    #[test]
    fn accepts_shared_activated_workbench_fixture() {
        let context = fixture();
        assert_eq!(context.schema_version, ACTIVATED_WORKBENCH_SCHEMA_VERSION);
        context.validate().unwrap();
        assert_eq!(context.workbench_id, "com.blackrain.office");
        assert_eq!(context.plugins[0].id, "com.blackrain.office-cli");
    }

    #[test]
    fn rejects_paths_permissions_and_mcp_refs_outside_activation() {
        let mut context = fixture();
        context.project.path = r"C:\Users\demo\Outside".into();
        assert!(context.validate().unwrap_err().contains("does not cover"));

        let mut context = fixture();
        context.skill_roots[0] = r"..\skills".into();
        assert!(context
            .validate()
            .unwrap_err()
            .contains("absolute safe path"));

        let mut context = fixture();
        context.mcp_servers[0].plugin_id = "com.blackrain.not-active".into();
        assert!(context.validate().unwrap_err().contains("inactive plugin"));
    }

    #[test]
    fn rejects_unknown_fields_and_multiple_provider_credentials() {
        let mut payload: serde_json::Value = serde_json::from_str(include_str!(
            "../../test-fixtures/workbench/v1/activated-workbench-context.json"
        ))
        .unwrap();
        payload["rawEnv"] = serde_json::json!({ "API_KEY": "secret" });
        assert!(serde_json::from_value::<ActivatedWorkbenchContext>(payload).is_err());

        let mut context = fixture();
        let mut second_provider = context.environment_refs[0].clone();
        second_provider.reference_id = "glm".into();
        context.environment_refs.push(second_provider);
        assert!(context
            .validate()
            .unwrap_err()
            .contains("at most one provider credential"));
    }

    #[test]
    fn persists_reads_and_replaces_verified_activations_atomically() {
        let root = temp_root();
        let store = ActivatedWorkbenchStore::new(&root);
        let context = fixture();
        store.persist_verified(context.clone()).unwrap();
        assert_eq!(store.list().unwrap(), vec![context.clone()]);
        assert_eq!(store.read(&context.activation_id).unwrap(), context);

        let mut replacement = fixture();
        replacement.verified_at += 1.0;
        store.persist_verified(replacement.clone()).unwrap();
        assert_eq!(store.list().unwrap(), vec![replacement]);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn deactivates_only_the_activation_record_and_preserves_the_user_project() {
        let root = temp_root();
        let store = ActivatedWorkbenchStore::new(&root);
        let mut context = fixture();
        let project = root.join("user-project");
        fs::create_dir_all(&project).unwrap();
        fs::write(project.join("report.docx"), "user asset").unwrap();
        context.project.path = project.to_string_lossy().to_string();
        context.permissions.files[0].path = context.project.path.clone();
        store.persist_verified(context.clone()).unwrap();

        assert_eq!(
            store.deactivate_verified(&context.activation_id).unwrap(),
            context
        );
        assert!(store.list().unwrap().is_empty());
        assert_eq!(
            fs::read_to_string(project.join("report.docx")).unwrap(),
            "user asset"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn refuses_to_reuse_an_activation_id_for_changed_resources() {
        let root = temp_root();
        let store = ActivatedWorkbenchStore::new(&root);
        let context = fixture();
        store.persist_verified(context.clone()).unwrap();

        let mut changed = context;
        changed.skill_roots = vec![r"C:\ProgramData\BlackRain\other-skills".into()];
        let error = store.persist_verified(changed).unwrap_err();
        assert!(error.contains("ids are immutable"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_duplicate_activation_ids_from_persisted_state() {
        let root = temp_root();
        let store = ActivatedWorkbenchStore::new(&root);
        fs::create_dir_all(root.join("workbenches")).unwrap();
        let context = fixture();
        fs::write(
            &store.path,
            serde_json::to_vec(&serde_json::json!({
                "schemaVersion": 1,
                "activations": [context.clone(), context],
            }))
            .unwrap(),
        )
        .unwrap();

        assert!(store
            .list()
            .unwrap_err()
            .contains("duplicate activation ids"));
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_symlinked_activation_store_root() {
        use std::os::unix::fs::symlink;

        let root = temp_root();
        let redirected = temp_root();
        symlink(&redirected, root.join("workbenches")).unwrap();
        let store = ActivatedWorkbenchStore::new(&root);

        assert!(store.list().unwrap_err().contains("cannot be a symlink"));
        fs::remove_file(root.join("workbenches")).unwrap();
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(redirected).unwrap();
    }
}
