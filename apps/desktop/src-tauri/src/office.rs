use serde::Serialize;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};
use tokio::time::timeout;

use crate::remote_backend;
use crate::shared::process_core::tokio_command;
use crate::state::AppState;

const ENV_OFFICECLI_BIN: &str = "BLACKRAIN_OFFICECLI_BIN";
const ENV_OFFICECLI_SOURCE: &str = "BLACKRAIN_OFFICECLI_SOURCE";
const OFFICE_RUNTIME_DIR: &str = "tools/officecli";
const RESOURCE_OFFICE_DIR: &str = "office-cli";
const RESOURCE_PLUGIN_DIR: &str = "plugins/office-cli";
const RESOURCE_WORKBENCH_DIR: &str = "workbenches/office-agent";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OfficeRuntimeInfo {
    pub(crate) available: bool,
    pub(crate) bin_path: Option<String>,
    pub(crate) install_dir: Option<String>,
    pub(crate) source: String,
    pub(crate) version: Option<String>,
    pub(crate) plugin_path: Option<String>,
    pub(crate) workbench_path: Option<String>,
    pub(crate) message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OfficeCommandResult {
    pub(crate) success: bool,
    pub(crate) exit_code: Option<i32>,
    pub(crate) stdout: String,
    pub(crate) stderr: String,
    pub(crate) command_line: String,
    pub(crate) bin_path: String,
}

async fn workspace_dir_for_id(state: &AppState, workspace_id: Option<&str>) -> Option<String> {
    let workspace_id = workspace_id?;
    state
        .workspaces
        .lock()
        .await
        .get(workspace_id)
        .map(|entry| entry.path.clone())
}

fn dev_repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("..")
}

fn is_office_executable_name(file_name: &str) -> bool {
    let lower = file_name.to_ascii_lowercase();
    if cfg!(target_os = "windows") {
        lower == "officecli.exe"
    } else {
        lower == "officecli"
    }
}

fn find_officecli_binary(root: &Path, depth: usize) -> Option<PathBuf> {
    if depth == 0 || !root.exists() {
        return None;
    }

    let entries = fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            let name = path.file_name()?.to_str()?;
            if is_office_executable_name(name) {
                return Some(path);
            }
            continue;
        }
        if path.is_dir() {
            if let Some(found) = find_officecli_binary(&path, depth - 1) {
                return Some(found);
            }
        }
    }
    None
}

fn app_runtime_root(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Unable to resolve app data dir: {err}"))?;
    Ok(data_dir.join(OFFICE_RUNTIME_DIR))
}

fn platform_resource_hints() -> Vec<String> {
    let os = env::consts::OS;
    let arch = env::consts::ARCH;
    let mut hints = Vec::new();

    match (os, arch) {
        ("windows", "x86_64") => {
            hints.push("windows-x64".to_string());
            hints.push("win-x64".to_string());
        }
        ("windows", "aarch64") => {
            hints.push("windows-arm64".to_string());
            hints.push("win-arm64".to_string());
        }
        ("macos", "aarch64") => {
            hints.push("macos-arm64".to_string());
            hints.push("osx-arm64".to_string());
            hints.push("darwin-arm64".to_string());
        }
        ("macos", "x86_64") => {
            hints.push("macos-x64".to_string());
            hints.push("osx-x64".to_string());
            hints.push("darwin-x64".to_string());
        }
        ("linux", "x86_64") => {
            hints.push("linux-x64".to_string());
        }
        ("linux", "aarch64") => {
            hints.push("linux-arm64".to_string());
        }
        _ => {}
    }

    hints.push(os.to_string());
    hints
}

fn bundled_office_roots(app: &AppHandle) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let hints = platform_resource_hints();

    if let Ok(resource_dir) = app.path().resource_dir() {
        let base = resource_dir.join(RESOURCE_OFFICE_DIR);
        for hint in &hints {
            roots.push(base.join(hint));
        }
        roots.push(base);
    }

    if let Ok(current_exe) = env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            let base = exe_dir.join(RESOURCE_OFFICE_DIR);
            for hint in &hints {
                roots.push(base.join(hint));
            }
            roots.push(base);

            let base = exe_dir.join("resources").join(RESOURCE_OFFICE_DIR);
            for hint in &hints {
                roots.push(base.join(hint));
            }
            roots.push(base);
        }
    }

    let dev_base = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join(RESOURCE_OFFICE_DIR);
    for hint in &hints {
        roots.push(dev_base.join(hint));
    }
    roots.push(dev_base);

    roots
}

fn bundled_plugin_dir(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidate = resource_dir.join(RESOURCE_PLUGIN_DIR);
        if candidate.exists() {
            return Some(candidate);
        }
    }

    if let Ok(current_exe) = env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            let candidate = exe_dir.join(RESOURCE_PLUGIN_DIR);
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    let dev = dev_repo_root().join("plugins").join("office-cli");
    if dev.exists() {
        return Some(dev);
    }
    None
}

pub(crate) fn bundled_workbench_dir(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidate = resource_dir.join(RESOURCE_WORKBENCH_DIR);
        if candidate.exists() {
            return Some(candidate);
        }
    }

    if let Ok(current_exe) = env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            let candidate = exe_dir.join(RESOURCE_WORKBENCH_DIR);
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    let dev = dev_repo_root().join("workbenches").join("office-agent");
    if dev.exists() {
        return Some(dev);
    }
    None
}

pub(crate) fn bundled_officecli_windows_binary(app: &AppHandle) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(
            resource_dir
                .join(RESOURCE_OFFICE_DIR)
                .join("windows-x64")
                .join("officecli.exe"),
        );
    }
    if let Ok(current_exe) = env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(
                exe_dir
                    .join(RESOURCE_OFFICE_DIR)
                    .join("windows-x64")
                    .join("officecli.exe"),
            );
            candidates.push(
                exe_dir
                    .join("resources")
                    .join(RESOURCE_OFFICE_DIR)
                    .join("windows-x64")
                    .join("officecli.exe"),
            );
        }
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join(RESOURCE_OFFICE_DIR)
            .join("windows-x64")
            .join("officecli.exe"),
    );
    candidates.into_iter().find(|candidate| candidate.is_file())
}

#[cfg(unix)]
fn set_executable_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = fs::metadata(path)
        .map_err(|err| format!("Failed to stat {}: {err}", path.display()))?
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions).map_err(|err| {
        format!(
            "Failed to set executable permissions on {}: {err}",
            path.display()
        )
    })?;
    Ok(())
}

#[cfg(not(unix))]
fn set_executable_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn copy_binary_to_runtime(source: &Path, runtime_root: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(runtime_root)
        .map_err(|err| format!("Failed to create runtime dir {}: {err}", runtime_root.display()))?;
    let file_name = source
        .file_name()
        .ok_or_else(|| format!("Invalid OfficeCLI source path: {}", source.display()))?;
    let target = runtime_root.join(file_name);
    fs::copy(source, &target).map_err(|err| {
        format!(
            "Failed to copy OfficeCLI from {} to {}: {err}",
            source.display(),
            target.display()
        )
    })?;
    set_executable_permissions(&target)?;
    Ok(target)
}

fn command_line_preview(bin_path: &Path, args: &[String]) -> String {
    let mut parts = vec![format!("\"{}\"", bin_path.display())];
    parts.extend(args.iter().map(|arg| {
        if arg.contains(' ') {
            format!("\"{arg}\"")
        } else {
            arg.clone()
        }
    }));
    parts.join(" ")
}

async fn run_officecli(
    bin_path: &str,
    args: Vec<String>,
    workspace_dir: Option<String>,
) -> Result<OfficeCommandResult, String> {
    let mut process = tokio_command(bin_path);
    process.args(&args);
    process.stdout(Stdio::piped());
    process.stderr(Stdio::piped());

    if let Some(path) = workspace_dir {
        process.current_dir(path);
    }

    let output = timeout(Duration::from_secs(120), process.output())
        .await
        .map_err(|_| "OfficeCLI command timed out after 120 seconds.".to_string())?
        .map_err(|err| format!("Failed to run OfficeCLI: {err}"))?;

    Ok(OfficeCommandResult {
        success: output.status.success(),
        exit_code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        command_line: command_line_preview(Path::new(bin_path), &args),
        bin_path: bin_path.to_string(),
    })
}

async fn read_officecli_version(bin_path: &Path) -> Option<String> {
    let mut command = tokio_command(bin_path);
    command.arg("--version");
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    let output = match timeout(Duration::from_secs(5), command.output()).await {
        Ok(Ok(output)) => output,
        _ => return None,
    };
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        None
    } else {
        Some(stdout)
    }
}

async fn resolve_office_runtime(app: &AppHandle) -> Result<OfficeRuntimeInfo, String> {
    if let Ok(bin) = env::var(ENV_OFFICECLI_BIN) {
        let bin_path = PathBuf::from(bin.trim());
        if bin_path.is_file() {
            let install_dir = bin_path.parent().map(|path| path.to_string_lossy().to_string());
            return Ok(OfficeRuntimeInfo {
                available: true,
                bin_path: Some(bin_path.to_string_lossy().to_string()),
                install_dir,
                source: env::var(ENV_OFFICECLI_SOURCE).unwrap_or_else(|_| "environment".to_string()),
                version: read_officecli_version(&bin_path).await,
                plugin_path: bundled_plugin_dir(app).map(|path| path.to_string_lossy().to_string()),
                workbench_path: bundled_workbench_dir(app)
                    .map(|path| path.to_string_lossy().to_string()),
                message: "OfficeCLI runtime resolved from environment.".to_string(),
            });
        }
    }

    let runtime_root = app_runtime_root(app)?;
    if let Some(bin_path) = find_officecli_binary(&runtime_root, 3) {
        return Ok(OfficeRuntimeInfo {
            available: true,
            bin_path: Some(bin_path.to_string_lossy().to_string()),
            install_dir: Some(runtime_root.to_string_lossy().to_string()),
            source: "app-data".to_string(),
            version: read_officecli_version(&bin_path).await,
            plugin_path: bundled_plugin_dir(app).map(|path| path.to_string_lossy().to_string()),
            workbench_path: bundled_workbench_dir(app)
                .map(|path| path.to_string_lossy().to_string()),
            message: "OfficeCLI runtime resolved from app data.".to_string(),
        });
    }

    for root in bundled_office_roots(app) {
        if let Some(source_bin) = find_officecli_binary(&root, 4) {
            let installed_bin = copy_binary_to_runtime(&source_bin, &runtime_root)?;
            return Ok(OfficeRuntimeInfo {
                available: true,
                bin_path: Some(installed_bin.to_string_lossy().to_string()),
                install_dir: Some(runtime_root.to_string_lossy().to_string()),
                source: "bundled-resource".to_string(),
                version: read_officecli_version(&installed_bin).await,
                plugin_path: bundled_plugin_dir(app).map(|path| path.to_string_lossy().to_string()),
                workbench_path: bundled_workbench_dir(app)
                    .map(|path| path.to_string_lossy().to_string()),
                message: format!(
                    "OfficeCLI runtime copied from bundled resource {}.",
                    source_bin.display()
                ),
            });
        }
    }

    Ok(OfficeRuntimeInfo {
        available: false,
        bin_path: None,
        install_dir: Some(runtime_root.to_string_lossy().to_string()),
        source: "missing".to_string(),
        version: None,
        plugin_path: bundled_plugin_dir(app).map(|path| path.to_string_lossy().to_string()),
        workbench_path: bundled_workbench_dir(app).map(|path| path.to_string_lossy().to_string()),
        message:
            "OfficeCLI runtime not found. Add a platform binary under src-tauri/resources/office-cli before packaging."
                .to_string(),
    })
}

pub(crate) async fn configure_runtime_environment(app: &AppHandle) -> Result<OfficeRuntimeInfo, String> {
    resolve_office_runtime(app).await
}

fn copy_dir_recursive(source: &Path, target: &Path) -> Result<(), String> {
    if !source.exists() {
        return Ok(());
    }
    fs::create_dir_all(target)
        .map_err(|err| format!("Failed to create directory {}: {err}", target.display()))?;
    let entries = fs::read_dir(source)
        .map_err(|err| format!("Failed to read directory {}: {err}", source.display()))?;
    for entry in entries.flatten() {
        let path = entry.path();
        let destination = target.join(entry.file_name());
        if path.is_dir() {
            copy_dir_recursive(&path, &destination)?;
        } else {
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent).map_err(|err| {
                    format!("Failed to create directory {}: {err}", parent.display())
                })?;
            }
            fs::copy(&path, &destination).map_err(|err| {
                format!(
                    "Failed to copy {} to {}: {err}",
                    path.display(),
                    destination.display()
                )
            })?;
        }
    }
    Ok(())
}

pub(crate) fn sync_builtin_assets_to_codex_home(
    app: &AppHandle,
    codex_home: Option<&Path>,
) -> Result<(), String> {
    let Some(codex_home) = codex_home else {
        return Ok(());
    };

    if let Some(plugin_dir) = bundled_plugin_dir(app) {
        let target = codex_home.join("skills").join("office-cli");
        let skill_source = plugin_dir.join("skills").join("office-cli");
        copy_dir_recursive(&skill_source, &target)?;
    }

    if let Some(workbench_dir) = bundled_workbench_dir(app) {
        let target = codex_home.join("workbenches").join("office-agent");
        copy_dir_recursive(&workbench_dir, &target)?;
    }

    Ok(())
}

#[tauri::command]
pub(crate) async fn office_runtime_info(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<OfficeRuntimeInfo, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return Err("Office runtime inspection is only available in local backend mode.".to_string());
    }
    configure_runtime_environment(&app).await
}

#[tauri::command]
pub(crate) async fn office_run_command(
    command: String,
    args: Vec<String>,
    workspace_id: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<OfficeCommandResult, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return Err("Office commands are only available in local backend mode.".to_string());
    }

    let runtime = configure_runtime_environment(&app).await?;
    let bin_path = runtime
        .bin_path
        .ok_or_else(|| runtime.message.clone())?;

    let mut command_args = Vec::with_capacity(args.len() + 1);
    let trimmed_command = command.trim();
    if trimmed_command.is_empty() {
        return Err("Office command is required.".to_string());
    }
    command_args.push(trimmed_command.to_string());
    command_args.extend(args);
    let workspace_dir = workspace_dir_for_id(&state, workspace_id.as_deref()).await;
    run_officecli(&bin_path, command_args, workspace_dir).await
}

#[tauri::command]
pub(crate) async fn office_create_document(
    file_path: String,
    workspace_id: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<OfficeCommandResult, String> {
    let runtime = office_runtime_info(state.clone(), app).await?;
    let bin_path = runtime
        .bin_path
        .ok_or_else(|| runtime.message.clone())?;
    let args = vec!["create".to_string(), file_path];
    let workspace_dir = workspace_dir_for_id(&state, workspace_id.as_deref()).await;
    run_officecli(&bin_path, args, workspace_dir).await
}

#[tauri::command]
pub(crate) async fn office_validate_document(
    file_path: String,
    workspace_id: Option<String>,
    json_output: Option<bool>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<OfficeCommandResult, String> {
    let runtime = office_runtime_info(state.clone(), app).await?;
    let bin_path = runtime
        .bin_path
        .ok_or_else(|| runtime.message.clone())?;
    let mut args = vec!["validate".to_string(), file_path];
    if json_output.unwrap_or(true) {
        args.push("--json".to_string());
    }
    let workspace_dir = workspace_dir_for_id(&state, workspace_id.as_deref()).await;
    run_officecli(&bin_path, args, workspace_dir).await
}

#[tauri::command]
pub(crate) async fn office_view_document(
    file_path: String,
    mode: String,
    workspace_id: Option<String>,
    json_output: Option<bool>,
    render: Option<String>,
    browser: Option<bool>,
    out_path: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<OfficeCommandResult, String> {
    let runtime = office_runtime_info(state.clone(), app).await?;
    let bin_path = runtime
        .bin_path
        .ok_or_else(|| runtime.message.clone())?;
    let trimmed_mode = mode.trim();
    if trimmed_mode.is_empty() {
        return Err("Office view mode is required.".to_string());
    }
    let mut args = vec!["view".to_string(), file_path, trimmed_mode.to_string()];
    if json_output.unwrap_or(false) {
        args.push("--json".to_string());
    }
    if let Some(render) = render.map(|value| value.trim().to_string()) {
        if !render.is_empty() {
            args.push("--render".to_string());
            args.push(render);
        }
    }
    if browser.unwrap_or(false) {
        args.push("--browser".to_string());
    }
    if let Some(out_path) = out_path.map(|value| value.trim().to_string()) {
        if !out_path.is_empty() {
            args.push("--out".to_string());
            args.push(out_path);
        }
    }
    let workspace_dir = workspace_dir_for_id(&state, workspace_id.as_deref()).await;
    run_officecli(&bin_path, args, workspace_dir).await
}

#[tauri::command]
pub(crate) async fn office_document_issues(
    file_path: String,
    workspace_id: Option<String>,
    json_output: Option<bool>,
    issue_type: Option<String>,
    limit: Option<u32>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<OfficeCommandResult, String> {
    let runtime = office_runtime_info(state.clone(), app).await?;
    let bin_path = runtime
        .bin_path
        .ok_or_else(|| runtime.message.clone())?;
    let mut args = vec!["view".to_string(), file_path, "issues".to_string()];
    if json_output.unwrap_or(true) {
        args.push("--json".to_string());
    }
    if let Some(issue_type) = issue_type.map(|value| value.trim().to_string()) {
        if !issue_type.is_empty() {
            args.push("--type".to_string());
            args.push(issue_type);
        }
    }
    if let Some(limit) = limit {
        args.push("--limit".to_string());
        args.push(limit.to_string());
    }
    let workspace_dir = workspace_dir_for_id(&state, workspace_id.as_deref()).await;
    run_officecli(&bin_path, args, workspace_dir).await
}

#[tauri::command]
pub(crate) async fn office_merge_template(
    template_path: String,
    output_path: String,
    data_json: String,
    workspace_id: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<OfficeCommandResult, String> {
    let runtime = office_runtime_info(state.clone(), app).await?;
    let bin_path = runtime
        .bin_path
        .ok_or_else(|| runtime.message.clone())?;
    let args = vec![
        "merge".to_string(),
        template_path,
        output_path,
        data_json,
    ];
    let workspace_dir = workspace_dir_for_id(&state, workspace_id.as_deref()).await;
    run_officecli(&bin_path, args, workspace_dir).await
}
