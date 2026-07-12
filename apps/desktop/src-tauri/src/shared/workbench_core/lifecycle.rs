use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use sha2::{Digest, Sha256};
use tokio::time::timeout;

use super::manifest::{
    inspect_workbench_package, WorkbenchDependencyKind, WorkbenchDependencyUninstall,
    WorkbenchInstallScope,
};
use super::{
    ActivatedEnvironmentRef, ActivatedEnvironmentRefKind, ActivatedFileAccess,
    ActivatedFilePermission, ActivatedPermissionGrant, ActivatedProjectContext,
    ActivatedWorkbenchContext, ActivatedWorkbenchStore, WorkbenchEngine,
    ACTIVATED_WORKBENCH_SCHEMA_VERSION,
};
use crate::shared::hermes_core::config::atomic_write;
use crate::shared::hermes_core::runtime::OFFICECLI_SYSTEM_CAPABILITY_ID;
use crate::shared::process_core::tokio_command;

pub(crate) const OFFICIAL_OFFICE_WORKBENCH_ID: &str = "com.blackrain.office";
pub(crate) const OFFICIAL_OFFICE_WORKBENCH_VERSION: &str = "0.1.0";
const OFFICIAL_OFFICE_DEPENDENCY_ID: &str = "com.blackrain.office-cli";
const OFFICIAL_OFFICE_DEPENDENCY_VERSION: &str = "1.0.117";
const OFFICIAL_OFFICE_DEPENDENCY_SOURCE: &str = "app-resource:office-cli/windows-x64/officecli.exe";

#[derive(Debug, Clone)]
pub(crate) struct OfficialOfficeActivationRequest {
    pub(crate) app_data_dir: PathBuf,
    pub(crate) package_root: PathBuf,
    pub(crate) officecli_source: PathBuf,
    pub(crate) project_path: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OfficialOfficeActivationResult {
    pub(crate) activation: ActivatedWorkbenchContext,
    pub(crate) install_root: String,
    pub(crate) officecli_root: String,
    pub(crate) health_checks: Vec<String>,
    pub(crate) project_preserved: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ActiveWorkbenchState<'a> {
    schema_version: u32,
    workbench_id: &'a str,
    version: &'a str,
    verified_at: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstalledWorkbenchState<'a> {
    schema_version: u32,
    status: &'a str,
    workbench_id: &'a str,
    version: &'a str,
    install_root: &'a str,
    officecli_root: &'a str,
    verified_at: f64,
}

pub(crate) async fn install_and_activate_official_office(
    request: OfficialOfficeActivationRequest,
    activation_store: &ActivatedWorkbenchStore,
) -> Result<OfficialOfficeActivationResult, String> {
    let source_inspection = inspect_workbench_package(&request.package_root)?;
    validate_official_office_manifest(&source_inspection.manifest)?;
    let dependency = source_inspection
        .manifest
        .dependencies
        .iter()
        .find(|dependency| dependency.id == OFFICIAL_OFFICE_DEPENDENCY_ID)
        .ok_or_else(|| {
            "Official Office workbench is missing its OfficeCLI dependency.".to_string()
        })?;
    let expected_checksum = dependency
        .checksum
        .as_deref()
        .and_then(|value| value.strip_prefix("sha256:"))
        .ok_or_else(|| "Official OfficeCLI dependency has no SHA-256 checksum.".to_string())?;
    validate_regular_file_without_symlink(&request.officecli_source, "OfficeCLI resource")?;
    verify_sha256(&request.officecli_source, expected_checksum)?;

    let project_path = validate_project_path(&request.project_path)?;
    let workbench_root = ensure_managed_subdirectory(
        &request.app_data_dir,
        Path::new("workbenches").join(OFFICIAL_OFFICE_WORKBENCH_ID),
    )?;
    let versions_root = ensure_managed_subdirectory(&workbench_root, Path::new("versions"))?;
    let version_root = versions_root.join(OFFICIAL_OFFICE_WORKBENCH_VERSION);
    let tools_root = ensure_managed_subdirectory(&request.app_data_dir, Path::new("tools"))?;
    let officecli_root = tools_root.join("officecli");
    install_workbench_version(&request.package_root, &version_root)?;
    let installed_binary = install_officecli(
        &request.officecli_source,
        &officecli_root,
        expected_checksum,
    )?;
    let observed_version = probe_officecli_version(&installed_binary).await?;
    if !observed_version.contains(OFFICIAL_OFFICE_DEPENDENCY_VERSION) {
        return Err(format!(
            "OfficeCLI health check expected version {} but received {}.",
            OFFICIAL_OFFICE_DEPENDENCY_VERSION, observed_version
        ));
    }

    let installed_inspection = inspect_workbench_package(&version_root)?;
    validate_official_office_manifest(&installed_inspection.manifest)?;
    let verified_at = unix_timestamp()?;
    persist_install_state(&workbench_root, &version_root, &officecli_root, verified_at)?;
    let context = build_activation_context(&installed_inspection, &project_path, verified_at)?;
    let persisted = activation_store.persist_verified(context)?;

    Ok(OfficialOfficeActivationResult {
        activation: persisted,
        install_root: version_root.to_string_lossy().to_string(),
        officecli_root: officecli_root.to_string_lossy().to_string(),
        health_checks: vec![format!("OfficeCLI {observed_version}")],
        project_preserved: true,
    })
}

fn validate_official_office_manifest(
    manifest: &super::manifest::WorkbenchManifest,
) -> Result<(), String> {
    if manifest.id != OFFICIAL_OFFICE_WORKBENCH_ID
        || manifest.version != OFFICIAL_OFFICE_WORKBENCH_VERSION
        || manifest.publisher != "blackrain-official"
        || manifest.license != "BlackRain-Commercial"
    {
        return Err(
            "Bundled workbench identity does not match the official Office allowlist.".into(),
        );
    }
    let skill_paths = manifest
        .skills
        .iter()
        .map(|skill| skill.path.as_str())
        .collect::<Vec<_>>();
    if skill_paths
        != [
            "skills/generate-office-deliverable",
            "skills/fix-office-formatting",
            "skills/render-office-preview",
        ]
    {
        return Err("Official Office skill declarations do not match the allowlist.".into());
    }
    if manifest.plugins.len() > 0 {
        return Err("Official Office v0.1.0 does not permit undeclared plugin runtimes.".into());
    }
    if manifest.dependencies.len() != 1 {
        return Err("Official Office v0.1.0 must declare exactly one dependency.".into());
    }
    let dependency = &manifest.dependencies[0];
    if dependency.id != OFFICIAL_OFFICE_DEPENDENCY_ID
        || dependency.kind != WorkbenchDependencyKind::Bundled
        || dependency.version != OFFICIAL_OFFICE_DEPENDENCY_VERSION
        || dependency.source != OFFICIAL_OFFICE_DEPENDENCY_SOURCE
        || dependency.license != "Apache-2.0"
        || dependency.install_scope != WorkbenchInstallScope::AppManaged
        || dependency.uninstall != WorkbenchDependencyUninstall::RemoveIfUnused
    {
        return Err(
            "Official OfficeCLI dependency declaration does not match the allowlist.".into(),
        );
    }
    if !manifest.uninstall.preserve_user_projects {
        return Err("Official Office workbench must preserve user projects.".into());
    }
    if !manifest.permissions.network.domains.is_empty()
        || manifest.permissions.processes.spawn != [OFFICIAL_OFFICE_DEPENDENCY_ID]
        || manifest.tasks.source != "tasks/tasks.yaml"
        || manifest.validation.health != "validation/health.yaml"
        || manifest.validation.smoke != "validation/smoke/basic.yaml"
    {
        return Err(
            "Official Office permissions or validation sources exceed the allowlist.".into(),
        );
    }
    Ok(())
}

fn install_workbench_version(source: &Path, target: &Path) -> Result<(), String> {
    if target.exists() {
        reject_symlink(target, "installed workbench version")?;
        inspect_workbench_package(target)?;
        return Ok(());
    }
    let parent = target
        .parent()
        .ok_or_else(|| "Unable to resolve workbench versions root.".to_string())?;
    ensure_directory(parent)?;
    let staging = parent.join(format!(
        ".{}-staging-{}",
        OFFICIAL_OFFICE_WORKBENCH_VERSION,
        uuid::Uuid::new_v4().simple()
    ));
    let result = (|| {
        copy_directory_strict(source, &staging)?;
        inspect_workbench_package(&staging)?;
        fs::rename(&staging, target).map_err(|error| {
            format!(
                "Unable to activate staged Office workbench {}: {error}",
                target.display()
            )
        })?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    result
}

fn install_officecli(
    source: &Path,
    target_root: &Path,
    expected_checksum: &str,
) -> Result<PathBuf, String> {
    let target_name = if cfg!(target_os = "windows") {
        "officecli.exe"
    } else {
        "officecli"
    };
    let target = target_root.join(target_name);
    if target_root.exists() {
        reject_symlink(target_root, "OfficeCLI install root")?;
        validate_regular_file_without_symlink(&target, "installed OfficeCLI")?;
        verify_sha256(&target, expected_checksum)?;
        return Ok(target);
    }
    let parent = target_root
        .parent()
        .ok_or_else(|| "Unable to resolve OfficeCLI tools root.".to_string())?;
    ensure_directory(parent)?;
    let staging = parent.join(format!(
        ".officecli-staging-{}",
        uuid::Uuid::new_v4().simple()
    ));
    let staged_binary = staging.join(target_name);
    let result = (|| {
        ensure_directory(&staging)?;
        fs::copy(source, &staged_binary).map_err(|error| {
            format!(
                "Unable to copy OfficeCLI from {} to {}: {error}",
                source.display(),
                staged_binary.display()
            )
        })?;
        set_executable_permissions(&staged_binary)?;
        verify_sha256(&staged_binary, expected_checksum)?;
        fs::rename(&staging, target_root).map_err(|error| {
            format!(
                "Unable to activate staged OfficeCLI {}: {error}",
                target_root.display()
            )
        })?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    result.map(|_| target)
}

async fn probe_officecli_version(binary: &Path) -> Result<String, String> {
    let mut command = tokio_command(binary);
    command.arg("--version");
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    let output = timeout(Duration::from_secs(10), command.output())
        .await
        .map_err(|_| "OfficeCLI health check timed out after 10 seconds.".to_string())?
        .map_err(|error| format!("Unable to run OfficeCLI health check: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "OfficeCLI health check failed with exit code {:?}.",
            output.status.code()
        ));
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() || stdout.len() > 1024 || stdout.chars().any(char::is_control) {
        return Err("OfficeCLI health check returned an invalid version string.".into());
    }
    Ok(stdout)
}

fn build_activation_context(
    inspection: &super::manifest::WorkbenchPackageInspection,
    project_path: &Path,
    verified_at: f64,
) -> Result<ActivatedWorkbenchContext, String> {
    let project = project_path.to_string_lossy().to_string();
    let identity = stable_project_identity(&project);
    let context = ActivatedWorkbenchContext {
        schema_version: ACTIVATED_WORKBENCH_SCHEMA_VERSION,
        activation_id: format!("office-{identity}"),
        workbench_id: OFFICIAL_OFFICE_WORKBENCH_ID.into(),
        workbench_version: OFFICIAL_OFFICE_WORKBENCH_VERSION.into(),
        engine: WorkbenchEngine::Work,
        project: ActivatedProjectContext {
            project_id: format!("project-{identity}"),
            path: project.clone(),
        },
        task: None,
        skill_roots: inspection.skill_roots.clone(),
        plugins: Vec::new(),
        mcp_servers: Vec::new(),
        environment_refs: vec![ActivatedEnvironmentRef {
            kind: ActivatedEnvironmentRefKind::SystemCapability,
            reference_id: OFFICECLI_SYSTEM_CAPABILITY_ID.into(),
        }],
        permissions: ActivatedPermissionGrant {
            grant_id: format!("grant-{identity}"),
            files: vec![ActivatedFilePermission {
                path: project,
                access: ActivatedFileAccess::ReadWrite,
            }],
            network_domains: inspection.manifest.permissions.network.domains.clone(),
            process_ids: inspection.manifest.permissions.processes.spawn.clone(),
        },
        verified_at,
    };
    context.validate()?;
    Ok(context)
}

fn persist_install_state(
    workbench_root: &Path,
    version_root: &Path,
    officecli_root: &Path,
    verified_at: f64,
) -> Result<(), String> {
    ensure_directory(workbench_root)?;
    let version_root = version_root.to_string_lossy();
    let officecli_root = officecli_root.to_string_lossy();
    let active = ActiveWorkbenchState {
        schema_version: 1,
        workbench_id: OFFICIAL_OFFICE_WORKBENCH_ID,
        version: OFFICIAL_OFFICE_WORKBENCH_VERSION,
        verified_at,
    };
    let state = InstalledWorkbenchState {
        schema_version: 1,
        status: "verified",
        workbench_id: OFFICIAL_OFFICE_WORKBENCH_ID,
        version: OFFICIAL_OFFICE_WORKBENCH_VERSION,
        install_root: &version_root,
        officecli_root: &officecli_root,
        verified_at,
    };
    atomic_write(
        &workbench_root.join("active.json"),
        &serde_json::to_vec_pretty(&active)
            .map_err(|error| format!("Unable to serialize active workbench state: {error}"))?,
    )?;
    atomic_write(
        &workbench_root.join("state.json"),
        &serde_json::to_vec_pretty(&state)
            .map_err(|error| format!("Unable to serialize workbench lifecycle state: {error}"))?,
    )
}

fn validate_project_path(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("Office project path must be absolute.".into());
    }
    reject_symlink(path, "Office project path")?;
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("Unable to resolve Office project path: {error}"))?;
    if !canonical.is_dir() {
        return Err("Office project path must be an existing directory.".into());
    }
    Ok(canonical)
}

fn copy_directory_strict(source: &Path, target: &Path) -> Result<(), String> {
    reject_symlink(source, "workbench package directory")?;
    if !source.is_dir() {
        return Err("Workbench package source must be a directory.".into());
    }
    ensure_directory(target)?;
    for entry in fs::read_dir(source)
        .map_err(|error| format!("Unable to read {}: {error}", source.display()))?
    {
        let entry = entry.map_err(|error| format!("Unable to read package entry: {error}"))?;
        let source_path = entry.path();
        let metadata = fs::symlink_metadata(&source_path)
            .map_err(|error| format!("Unable to inspect {}: {error}", source_path.display()))?;
        if is_link_like(&metadata) {
            return Err(format!(
                "Workbench package cannot contain symlinks: {}",
                source_path.display()
            ));
        }
        let target_path = target.join(entry.file_name());
        if metadata.is_dir() {
            copy_directory_strict(&source_path, &target_path)?;
        } else if metadata.is_file() {
            fs::copy(&source_path, &target_path).map_err(|error| {
                format!(
                    "Unable to copy workbench package file {}: {error}",
                    source_path.display()
                )
            })?;
        } else {
            return Err(format!(
                "Workbench package contains an unsupported file type: {}",
                source_path.display()
            ));
        }
    }
    Ok(())
}

fn verify_sha256(path: &Path, expected: &str) -> Result<(), String> {
    let bytes = fs::read(path)
        .map_err(|error| format!("Unable to read {} for checksum: {error}", path.display()))?;
    let actual = format!("{:x}", Sha256::digest(&bytes));
    if !actual.eq_ignore_ascii_case(expected) {
        return Err(format!(
            "SHA-256 verification failed for {}.",
            path.display()
        ));
    }
    Ok(())
}

fn stable_project_identity(project_path: &str) -> String {
    let digest = Sha256::digest(project_path.as_bytes());
    format!("{:x}", digest)[..24].to_string()
}

fn unix_timestamp() -> Result<f64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs_f64())
        .map_err(|error| format!("System clock is invalid: {error}"))
}

fn ensure_directory(path: &Path) -> Result<(), String> {
    if path.exists() {
        reject_symlink(path, "managed directory")?;
    }
    fs::create_dir_all(path).map_err(|error| {
        format!(
            "Unable to create managed directory {}: {error}",
            path.display()
        )
    })?;
    reject_symlink(path, "managed directory")
}

fn ensure_managed_subdirectory(root: &Path, relative: impl AsRef<Path>) -> Result<PathBuf, String> {
    ensure_directory(root)?;
    let mut current = root.to_path_buf();
    for component in relative.as_ref().components() {
        let std::path::Component::Normal(segment) = component else {
            return Err("Managed workbench paths must contain only normal path segments.".into());
        };
        current.push(segment);
        ensure_directory(&current)?;
    }
    Ok(current)
}

fn validate_regular_file_without_symlink(path: &Path, label: &str) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Unable to inspect {label} {}: {error}", path.display()))?;
    if is_link_like(&metadata) || !metadata.is_file() {
        return Err(format!("{label} must be a regular non-symlink file."));
    }
    Ok(())
}

fn reject_symlink(path: &Path, label: &str) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Unable to inspect {label} {}: {error}", path.display()))?;
    if is_link_like(&metadata) {
        return Err(format!("{label} cannot be a symlink: {}", path.display()));
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

#[cfg(unix)]
fn set_executable_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = fs::metadata(path)
        .map_err(|error| format!("Unable to inspect OfficeCLI permissions: {error}"))?
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions)
        .map_err(|error| format!("Unable to set OfficeCLI executable permissions: {error}"))
}

#[cfg(not(unix))]
fn set_executable_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(all(test, unix))]
mod tests {
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::path::{Path, PathBuf};

    use sha2::{Digest, Sha256};

    use super::{
        install_and_activate_official_office, OfficialOfficeActivationRequest,
        OFFICIAL_OFFICE_WORKBENCH_ID,
    };
    use crate::shared::workbench_core::ActivatedWorkbenchStore;

    fn temp_root(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "blackrain-office-lifecycle-{label}-{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn write_fixture_package(root: &Path, checksum: &str) {
        for skill in [
            "generate-office-deliverable",
            "fix-office-formatting",
            "render-office-preview",
        ] {
            let skill_root = root.join("skills").join(skill);
            fs::create_dir_all(&skill_root).unwrap();
            fs::write(skill_root.join("SKILL.md"), format!("# {skill}\n")).unwrap();
        }
        fs::create_dir_all(root.join("tasks")).unwrap();
        fs::create_dir_all(root.join("validation/smoke")).unwrap();
        fs::write(root.join("tasks/tasks.yaml"), "schema_version: 1\n").unwrap();
        fs::write(root.join("validation/health.yaml"), "schema_version: 1\n").unwrap();
        fs::write(
            root.join("validation/smoke/basic.yaml"),
            "schema_version: 1\n",
        )
        .unwrap();
        fs::write(
            root.join("workbench.yaml"),
            format!(
                r#"schema_version: 1
id: com.blackrain.office
name: Office
version: 0.1.0
publisher: blackrain-official
description: fixture
license: BlackRain-Commercial
target:
  domains: [office]
  roles: [office-generalist]
  platforms: [{{ os: windows, arch: x86_64 }}]
  blackrain: ">=0.7.68"
engine:
  preferred: work
  allowed: [work]
skills:
  - {{ path: skills/generate-office-deliverable }}
  - {{ path: skills/fix-office-formatting }}
  - {{ path: skills/render-office-preview }}
plugins: []
dependencies:
  - id: com.blackrain.office-cli
    kind: bundled
    version: 1.0.117
    source: app-resource:office-cli/windows-x64/officecli.exe
    checksum: sha256:{checksum}
    license: Apache-2.0
    install_scope: app_managed
    uninstall: remove_if_unused
permissions:
  files: {{ mode: user-selected-folders }}
  network: {{ domains: [] }}
  processes: {{ spawn: [com.blackrain.office-cli] }}
tasks: {{ source: tasks/tasks.yaml }}
validation:
  health: validation/health.yaml
  smoke: validation/smoke/basic.yaml
uninstall: {{ preserve_user_projects: true }}
"#
            ),
        )
        .unwrap();
    }

    #[tokio::test]
    async fn installs_verifies_and_activates_official_office_transaction() {
        let root = temp_root("success");
        let package = root.join("package");
        let project = root.join("project");
        let app_data = root.join("app-data");
        fs::create_dir_all(&package).unwrap();
        fs::create_dir_all(&project).unwrap();
        fs::create_dir_all(&app_data).unwrap();
        let binary = root.join("officecli");
        fs::write(&binary, "#!/bin/sh\necho 1.0.117\n").unwrap();
        let mut permissions = fs::metadata(&binary).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&binary, permissions).unwrap();
        let checksum = format!("{:x}", Sha256::digest(fs::read(&binary).unwrap()));
        write_fixture_package(&package, &checksum);
        let store = ActivatedWorkbenchStore::new(&app_data);

        let result = install_and_activate_official_office(
            OfficialOfficeActivationRequest {
                app_data_dir: app_data.clone(),
                package_root: package.clone(),
                officecli_source: binary.clone(),
                project_path: project.clone(),
            },
            &store,
        )
        .await
        .unwrap();

        assert_eq!(result.activation.workbench_id, OFFICIAL_OFFICE_WORKBENCH_ID);
        assert_eq!(result.activation.skill_roots.len(), 3);
        assert_eq!(
            result.activation.project.path,
            project.canonicalize().unwrap().to_string_lossy()
        );
        assert_eq!(store.list().unwrap(), vec![result.activation.clone()]);
        let active_path = app_data.join("workbenches/com.blackrain.office/active.json");
        assert!(active_path.is_file());
        assert!(app_data.join("tools/officecli/officecli").is_file());

        let second_project = root.join("second-project");
        fs::create_dir_all(&second_project).unwrap();
        let second = install_and_activate_official_office(
            OfficialOfficeActivationRequest {
                app_data_dir: app_data.clone(),
                package_root: package,
                officecli_source: binary,
                project_path: second_project,
            },
            &store,
        )
        .await
        .unwrap();
        assert_ne!(
            result.activation.activation_id,
            second.activation.activation_id
        );
        assert_eq!(store.list().unwrap().len(), 2);
        let active = fs::read_to_string(active_path).unwrap();
        assert!(!active.contains("activationId"));
        assert!(!active.contains("projectPath"));
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn failed_officecli_health_never_issues_an_activation() {
        let root = temp_root("health-failure");
        let package = root.join("package");
        let project = root.join("project");
        let app_data = root.join("app-data");
        fs::create_dir_all(&package).unwrap();
        fs::create_dir_all(&project).unwrap();
        fs::create_dir_all(&app_data).unwrap();
        let binary = root.join("officecli");
        fs::write(&binary, "#!/bin/sh\necho 0.0.0\n").unwrap();
        let mut permissions = fs::metadata(&binary).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&binary, permissions).unwrap();
        let checksum = format!("{:x}", Sha256::digest(fs::read(&binary).unwrap()));
        write_fixture_package(&package, &checksum);
        let store = ActivatedWorkbenchStore::new(&app_data);

        let error = install_and_activate_official_office(
            OfficialOfficeActivationRequest {
                app_data_dir: app_data.clone(),
                package_root: package,
                officecli_source: binary,
                project_path: project,
            },
            &store,
        )
        .await
        .unwrap_err();

        assert!(error.contains("expected version 1.0.117"));
        assert!(store.list().unwrap().is_empty());
        assert!(!app_data
            .join("workbenches/com.blackrain.office/active.json")
            .exists());
        fs::remove_dir_all(root).unwrap();
    }
}
