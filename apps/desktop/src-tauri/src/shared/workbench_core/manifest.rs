use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};

pub(crate) const WORKBENCH_MANIFEST_SCHEMA_VERSION: u32 = 1;
const MAX_MANIFEST_BYTES: u64 = 512 * 1024;
const MAX_LIST_ITEMS: usize = 256;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    rename_all(serialize = "camelCase", deserialize = "snake_case"),
    deny_unknown_fields
)]
pub(crate) struct WorkbenchManifest {
    pub(crate) schema_version: u32,
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) version: String,
    pub(crate) publisher: String,
    pub(crate) description: String,
    pub(crate) license: String,
    pub(crate) target: WorkbenchTarget,
    pub(crate) skills: Vec<WorkbenchSkillDeclaration>,
    #[serde(default)]
    pub(crate) plugins: Vec<WorkbenchPluginDeclaration>,
    #[serde(default)]
    pub(crate) dependencies: Vec<WorkbenchDependencyDeclaration>,
    pub(crate) permissions: WorkbenchPermissionDeclaration,
    pub(crate) tasks: WorkbenchTasksDeclaration,
    pub(crate) validation: WorkbenchValidationDeclaration,
    pub(crate) uninstall: WorkbenchUninstallDeclaration,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    rename_all(serialize = "camelCase", deserialize = "snake_case"),
    deny_unknown_fields
)]
pub(crate) struct WorkbenchTarget {
    pub(crate) domains: Vec<String>,
    pub(crate) roles: Vec<String>,
    pub(crate) platforms: Vec<WorkbenchPlatform>,
    pub(crate) blackrain: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(
    rename_all(serialize = "camelCase", deserialize = "snake_case"),
    deny_unknown_fields
)]
pub(crate) struct WorkbenchPlatform {
    pub(crate) os: WorkbenchOperatingSystem,
    pub(crate) arch: WorkbenchArchitecture,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum WorkbenchOperatingSystem {
    Windows,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub(crate) enum WorkbenchArchitecture {
    #[serde(rename = "x86_64")]
    X86_64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    rename_all(serialize = "camelCase", deserialize = "snake_case"),
    deny_unknown_fields
)]
pub(crate) struct WorkbenchSkillDeclaration {
    pub(crate) path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    rename_all(serialize = "camelCase", deserialize = "snake_case"),
    deny_unknown_fields
)]
pub(crate) struct WorkbenchPluginDeclaration {
    pub(crate) id: String,
    pub(crate) version: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum WorkbenchDependencyKind {
    Bundled,
    Managed,
    System,
    UserProvided,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    rename_all(serialize = "camelCase", deserialize = "snake_case"),
    deny_unknown_fields
)]
pub(crate) struct WorkbenchDependencyDeclaration {
    pub(crate) id: String,
    pub(crate) kind: WorkbenchDependencyKind,
    pub(crate) version: String,
    pub(crate) source: String,
    pub(crate) checksum: Option<String>,
    pub(crate) license: String,
    pub(crate) install_scope: WorkbenchInstallScope,
    pub(crate) uninstall: WorkbenchDependencyUninstall,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum WorkbenchInstallScope {
    AppManaged,
    System,
    UserProvided,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum WorkbenchDependencyUninstall {
    RemoveIfUnused,
    Preserve,
    UserManaged,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    rename_all(serialize = "camelCase", deserialize = "snake_case"),
    deny_unknown_fields
)]
pub(crate) struct WorkbenchPermissionDeclaration {
    pub(crate) files: WorkbenchFilePermissionDeclaration,
    pub(crate) network: WorkbenchNetworkPermissionDeclaration,
    pub(crate) processes: WorkbenchProcessPermissionDeclaration,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    rename_all(serialize = "camelCase", deserialize = "snake_case"),
    deny_unknown_fields
)]
pub(crate) struct WorkbenchFilePermissionDeclaration {
    pub(crate) mode: WorkbenchFilePermissionMode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum WorkbenchFilePermissionMode {
    UserSelectedFolders,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    rename_all(serialize = "camelCase", deserialize = "snake_case"),
    deny_unknown_fields
)]
pub(crate) struct WorkbenchNetworkPermissionDeclaration {
    #[serde(default)]
    pub(crate) domains: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    rename_all(serialize = "camelCase", deserialize = "snake_case"),
    deny_unknown_fields
)]
pub(crate) struct WorkbenchProcessPermissionDeclaration {
    #[serde(default)]
    pub(crate) spawn: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    rename_all(serialize = "camelCase", deserialize = "snake_case"),
    deny_unknown_fields
)]
pub(crate) struct WorkbenchTasksDeclaration {
    pub(crate) source: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    rename_all(serialize = "camelCase", deserialize = "snake_case"),
    deny_unknown_fields
)]
pub(crate) struct WorkbenchValidationDeclaration {
    pub(crate) health: String,
    pub(crate) smoke: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    rename_all(serialize = "camelCase", deserialize = "snake_case"),
    deny_unknown_fields
)]
pub(crate) struct WorkbenchUninstallDeclaration {
    pub(crate) preserve_user_projects: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkbenchPackageInspection {
    pub(crate) package_root: String,
    pub(crate) manifest_path: String,
    pub(crate) manifest: WorkbenchManifest,
    pub(crate) skill_roots: Vec<String>,
    pub(crate) task_source: String,
    pub(crate) health_source: String,
    pub(crate) smoke_source: String,
    pub(crate) installable_on_windows_x64: bool,
}

pub(crate) fn inspect_workbench_package(
    package_root: &Path,
) -> Result<WorkbenchPackageInspection, String> {
    reject_symlink(package_root, "workbench package root")?;
    if !package_root.is_dir() {
        return Err("Workbench package root does not exist or is not a directory.".into());
    }
    let canonical_root = package_root
        .canonicalize()
        .map_err(|error| format!("Unable to resolve workbench package root: {error}"))?;
    let manifest_path = canonical_root.join("workbench.yaml");
    reject_symlink(&manifest_path, "workbench manifest")?;
    let metadata = fs::metadata(&manifest_path)
        .map_err(|error| format!("Unable to inspect workbench manifest: {error}"))?;
    if !metadata.is_file() || metadata.len() > MAX_MANIFEST_BYTES {
        return Err("Workbench manifest must be a regular file no larger than 512 KiB.".into());
    }
    let bytes = fs::read(&manifest_path)
        .map_err(|error| format!("Unable to read workbench manifest: {error}"))?;
    let manifest: WorkbenchManifest = serde_yaml_ng::from_slice(&bytes)
        .map_err(|error| format!("Workbench manifest YAML is invalid: {error}"))?;
    validate_manifest(&manifest)?;

    let skill_roots = manifest
        .skills
        .iter()
        .map(|skill| resolve_package_path(&canonical_root, &skill.path, true))
        .collect::<Result<Vec<_>, _>>()?;
    let task_source = resolve_package_path(&canonical_root, &manifest.tasks.source, false)?;
    let health_source = resolve_package_path(&canonical_root, &manifest.validation.health, false)?;
    let smoke_source = resolve_package_path(&canonical_root, &manifest.validation.smoke, false)?;
    let installable_on_windows_x64 = manifest.target.platforms.iter().any(|platform| {
        platform.os == WorkbenchOperatingSystem::Windows
            && platform.arch == WorkbenchArchitecture::X86_64
    });

    Ok(WorkbenchPackageInspection {
        package_root: canonical_root.to_string_lossy().to_string(),
        manifest_path: manifest_path.to_string_lossy().to_string(),
        manifest,
        skill_roots: skill_roots
            .into_iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect(),
        task_source: task_source.to_string_lossy().to_string(),
        health_source: health_source.to_string_lossy().to_string(),
        smoke_source: smoke_source.to_string_lossy().to_string(),
        installable_on_windows_x64,
    })
}

fn validate_manifest(manifest: &WorkbenchManifest) -> Result<(), String> {
    if manifest.schema_version != WORKBENCH_MANIFEST_SCHEMA_VERSION {
        return Err(format!(
            "Unsupported workbench manifest schema version {}.",
            manifest.schema_version
        ));
    }
    validate_identifier("workbench id", &manifest.id)?;
    validate_identifier("workbench version", &manifest.version)?;
    validate_identifier("publisher", &manifest.publisher)?;
    validate_text("workbench name", &manifest.name, 256)?;
    validate_text("workbench description", &manifest.description, 4096)?;
    validate_text("workbench license", &manifest.license, 256)?;
    validate_text("BlackRain compatibility", &manifest.target.blackrain, 256)?;
    validate_identifier_list("domain", &manifest.target.domains, false)?;
    validate_identifier_list("role", &manifest.target.roles, false)?;
    if manifest.target.platforms.is_empty() || manifest.target.platforms.len() > MAX_LIST_ITEMS {
        return Err("Workbench target platforms must be non-empty and bounded.".into());
    }
    let platform_count = manifest
        .target
        .platforms
        .iter()
        .collect::<HashSet<_>>()
        .len();
    if platform_count != manifest.target.platforms.len() {
        return Err("Workbench target platforms must be unique.".into());
    }
    if manifest.skills.is_empty() || manifest.skills.len() > MAX_LIST_ITEMS {
        return Err("Workbench skills must be non-empty and bounded.".into());
    }
    validate_relative_paths(
        "skill",
        manifest.skills.iter().map(|skill| skill.path.as_str()),
    )?;
    validate_unique_identified(
        "plugin",
        manifest
            .plugins
            .iter()
            .map(|plugin| (plugin.id.as_str(), plugin.version.as_str())),
    )?;
    validate_unique_identified(
        "dependency",
        manifest
            .dependencies
            .iter()
            .map(|dependency| (dependency.id.as_str(), dependency.version.as_str())),
    )?;
    for dependency in &manifest.dependencies {
        validate_text("dependency source", &dependency.source, 2048)?;
        validate_text("dependency license", &dependency.license, 256)?;
        match dependency.kind {
            WorkbenchDependencyKind::Bundled | WorkbenchDependencyKind::Managed => {
                let checksum = dependency.checksum.as_deref().ok_or_else(|| {
                    format!(
                        "Workbench dependency {} requires a SHA-256 checksum.",
                        dependency.id
                    )
                })?;
                if !is_sha256(checksum) {
                    return Err(format!(
                        "Workbench dependency {} has an invalid SHA-256 checksum.",
                        dependency.id
                    ));
                }
                if dependency.install_scope != WorkbenchInstallScope::AppManaged {
                    return Err(format!(
                        "Workbench dependency {} must use app_managed install scope.",
                        dependency.id
                    ));
                }
            }
            WorkbenchDependencyKind::System => {
                if dependency.install_scope != WorkbenchInstallScope::System {
                    return Err(format!(
                        "Workbench dependency {} must use system install scope.",
                        dependency.id
                    ));
                }
            }
            WorkbenchDependencyKind::UserProvided => {
                if dependency.install_scope != WorkbenchInstallScope::UserProvided {
                    return Err(format!(
                        "Workbench dependency {} must use user_provided install scope.",
                        dependency.id
                    ));
                }
            }
        }
    }
    validate_domain_list(&manifest.permissions.network.domains)?;
    validate_identifier_list(
        "process permission",
        &manifest.permissions.processes.spawn,
        true,
    )?;
    validate_relative_path("task source", &manifest.tasks.source)?;
    validate_relative_path("health source", &manifest.validation.health)?;
    validate_relative_path("smoke source", &manifest.validation.smoke)?;
    if !manifest.uninstall.preserve_user_projects {
        return Err("Workbench manifest v1 must preserve user projects on uninstall.".into());
    }
    Ok(())
}

fn resolve_package_path(root: &Path, relative: &str, directory: bool) -> Result<PathBuf, String> {
    validate_relative_path("package resource", relative)?;
    let candidate = root.join(relative);
    let mut current = root.to_path_buf();
    for component in Path::new(relative).components() {
        current.push(component.as_os_str());
        reject_symlink(&current, "workbench package resource")?;
    }
    let canonical = candidate.canonicalize().map_err(|error| {
        format!("Unable to resolve workbench package resource {relative}: {error}")
    })?;
    if !canonical.starts_with(root)
        || (directory && !canonical.is_dir())
        || (!directory && !canonical.is_file())
    {
        return Err(format!(
            "Workbench package resource {relative} has an invalid type or escaped the package root."
        ));
    }
    if directory && !canonical.join("SKILL.md").is_file() {
        return Err(format!(
            "Workbench skill resource {relative} must contain SKILL.md."
        ));
    }
    Ok(canonical)
}

fn validate_relative_paths<'a>(
    label: &str,
    paths: impl Iterator<Item = &'a str>,
) -> Result<(), String> {
    let mut seen = HashSet::new();
    for path in paths {
        validate_relative_path(label, path)?;
        if !seen.insert(path) {
            return Err(format!("Workbench {label} paths must be unique."));
        }
    }
    Ok(())
}

fn validate_relative_path(label: &str, value: &str) -> Result<(), String> {
    let path = Path::new(value);
    if value.is_empty()
        || value.len() > 4096
        || value.contains('\0')
        || value.chars().any(char::is_control)
        || path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(format!(
            "Workbench {label} must be a safe package-relative path."
        ));
    }
    Ok(())
}

fn validate_unique_identified<'a>(
    label: &str,
    items: impl Iterator<Item = (&'a str, &'a str)>,
) -> Result<(), String> {
    let mut seen = HashSet::new();
    for (id, version) in items {
        validate_identifier(label, id)?;
        validate_identifier(&format!("{label} version"), version)?;
        if !seen.insert(id) {
            return Err(format!("Workbench {label} ids must be unique."));
        }
    }
    Ok(())
}

fn validate_identifier_list(
    label: &str,
    values: &[String],
    empty_allowed: bool,
) -> Result<(), String> {
    if (!empty_allowed && values.is_empty()) || values.len() > MAX_LIST_ITEMS {
        return Err(format!(
            "Workbench {label} list must be non-empty and bounded."
        ));
    }
    let mut seen = HashSet::new();
    for value in values {
        validate_identifier(label, value)?;
        if !seen.insert(value) {
            return Err(format!("Workbench {label} values must be unique."));
        }
    }
    Ok(())
}

fn validate_domain_list(domains: &[String]) -> Result<(), String> {
    if domains.len() > MAX_LIST_ITEMS {
        return Err("Workbench network domain list is too large.".into());
    }
    let mut seen = HashSet::new();
    for domain in domains {
        if domain.is_empty()
            || domain.len() > 253
            || domain.starts_with('.')
            || domain.ends_with('.')
            || domain.chars().any(|character| {
                !(character.is_ascii_alphanumeric() || matches!(character, '.' | '-'))
            })
            || !seen.insert(domain)
        {
            return Err(format!("Invalid workbench network domain {domain}."));
        }
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
        return Err(format!("Invalid workbench {label}."));
    }
    Ok(())
}

fn validate_text(label: &str, value: &str, max_chars: usize) -> Result<(), String> {
    if value.trim().is_empty()
        || value.chars().count() > max_chars
        || value.chars().any(|character| character == '\0')
    {
        return Err(format!("Invalid {label}."));
    }
    Ok(())
}

fn is_sha256(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|digest| {
        digest.len() == 64
            && digest
                .chars()
                .all(|character| character.is_ascii_hexdigit())
    })
}

fn reject_symlink(path: &Path, label: &str) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Unable to inspect {label} {}: {error}", path.display()))?;
    if metadata.file_type().is_symlink() {
        return Err(format!("{label} cannot be a symlink: {}", path.display()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{inspect_workbench_package, WorkbenchDependencyKind};
    use std::fs;
    use std::path::PathBuf;

    fn fixture(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("test-fixtures")
            .join("workbench")
            .join("v1")
            .join(name)
    }

    #[test]
    fn inspects_the_office_v1_manifest_and_resolves_only_package_resources() {
        let minimal = inspect_workbench_package(&fixture("valid-minimal")).unwrap();
        assert_eq!(minimal.manifest.id, "com.blackrain.fixture");
        assert_eq!(minimal.skill_roots.len(), 1);

        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("..")
            .join("workbenches")
            .join("office-agent");
        let inspected = inspect_workbench_package(&root).unwrap();
        assert_eq!(inspected.manifest.id, "com.blackrain.office");
        assert_eq!(inspected.manifest.version, "0.1.0");
        assert!(inspected.installable_on_windows_x64);
        assert_eq!(inspected.skill_roots.len(), 3);
        assert_eq!(
            inspected.manifest.dependencies[0].kind,
            WorkbenchDependencyKind::Bundled
        );
        let frontend = serde_json::to_value(&inspected).unwrap();
        assert_eq!(frontend["manifest"]["schemaVersion"], 1);
        assert!(frontend["manifest"].get("schema_version").is_none());
        assert_eq!(
            frontend["manifest"]["dependencies"][0]["installScope"],
            "app_managed"
        );
        assert!(inspected
            .skill_roots
            .iter()
            .all(|path| PathBuf::from(path).starts_with(&inspected.package_root)));
    }

    #[test]
    fn rejects_unknown_fields_and_package_path_traversal() {
        let unknown = inspect_workbench_package(&fixture("invalid-unknown-field")).unwrap_err();
        assert!(unknown.contains("unknown field"));
        let traversal = inspect_workbench_package(&fixture("invalid-path-traversal")).unwrap_err();
        assert!(traversal.contains("safe package-relative path"));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinked_package_resources() {
        use std::os::unix::fs::symlink;
        let root = std::env::temp_dir().join(format!(
            "blackrain-workbench-manifest-symlink-{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(root.join("skills")).unwrap();
        fs::copy(
            fixture("valid-minimal/workbench.yaml"),
            root.join("workbench.yaml"),
        )
        .unwrap();
        symlink(
            fixture("valid-minimal/real-skill"),
            root.join("skills/demo"),
        )
        .unwrap();
        fs::create_dir_all(root.join("tasks")).unwrap();
        fs::create_dir_all(root.join("validation/smoke")).unwrap();
        fs::write(root.join("tasks/tasks.yaml"), "tasks: []\n").unwrap();
        fs::write(root.join("validation/health.yaml"), "checks: []\n").unwrap();
        fs::write(root.join("validation/smoke/basic.yaml"), "steps: []\n").unwrap();
        let error = inspect_workbench_package(&root).unwrap_err();
        assert!(error.contains("cannot be a symlink"));
        fs::remove_dir_all(root).unwrap();
    }
}
