use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::shared::hermes_core::config::{
    atomic_write, HermesEnvironmentReference, HermesEnvironmentReferenceKind,
    HermesMcpEnvironmentBinding, HermesMcpServerDesiredState,
};
use crate::shared::workbench_core::{
    ActivatedComponentRef, ActivatedEnvironmentRef, ActivatedEnvironmentRefKind,
    ActivatedMcpServerRef,
};

pub(crate) const VERIFIED_PLUGIN_RUNTIME_SCHEMA_VERSION: u32 = 1;
const PLUGIN_RUNTIME_STORE_SCHEMA_VERSION: u32 = 1;
const MAX_PLUGIN_RUNTIMES: usize = 1024;
const MAX_MCP_SERVERS_PER_PLUGIN: usize = 32;
const MAX_MCP_ARGS: usize = 128;

#[derive(Debug, Clone)]
pub(crate) struct VerifiedPluginRuntimeStore {
    managed_root: PathBuf,
    state_root: PathBuf,
    path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct VerifiedPluginRuntimeEnvelope {
    schema_version: u32,
    runtimes: Vec<VerifiedPluginRuntime>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum VerifiedMcpTransport {
    Stdio,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct VerifiedMcpServerRuntime {
    pub(crate) id: String,
    pub(crate) transport: VerifiedMcpTransport,
    pub(crate) command: String,
    #[serde(default)]
    pub(crate) args: Vec<String>,
    #[serde(default)]
    pub(crate) environment: BTreeMap<String, VerifiedMcpEnvironmentReference>,
    #[serde(
        default,
        rename = "environmentRefs",
        skip_serializing_if = "Vec::is_empty"
    )]
    legacy_environment_refs: Vec<String>,
    pub(crate) timeout_seconds: u64,
    pub(crate) connect_timeout_seconds: u64,
    #[serde(default)]
    pub(crate) supports_parallel_tool_calls: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct VerifiedMcpEnvironmentReference {
    pub(crate) kind: ActivatedEnvironmentRefKind,
    pub(crate) reference_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct VerifiedPluginRuntime {
    pub(crate) schema_version: u32,
    pub(crate) plugin_id: String,
    pub(crate) plugin_version: String,
    pub(crate) install_root: String,
    #[serde(default)]
    pub(crate) mcp_servers: Vec<VerifiedMcpServerRuntime>,
    pub(crate) verified_at: f64,
}

impl VerifiedPluginRuntimeStore {
    pub(crate) fn new(app_data_dir: &Path) -> Self {
        let plugins_root = app_data_dir.join("plugins");
        Self {
            managed_root: plugins_root.join("installed"),
            state_root: plugins_root.clone(),
            path: plugins_root.join("runtimes.v1.json"),
        }
    }

    pub(crate) fn read(
        &self,
        plugin_id: &str,
        plugin_version: &str,
    ) -> Result<VerifiedPluginRuntime, String> {
        validate_identifier("plugin id", plugin_id)?;
        validate_identifier("plugin version", plugin_version)?;
        self.load()?
            .runtimes
            .into_iter()
            .find(|runtime| {
                runtime.plugin_id == plugin_id && runtime.plugin_version == plugin_version
            })
            .ok_or_else(|| {
                format!("Verified plugin runtime {plugin_id}@{plugin_version} was not found.")
            })
    }

    /// 仅供 008 install/verify pipeline；不得暴露成普通前端写命令。
    pub(crate) fn persist_verified(
        &self,
        runtime: VerifiedPluginRuntime,
    ) -> Result<VerifiedPluginRuntime, String> {
        runtime.validate(&self.managed_root, true)?;
        let mut envelope = self.load()?;
        if let Some(existing) = envelope.runtimes.iter_mut().find(|entry| {
            entry.plugin_id == runtime.plugin_id && entry.plugin_version == runtime.plugin_version
        }) {
            let mut comparable = existing.clone();
            comparable.verified_at = runtime.verified_at;
            if comparable != runtime {
                return Err(
                    "Verified plugin runtime identity is immutable; publish a new plugin version for changed resources."
                        .into(),
                );
            }
            *existing = runtime.clone();
        } else {
            if envelope.runtimes.len() >= MAX_PLUGIN_RUNTIMES {
                return Err("Verified plugin runtime store reached its bounded capacity.".into());
            }
            envelope.runtimes.push(runtime.clone());
        }
        envelope.runtimes.sort_by(|left, right| {
            left.plugin_id
                .cmp(&right.plugin_id)
                .then_with(|| left.plugin_version.cmp(&right.plugin_version))
        });
        self.persist(&envelope)?;
        Ok(runtime)
    }

    pub(crate) fn resolve_mcp_servers(
        &self,
        plugins: &[ActivatedComponentRef],
        mcp_servers: &[ActivatedMcpServerRef],
        environment_refs: &[ActivatedEnvironmentRef],
    ) -> Result<Vec<HermesMcpServerDesiredState>, String> {
        let allowed_environment_refs: HashSet<_> = environment_refs
            .iter()
            .map(|reference| (reference.kind, reference.reference_id.as_str()))
            .collect();
        let mut resolved = Vec::with_capacity(mcp_servers.len());
        for reference in mcp_servers {
            let plugin = plugins
                .iter()
                .find(|plugin| plugin.id == reference.plugin_id)
                .ok_or_else(|| {
                    format!(
                        "Activated MCP server {} references an inactive plugin {}.",
                        reference.id, reference.plugin_id
                    )
                })?;
            let runtime = self.read(&plugin.id, &plugin.version)?;
            runtime.validate(&self.managed_root, true)?;
            let server = runtime
                .mcp_servers
                .into_iter()
                .find(|server| server.id == reference.id)
                .ok_or_else(|| {
                    format!(
                        "Verified plugin {}@{} does not provide MCP server {}.",
                        plugin.id, plugin.version, reference.id
                    )
                })?;
            let mut environment = BTreeMap::new();
            for (child_env_key, environment_ref) in server.environment {
                if !allowed_environment_refs
                    .contains(&(environment_ref.kind, environment_ref.reference_id.as_str()))
                {
                    return Err(format!(
                        "MCP server {} requires an environment reference that was not granted by the activation.",
                        server.id
                    ));
                }
                if environment_ref.kind == ActivatedEnvironmentRefKind::SystemCapability {
                    return Err(format!(
                        "MCP server {} cannot inject a system capability as an environment value.",
                        server.id
                    ));
                }
                environment.insert(
                    child_env_key.clone(),
                    HermesMcpEnvironmentBinding {
                        process_env_key: mcp_process_env_key(
                            &server.id,
                            &child_env_key,
                            &environment_ref,
                        ),
                        reference: HermesEnvironmentReference {
                            kind: match environment_ref.kind {
                                ActivatedEnvironmentRefKind::ProviderCredential => {
                                    HermesEnvironmentReferenceKind::ProviderCredential
                                }
                                ActivatedEnvironmentRefKind::ManagedVariable => {
                                    HermesEnvironmentReferenceKind::ManagedVariable
                                }
                                ActivatedEnvironmentRefKind::SystemCapability => unreachable!(),
                            },
                            reference_id: environment_ref.reference_id,
                        },
                    },
                );
            }
            resolved.push(HermesMcpServerDesiredState {
                id: server.id,
                command: PathBuf::from(server.command),
                args: server.args,
                environment,
                timeout_seconds: server.timeout_seconds,
                connect_timeout_seconds: server.connect_timeout_seconds,
                supports_parallel_tool_calls: server.supports_parallel_tool_calls,
            });
        }
        resolved.sort_by(|left, right| left.id.cmp(&right.id));
        Ok(resolved)
    }

    fn load(&self) -> Result<VerifiedPluginRuntimeEnvelope, String> {
        self.ensure_state_root()?;
        if !self.path.exists() {
            return Ok(VerifiedPluginRuntimeEnvelope {
                schema_version: PLUGIN_RUNTIME_STORE_SCHEMA_VERSION,
                runtimes: Vec::new(),
            });
        }
        reject_symlink(&self.path, "plugin runtime store")?;
        let bytes = fs::read(&self.path).map_err(|error| {
            format!(
                "Unable to read verified plugin runtime store {}: {error}",
                self.path.display()
            )
        })?;
        let envelope: VerifiedPluginRuntimeEnvelope = serde_json::from_slice(&bytes)
            .map_err(|error| format!("Verified plugin runtime store is invalid: {error}"))?;
        if envelope.schema_version != PLUGIN_RUNTIME_STORE_SCHEMA_VERSION {
            return Err(format!(
                "Unsupported verified plugin runtime store schema version {}.",
                envelope.schema_version
            ));
        }
        if envelope.runtimes.len() > MAX_PLUGIN_RUNTIMES {
            return Err("Verified plugin runtime store exceeds its bounded capacity.".into());
        }
        let mut identities = HashSet::new();
        for runtime in &envelope.runtimes {
            runtime.validate(&self.managed_root, false)?;
            if !identities.insert((runtime.plugin_id.as_str(), runtime.plugin_version.as_str())) {
                return Err("Verified plugin runtime store contains duplicate identities.".into());
            }
        }
        Ok(envelope)
    }

    fn persist(&self, envelope: &VerifiedPluginRuntimeEnvelope) -> Result<(), String> {
        self.ensure_state_root()?;
        let bytes = serde_json::to_vec_pretty(envelope)
            .map_err(|error| format!("Unable to serialize plugin runtime store: {error}"))?;
        atomic_write(&self.path, &bytes)
    }

    fn ensure_state_root(&self) -> Result<(), String> {
        if self.state_root.exists() {
            reject_symlink(&self.state_root, "plugin state root")?;
        }
        fs::create_dir_all(&self.state_root).map_err(|error| {
            format!(
                "Unable to create plugin state root {}: {error}",
                self.state_root.display()
            )
        })?;
        reject_symlink(&self.state_root, "plugin state root")
    }
}

impl VerifiedPluginRuntime {
    fn validate(&self, managed_root: &Path, require_files: bool) -> Result<(), String> {
        if self.schema_version != VERIFIED_PLUGIN_RUNTIME_SCHEMA_VERSION {
            return Err(format!(
                "Unsupported verified plugin runtime schema version {}.",
                self.schema_version
            ));
        }
        validate_identifier("plugin id", &self.plugin_id)?;
        validate_identifier("plugin version", &self.plugin_version)?;
        validate_managed_path("plugin install root", managed_root, &self.install_root)?;
        if self.mcp_servers.len() > MAX_MCP_SERVERS_PER_PLUGIN {
            return Err("Verified plugin contains too many MCP servers.".into());
        }
        let mut server_ids = HashSet::new();
        for server in &self.mcp_servers {
            if !server_ids.insert(server.id.as_str()) {
                return Err("Verified plugin MCP server ids must be unique.".into());
            }
            server.validate(managed_root, &self.install_root, require_files)?;
        }
        if !self.verified_at.is_finite() || self.verified_at <= 0.0 {
            return Err("Verified plugin runtime verifiedAt must be a positive timestamp.".into());
        }
        Ok(())
    }
}

impl VerifiedMcpServerRuntime {
    fn validate(
        &self,
        managed_root: &Path,
        install_root: &str,
        require_files: bool,
    ) -> Result<(), String> {
        validate_identifier("MCP server id", &self.id)?;
        validate_managed_path("MCP command", managed_root, &self.command)?;
        if !path_contains(install_root, &self.command) {
            return Err("Verified MCP command must stay inside its plugin install root.".into());
        }
        if self.args.len() > MAX_MCP_ARGS {
            return Err("Verified MCP server contains too many arguments.".into());
        }
        for argument in &self.args {
            validate_argument(argument)?;
        }
        for (env_key, reference) in &self.environment {
            validate_environment_key(env_key)?;
            validate_identifier("MCP environment reference", &reference.reference_id)?;
        }
        if !self.legacy_environment_refs.is_empty() {
            return Err(
                "Verified MCP legacy environmentRefs are ambiguous and must be reverified with explicit environment keys."
                    .into(),
            );
        }
        if !(1..=3600).contains(&self.timeout_seconds)
            || !(1..=300).contains(&self.connect_timeout_seconds)
        {
            return Err("Verified MCP timeout values are outside the allowed range.".into());
        }
        if require_files {
            validate_runtime_files(managed_root, install_root, self)?;
        }
        Ok(())
    }
}

fn validate_runtime_files(
    managed_root: &Path,
    install_root: &str,
    server: &VerifiedMcpServerRuntime,
) -> Result<(), String> {
    let root = PathBuf::from(install_root);
    reject_symlink_chain(managed_root, &root)?;
    if !root.is_dir() {
        return Err("Verified plugin install root does not exist or is not a directory.".into());
    }
    let command = PathBuf::from(&server.command);
    reject_symlink_chain(&root, &command)?;
    if !command.is_file() {
        return Err("Verified MCP command does not exist or is not a file.".into());
    }
    Ok(())
}

fn reject_symlink_chain(root: &Path, candidate: &Path) -> Result<(), String> {
    reject_symlink(root, "plugin runtime path")?;
    let relative = candidate
        .strip_prefix(root)
        .map_err(|_| "Verified plugin path escaped its install root.".to_string())?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        current.push(component.as_os_str());
        reject_symlink(&current, "plugin runtime path")?;
    }
    let canonical_root = root.canonicalize().map_err(|error| error.to_string())?;
    let canonical_candidate = candidate
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !canonical_candidate.starts_with(canonical_root) {
        return Err("Verified plugin runtime path escaped its install root.".into());
    }
    Ok(())
}

fn validate_identifier(label: &str, value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 256
        || value.chars().any(|character| {
            !(character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-' | ':'))
        })
    {
        return Err(format!("Invalid verified plugin {label}."));
    }
    Ok(())
}

fn validate_argument(value: &str) -> Result<(), String> {
    if value.len() > 4096 || value.chars().any(|character| character == '\0') {
        return Err("Verified MCP arguments must be bounded and contain no NUL bytes.".into());
    }
    Ok(())
}

fn validate_environment_key(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 128
        || !value.chars().all(|character| {
            character.is_ascii_uppercase() || character.is_ascii_digit() || character == '_'
        })
    {
        return Err(
            "Verified MCP environment keys must use uppercase ASCII letters, digits, or underscore."
                .into(),
        );
    }
    Ok(())
}

fn mcp_process_env_key(
    server_id: &str,
    child_env_key: &str,
    reference: &VerifiedMcpEnvironmentReference,
) -> String {
    let mut digest = Sha256::new();
    digest.update(server_id.as_bytes());
    digest.update([0]);
    digest.update(child_env_key.as_bytes());
    digest.update([0]);
    digest.update([match reference.kind {
        ActivatedEnvironmentRefKind::ProviderCredential => 1,
        ActivatedEnvironmentRefKind::ManagedVariable => 2,
        ActivatedEnvironmentRefKind::SystemCapability => 3,
    }]);
    digest.update([0]);
    digest.update(reference.reference_id.as_bytes());
    let digest = digest.finalize();
    let suffix = digest[..16]
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect::<String>();
    format!("BLACKRAIN_MCP_SECRET_{suffix}")
}

fn validate_managed_path(label: &str, managed_root: &Path, value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.contains('\0')
        || !is_portable_absolute_path(value)
        || value.split(['/', '\\']).any(|segment| segment == "..")
        || !path_contains(&managed_root.to_string_lossy(), value)
    {
        return Err(format!(
            "Verified {label} must be an absolute safe path under the managed plugin root."
        ));
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

fn reject_symlink(path: &Path, label: &str) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Unable to inspect {label} {}: {error}", path.display()))?;
    if metadata.file_type().is_symlink() {
        return Err(format!("Verified {label} cannot be a symbolic link."));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::fs;
    use std::path::{Path, PathBuf};

    use super::{
        VerifiedMcpEnvironmentReference, VerifiedMcpServerRuntime, VerifiedMcpTransport,
        VerifiedPluginRuntime, VerifiedPluginRuntimeStore, VERIFIED_PLUGIN_RUNTIME_SCHEMA_VERSION,
    };
    use crate::shared::workbench_core::{
        ActivatedComponentRef, ActivatedEnvironmentRef, ActivatedEnvironmentRefKind,
        ActivatedMcpServerRef,
    };

    fn temp_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "blackrain-plugin-runtime-{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn fixture(root: &Path) -> VerifiedPluginRuntime {
        let install_root = root
            .join("plugins")
            .join("installed")
            .join("com.blackrain.office-cli")
            .join("0.1.0");
        fs::create_dir_all(&install_root).unwrap();
        let command = install_root.join(if cfg!(windows) {
            "office-mcp.exe"
        } else {
            "office-mcp"
        });
        fs::write(&command, "fixture").unwrap();
        VerifiedPluginRuntime {
            schema_version: VERIFIED_PLUGIN_RUNTIME_SCHEMA_VERSION,
            plugin_id: "com.blackrain.office-cli".into(),
            plugin_version: "0.1.0".into(),
            install_root: install_root.to_string_lossy().to_string(),
            mcp_servers: vec![VerifiedMcpServerRuntime {
                id: "com.blackrain.office-files".into(),
                transport: VerifiedMcpTransport::Stdio,
                command: command.to_string_lossy().to_string(),
                args: vec!["--stdio".into()],
                environment: BTreeMap::new(),
                legacy_environment_refs: Vec::new(),
                timeout_seconds: 300,
                connect_timeout_seconds: 30,
                supports_parallel_tool_calls: false,
            }],
            verified_at: 1.0,
        }
    }

    #[test]
    fn persists_immutable_runtime_and_resolves_activation_mcp_refs() {
        let root = temp_root();
        let store = VerifiedPluginRuntimeStore::new(&root);
        let runtime = fixture(&root);
        store.persist_verified(runtime.clone()).unwrap();
        assert_eq!(
            store
                .read(&runtime.plugin_id, &runtime.plugin_version)
                .unwrap(),
            runtime
        );

        let resolved = store
            .resolve_mcp_servers(
                &[ActivatedComponentRef {
                    id: runtime.plugin_id.clone(),
                    version: runtime.plugin_version.clone(),
                }],
                &[ActivatedMcpServerRef {
                    id: "com.blackrain.office-files".into(),
                    plugin_id: runtime.plugin_id.clone(),
                }],
                &[],
            )
            .unwrap();
        assert_eq!(resolved.len(), 1);
        assert_eq!(resolved[0].id, "com.blackrain.office-files");

        let mut changed = runtime;
        changed.mcp_servers[0].args.push("--changed".into());
        assert!(store
            .persist_verified(changed)
            .unwrap_err()
            .contains("identity is immutable"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_paths_outside_managed_root_and_ungranted_environment_refs() {
        let root = temp_root();
        let store = VerifiedPluginRuntimeStore::new(&root);
        let mut runtime = fixture(&root);
        runtime.mcp_servers[0].command = root.join("escape").to_string_lossy().to_string();
        assert!(store
            .persist_verified(runtime)
            .unwrap_err()
            .contains("managed plugin root"));

        let runtime = fixture(&root);
        let mut runtime_with_env = runtime.clone();
        runtime_with_env.mcp_servers[0].environment.insert(
            "OFFICE_LICENSE".into(),
            VerifiedMcpEnvironmentReference {
                kind: ActivatedEnvironmentRefKind::ManagedVariable,
                reference_id: "office-license".into(),
            },
        );
        runtime_with_env.plugin_version = "0.1.1".into();
        runtime_with_env.install_root = runtime_with_env.install_root.replace("0.1.0", "0.1.1");
        let old_command = PathBuf::from(&runtime_with_env.mcp_servers[0].command);
        let new_command = PathBuf::from(&runtime_with_env.install_root).join(
            old_command
                .file_name()
                .expect("fixture command has a file name"),
        );
        fs::create_dir_all(&runtime_with_env.install_root).unwrap();
        fs::write(&new_command, "fixture").unwrap();
        runtime_with_env.mcp_servers[0].command = new_command.to_string_lossy().to_string();
        store.persist_verified(runtime_with_env.clone()).unwrap();
        let error = store
            .resolve_mcp_servers(
                &[ActivatedComponentRef {
                    id: runtime_with_env.plugin_id.clone(),
                    version: runtime_with_env.plugin_version.clone(),
                }],
                &[ActivatedMcpServerRef {
                    id: "com.blackrain.office-files".into(),
                    plugin_id: runtime_with_env.plugin_id.clone(),
                }],
                &[],
            )
            .unwrap_err();
        assert!(error.contains("was not granted"));

        let resolved = store
            .resolve_mcp_servers(
                &[ActivatedComponentRef {
                    id: runtime_with_env.plugin_id.clone(),
                    version: runtime_with_env.plugin_version.clone(),
                }],
                &[ActivatedMcpServerRef {
                    id: "com.blackrain.office-files".into(),
                    plugin_id: runtime_with_env.plugin_id,
                }],
                &[ActivatedEnvironmentRef {
                    kind: ActivatedEnvironmentRefKind::ManagedVariable,
                    reference_id: "office-license".into(),
                }],
            )
            .unwrap();
        let binding = &resolved[0].environment["OFFICE_LICENSE"];
        assert!(binding.process_env_key.starts_with("BLACKRAIN_MCP_SECRET_"));
        assert_eq!(binding.reference.reference_id, "office-license");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_legacy_system_capability_and_mismatched_typed_environment_refs() {
        let root = temp_root();
        let store = VerifiedPluginRuntimeStore::new(&root);

        let mut legacy = fixture(&root);
        legacy.mcp_servers[0].legacy_environment_refs = vec!["office-license".into()];
        assert!(store
            .persist_verified(legacy)
            .unwrap_err()
            .contains("must be reverified"));

        let mut runtime = fixture(&root);
        runtime.mcp_servers[0].environment.insert(
            "OFFICE_LICENSE".into(),
            VerifiedMcpEnvironmentReference {
                kind: ActivatedEnvironmentRefKind::SystemCapability,
                reference_id: "office-installed".into(),
            },
        );
        store.persist_verified(runtime.clone()).unwrap();
        let plugins = [ActivatedComponentRef {
            id: runtime.plugin_id.clone(),
            version: runtime.plugin_version.clone(),
        }];
        let servers = [ActivatedMcpServerRef {
            id: "com.blackrain.office-files".into(),
            plugin_id: runtime.plugin_id.clone(),
        }];
        let system_capability = [ActivatedEnvironmentRef {
            kind: ActivatedEnvironmentRefKind::SystemCapability,
            reference_id: "office-installed".into(),
        }];
        assert!(store
            .resolve_mcp_servers(&plugins, &servers, &system_capability)
            .unwrap_err()
            .contains("cannot inject a system capability"));

        let mut typed = runtime;
        typed.mcp_servers[0]
            .environment
            .get_mut("OFFICE_LICENSE")
            .unwrap()
            .kind = ActivatedEnvironmentRefKind::ManagedVariable;
        typed.plugin_version = "0.1.1".into();
        typed.install_root = typed.install_root.replace("0.1.0", "0.1.1");
        let command_name = PathBuf::from(&typed.mcp_servers[0].command)
            .file_name()
            .unwrap()
            .to_owned();
        let command = PathBuf::from(&typed.install_root).join(command_name);
        fs::create_dir_all(&typed.install_root).unwrap();
        fs::write(&command, "fixture").unwrap();
        typed.mcp_servers[0].command = command.to_string_lossy().to_string();
        store.persist_verified(typed.clone()).unwrap();

        let provider_with_same_id = [ActivatedEnvironmentRef {
            kind: ActivatedEnvironmentRefKind::ProviderCredential,
            reference_id: "office-installed".into(),
        }];
        assert!(store
            .resolve_mcp_servers(
                &[ActivatedComponentRef {
                    id: typed.plugin_id.clone(),
                    version: typed.plugin_version.clone(),
                }],
                &[ActivatedMcpServerRef {
                    id: "com.blackrain.office-files".into(),
                    plugin_id: typed.plugin_id,
                }],
                &provider_with_same_id,
            )
            .unwrap_err()
            .contains("was not granted"));

        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_symlinked_mcp_command() {
        use std::os::unix::fs::symlink;

        let root = temp_root();
        let store = VerifiedPluginRuntimeStore::new(&root);
        let runtime = fixture(&root);
        let command = PathBuf::from(&runtime.mcp_servers[0].command);
        fs::remove_file(&command).unwrap();
        let outside = root.join("outside-command");
        fs::write(&outside, "fixture").unwrap();
        symlink(&outside, &command).unwrap();

        assert!(store
            .persist_verified(runtime)
            .unwrap_err()
            .contains("symbolic link"));
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_symlinked_plugin_parent_directory() {
        use std::os::unix::fs::symlink;

        let root = temp_root();
        let store = VerifiedPluginRuntimeStore::new(&root);
        let runtime = fixture(&root);
        let install_root = PathBuf::from(&runtime.install_root);
        let plugin_root = install_root.parent().unwrap();
        let escaped_root = root.join("escaped-plugin");
        fs::rename(plugin_root, &escaped_root).unwrap();
        symlink(&escaped_root, plugin_root).unwrap();

        assert!(store
            .persist_verified(runtime)
            .unwrap_err()
            .contains("symbolic link"));
        fs::remove_dir_all(root).unwrap();
    }
}
