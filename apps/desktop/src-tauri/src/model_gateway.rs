use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{command, AppHandle, Manager, State};
use tokio::time::sleep;

use crate::shared::model_gateway_core::{
    model_gateway_base_url, model_gateway_counts, model_gateway_health_url,
    model_gateway_refresh_models_core, model_gateway_test_provider_core,
    ModelGatewayProviderProbeInput, ModelGatewayProviderProbeResult,
};
use crate::shared::model_gateway_secrets::{
    model_gateway_credit_jwt_clear as clear_credit_jwt_secret,
    model_gateway_credit_jwt_get as get_credit_jwt_secret,
    model_gateway_credit_jwt_set as set_credit_jwt_secret, model_gateway_provider_api_key,
    model_gateway_provider_secret_clear as clear_provider_secret,
    model_gateway_provider_secret_set as set_provider_secret,
    model_gateway_provider_secret_status as provider_secret_status,
};
use crate::shared::process_core::{kill_child_process_tree, tokio_command};
use crate::state::{AppState, ModelGatewayRuntime};
use crate::types::{
    ModelGatewayModelConfig, ModelGatewayProviderConfig, ModelGatewayProviderSecretStatus,
    ModelGatewayRuntimeState, ModelGatewayRuntimeStatus, ModelGatewaySettings,
};

const GATEWAY_TOKEN_ENV: &str = "BLACKRAIN_GATEWAY_API_KEY";
static GENERATED_GATEWAY_TOKEN: OnceLock<String> = OnceLock::new();
const GATEWAY_SCRIPT_ENV: &str = "BLACKRAIN_GATEWAY_SCRIPT";
const GATEWAY_PYTHON_ENV: &str = "BLACKRAIN_GATEWAY_PYTHON";
const WINDOWS_PYTHON_RESOURCE: &str = "python/windows-x64/python.exe";

// credit 模式平台代理地址（M-A2 已部署）。可用 env 覆盖（迁 new-api 时改一处）。
const DEFAULT_CREDIT_PROXY_URL: &str = "https://proxy.goodbyeri.cc/v1";
const CREDIT_PROXY_URL_ENV: &str = "BLACKRAIN_CREDIT_PROXY_URL";
const LEGACY_CREDIT_JWT_FILENAME: &str = "blackrain-credit-jwt";
const CREDIT_JWT_RUNTIME_DIR: &str = "model-gateway";
const CREDIT_JWT_RUNTIME_FILENAME: &str = "credit-jwt.runtime";

fn credit_proxy_url() -> String {
    std::env::var(CREDIT_PROXY_URL_ENV)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_CREDIT_PROXY_URL.to_string())
}

fn legacy_credit_jwt_path() -> Result<PathBuf, String> {
    let codex_home = crate::codex::home::resolve_default_codex_home()
        .ok_or_else(|| "Unable to resolve CODEX_HOME".to_string())?;
    Ok(codex_home.join(LEGACY_CREDIT_JWT_FILENAME))
}

fn runtime_credit_jwt_path(data_dir: &Path) -> PathBuf {
    data_dir
        .join(CREDIT_JWT_RUNTIME_DIR)
        .join(CREDIT_JWT_RUNTIME_FILENAME)
}

fn remove_file_if_exists(path: &Path) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(format!("Failed to remove {}: {err}", path.display())),
    }
}

#[cfg(not(target_os = "windows"))]
fn replace_file_atomic(source: &Path, destination: &Path) -> std::io::Result<()> {
    std::fs::rename(source, destination)
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

fn write_runtime_credit_jwt(data_dir: &Path, token: &str) -> Result<PathBuf, String> {
    let path = runtime_credit_jwt_path(data_dir);
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid model gateway runtime credential path".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|err| format!("Failed to create model gateway runtime directory: {err}"))?;
    let temp_path = parent.join(format!(".credit-jwt-{}.tmp", uuid::Uuid::new_v4().simple()));
    let write_result = (|| -> Result<(), String> {
        std::fs::write(&temp_path, token)
            .map_err(|err| format!("Failed to write model gateway runtime credential: {err}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&temp_path, std::fs::Permissions::from_mode(0o600)).map_err(
                |err| format!("Failed to secure model gateway runtime credential: {err}"),
            )?;
        }
        replace_file_atomic(&temp_path, &path)
            .map_err(|err| format!("Failed to replace model gateway runtime credential: {err}"))
    })();
    if let Err(err) = write_result {
        let _ = std::fs::remove_file(&temp_path);
        return Err(err);
    }
    Ok(path)
}

fn prepare_credit_jwt_runtime_file(data_dir: &Path) -> Result<Option<PathBuf>, String> {
    let stored_token = get_credit_jwt_secret().ok().flatten();
    let legacy_path = legacy_credit_jwt_path().ok();
    let legacy_token = legacy_path
        .as_ref()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let token = stored_token.clone().or_else(|| legacy_token.clone());
    let Some(token) = token else {
        remove_file_if_exists(&runtime_credit_jwt_path(data_dir))?;
        return Ok(None);
    };

    let runtime_path = write_runtime_credit_jwt(data_dir, &token)?;
    if stored_token.is_none() && legacy_token.is_some() && set_credit_jwt_secret(&token).is_ok() {
        if let Some(path) = legacy_path.as_deref() {
            remove_file_if_exists(path)?;
        }
    }
    Ok(Some(runtime_path))
}

fn now_unix_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn app_data_dir(state: &AppState) -> Result<PathBuf, String> {
    state
        .settings_path
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Unable to resolve app data directory".to_string())
}

fn update_runtime_shape(
    runtime: &mut ModelGatewayRuntime,
    settings: &ModelGatewaySettings,
    data_dir: &Path,
) {
    let (provider_count, model_count) = model_gateway_counts(settings);
    runtime.status.port = settings.port;
    runtime.status.base_url = model_gateway_base_url(settings.port);
    runtime.status.log_path = data_dir
        .join("model-gateway.log")
        .to_string_lossy()
        .to_string();
    runtime.status.provider_count = provider_count;
    runtime.status.model_count = model_count;
}

fn find_provider<'a>(
    settings: &'a ModelGatewaySettings,
    provider_id: &str,
) -> Result<&'a ModelGatewayProviderConfig, String> {
    let provider_id = provider_id.trim();
    settings
        .providers
        .iter()
        .find(|provider| provider.id == provider_id)
        .ok_or_else(|| format!("Unknown model provider `{provider_id}`."))
}

fn gateway_registry_env_with_secrets(
    settings: &ModelGatewaySettings,
    credit_jwt_path: Option<&Path>,
) -> Result<String, String> {
    let mut value = serde_json::to_value(&settings.providers).map_err(|err| err.to_string())?;
    let providers = value
        .as_array_mut()
        .ok_or_else(|| "Model gateway providers must serialize to an array.".to_string())?;
    let mut enabled_count = 0usize;
    let mut configured_count = 0usize;
    let mut missing = Vec::new();

    // credit 模式：登录后 JWT 文件就位。deepseek provider 改指平台代理、用 JWT 文件鉴权，
    // 不依赖 keychain key。dev/BYOK（无 JWT 文件）则走原有 keychain/env 路径。
    let credit_active = credit_jwt_path.is_some();
    let proxy_url = credit_proxy_url();

    for (index, item) in providers.iter_mut().enumerate() {
        let Some(provider) = settings.providers.get(index) else {
            continue;
        };
        if !provider.enabled {
            continue;
        }
        enabled_count += 1;

        // credit 模式下的 deepseek：注入代理 base_url + JWT 文件路径，视为已配置。
        if credit_active && provider.id == "deepseek" {
            if let (Some(object), Some(path)) = (item.as_object_mut(), credit_jwt_path) {
                object.insert(
                    "baseUrl".to_string(),
                    serde_json::Value::String(proxy_url.clone()),
                );
                object.insert(
                    "apiKeyFile".to_string(),
                    serde_json::Value::String(path.to_string_lossy().to_string()),
                );
                // 清掉可能残留的 inline key，确保走文件。
                object.remove("apiKey");
                configured_count += 1;
                continue;
            }
        }

        match model_gateway_provider_api_key(&provider.id, &provider.api_key_env)? {
            Some(api_key) => {
                configured_count += 1;
                if let Some(object) = item.as_object_mut() {
                    object.insert("apiKey".to_string(), serde_json::Value::String(api_key));
                }
            }
            None => {
                missing.push(format!("{} ({})", provider.name, provider.api_key_env));
            }
        }
    }

    if enabled_count == 0 {
        return Err("No enabled model provider is configured.".to_string());
    }
    if configured_count == 0 {
        return Err(format!(
            "No enabled model provider has an API key configured. Save an API key in Settings or set env: {}.",
            missing.join(", ")
        ));
    }

    serde_json::to_string(providers).map_err(|err| err.to_string())
}

fn path_with_gateway_script(start: &Path) -> Option<PathBuf> {
    let mut current = Some(start);
    while let Some(path) = current {
        let candidate = path.join("gateway").join("gateway.py");
        if candidate.is_file() {
            return Some(candidate);
        }
        current = path.parent();
    }
    None
}

fn gateway_script_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(value) = std::env::var(GATEWAY_SCRIPT_ENV) {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            candidates.push(PathBuf::from(trimmed));
        }
    }
    if let Ok(current_dir) = std::env::current_dir() {
        if let Some(path) = path_with_gateway_script(&current_dir) {
            candidates.push(path);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            if let Some(path) = path_with_gateway_script(parent) {
                candidates.push(path);
            }
        }
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("gateway").join("gateway.py"));
    }
    candidates
}

fn resolve_gateway_script(app: &AppHandle) -> Result<PathBuf, String> {
    let candidates = gateway_script_candidates(app);
    for candidate in &candidates {
        if candidate.is_file() {
            return Ok(candidate.to_path_buf());
        }
    }
    let searched = candidates
        .iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(", ");
    Err(format!(
        "Unable to locate gateway.py. Set {GATEWAY_SCRIPT_ENV} or bundle gateway/gateway.py. Tried: {searched}"
    ))
}

fn bundled_gateway_python(app: &AppHandle) -> Option<PathBuf> {
    if !cfg!(target_os = "windows") {
        return None;
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidate = resource_dir.join(WINDOWS_PYTHON_RESOURCE);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    let candidate = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join(WINDOWS_PYTHON_RESOURCE);
    candidate.is_file().then_some(candidate)
}

fn gateway_python(app: &AppHandle) -> String {
    std::env::var(GATEWAY_PYTHON_ENV)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| bundled_gateway_python(app).map(|path| path.to_string_lossy().to_string()))
        .unwrap_or_else(|| {
            if cfg!(target_os = "windows") {
                "python".to_string()
            } else {
                "python3".to_string()
            }
        })
}

async fn gateway_health(port: u16) -> Result<(), String> {
    let url = model_gateway_health_url(port);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|err| err.to_string())?;
    let response = client
        .get(url.clone())
        .send()
        .await
        .map_err(|err| format!("Gateway health check failed at `{url}`: {err}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Gateway health check returned HTTP {} at `{url}`.",
            response.status()
        ));
    }
    // 校验返回体确实是 BlackRain 网关，避免把端口上的陌生进程误判为 Running，
    // 同时仍能识别 dev-client.sh 独立起的同款网关，不重复 spawn。
    let body = response
        .text()
        .await
        .map_err(|err| format!("Gateway health check failed to read body at `{url}`: {err}"))?;
    let payload: serde_json::Value = serde_json::from_str(&body)
        .map_err(|_| format!("Gateway health check at `{url}` returned non-JSON body."))?;
    if payload.get("service").and_then(|v| v.as_str()) == Some("blackrain-gateway") {
        Ok(())
    } else {
        Err(format!(
            "A non-BlackRain service is listening at `{url}`; refusing to treat it as the gateway."
        ))
    }
}

async fn refresh_runtime(
    runtime: &mut ModelGatewayRuntime,
    settings: &ModelGatewaySettings,
    data_dir: &Path,
) {
    update_runtime_shape(runtime, settings, data_dir);
    // 端口被改但旧进程还在跑：先把旧端口上的子进程收掉，避免残留/泄漏，
    // 再按「无 child」路径处理，让用户用新端口重启。
    if runtime.child.is_some() && runtime.child_port.is_some_and(|p| p != settings.port) {
        stop_runtime_child(runtime).await;
        runtime.status.state = ModelGatewayRuntimeState::Stopped;
        runtime.status.pid = None;
        runtime.status.started_at_ms = None;
        runtime.status.last_error = None;
    }
    let Some(child) = runtime.child.as_mut() else {
        if gateway_health(settings.port).await.is_ok() {
            runtime.status.state = ModelGatewayRuntimeState::Running;
            runtime.status.last_error = None;
        } else if matches!(runtime.status.state, ModelGatewayRuntimeState::Running) {
            runtime.status.state = ModelGatewayRuntimeState::Stopped;
            runtime.status.pid = None;
            runtime.status.started_at_ms = None;
        }
        return;
    };

    match child.try_wait() {
        Ok(Some(status)) => {
            let pid = child.id();
            runtime.child = None;
            runtime.child_port = None;
            if status.success() {
                runtime.status.state = ModelGatewayRuntimeState::Stopped;
                runtime.status.pid = None;
                runtime.status.started_at_ms = None;
                runtime.status.last_error = None;
            } else {
                runtime.status.state = ModelGatewayRuntimeState::Error;
                runtime.status.pid = pid;
                runtime.status.last_error = Some(format!("Gateway exited with status: {status}"));
            }
        }
        Ok(None) => {
            runtime.status.pid = child.id();
            if gateway_health(settings.port).await.is_ok() {
                runtime.status.state = ModelGatewayRuntimeState::Running;
                runtime.status.last_error = None;
            }
        }
        Err(err) => {
            runtime.status.state = ModelGatewayRuntimeState::Error;
            runtime.status.pid = child.id();
            runtime.status.last_error = Some(format!("Failed to inspect gateway process: {err}"));
        }
    }
}

async fn stop_runtime_child(runtime: &mut ModelGatewayRuntime) {
    if let Some(mut child) = runtime.child.take() {
        kill_child_process_tree(&mut child).await;
        let _ = child.wait().await;
    }
    runtime.child_port = None;
}

async fn wait_until_gateway_healthy(port: u16) -> Result<(), String> {
    let mut last_error = None;
    for _ in 0..25 {
        match gateway_health(port).await {
            Ok(()) => return Ok(()),
            Err(err) => last_error = Some(err),
        }
        sleep(Duration::from_millis(120)).await;
    }
    Err(last_error.unwrap_or_else(|| "Gateway did not become healthy.".to_string()))
}

/// 解析 App 与本地网关之间的能力 token，并保证它存在于 App 进程环境里，
/// 使被 spawn 的 Codex app-server 能继承同一个值。返回生效 token，
/// 供网关进程用同一份值，避免两侧不一致导致 401。
fn ensure_gateway_token() -> String {
    let token = std::env::var(GATEWAY_TOKEN_ENV)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            GENERATED_GATEWAY_TOKEN
                .get_or_init(|| uuid::Uuid::new_v4().to_string())
                .clone()
        });
    std::env::set_var(GATEWAY_TOKEN_ENV, &token);
    token
}

async fn start_model_gateway_runtime(
    app: &AppHandle,
    state: &AppState,
) -> Result<ModelGatewayRuntimeStatus, String> {
    let data_dir = app_data_dir(state)?;
    let settings = state.app_settings.lock().await.model_gateway.clone();
    if !settings.enabled {
        return Err("Model gateway is disabled in settings.".to_string());
    }
    let script = resolve_gateway_script(app)?;
    let log_path = data_dir.join("model-gateway.log");
    let gateway_token = ensure_gateway_token();
    let credit_jwt_path = prepare_credit_jwt_runtime_file(&data_dir)?;
    let registry_json = gateway_registry_env_with_secrets(&settings, credit_jwt_path.as_deref())?;

    let mut runtime = state.model_gateway.lock().await;
    refresh_runtime(&mut runtime, &settings, &data_dir).await;
    if matches!(runtime.status.state, ModelGatewayRuntimeState::Running)
        && runtime.status.port == settings.port
        && gateway_health(settings.port).await.is_ok()
    {
        return Ok(runtime.status.clone());
    }
    if runtime.child.is_some() {
        stop_runtime_child(&mut runtime).await;
    }

    let mut command = tokio_command(gateway_python(app));
    command
        .arg(&script)
        .env("GW_PORT", settings.port.to_string())
        .env("GW_LOG", &log_path)
        .env("BLACKRAIN_MODEL_GATEWAY_PROVIDERS", registry_json)
        .env("BLACKRAIN_GATEWAY_API_KEY", &gateway_token)
        .env("PYTHONDONTWRITEBYTECODE", "1")
        .env("PYTHONUTF8", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let child = command
        .spawn()
        .map_err(|err| format!("Failed to start BlackRain Gateway: {err}"))?;

    runtime.status.state = ModelGatewayRuntimeState::Running;
    runtime.status.pid = child.id();
    runtime.status.started_at_ms = Some(now_unix_ms());
    runtime.status.last_error = None;
    update_runtime_shape(&mut runtime, &settings, &data_dir);
    runtime.child = Some(child);
    runtime.child_port = Some(settings.port);

    match wait_until_gateway_healthy(settings.port).await {
        Ok(()) => {
            refresh_runtime(&mut runtime, &settings, &data_dir).await;
            Ok(runtime.status.clone())
        }
        Err(err) => {
            stop_runtime_child(&mut runtime).await;
            runtime.status.state = ModelGatewayRuntimeState::Error;
            runtime.status.pid = None;
            runtime.status.started_at_ms = None;
            runtime.status.last_error = Some(err.clone());
            Err(err)
        }
    }
}

async fn stop_model_gateway_runtime(state: &AppState) -> Result<ModelGatewayRuntimeStatus, String> {
    let data_dir = app_data_dir(state)?;
    let settings = state.app_settings.lock().await.model_gateway.clone();
    let mut runtime = state.model_gateway.lock().await;
    stop_runtime_child(&mut runtime).await;
    update_runtime_shape(&mut runtime, &settings, &data_dir);
    runtime.status.state = ModelGatewayRuntimeState::Stopped;
    runtime.status.pid = None;
    runtime.status.started_at_ms = None;
    runtime.status.last_error = None;
    remove_file_if_exists(&runtime_credit_jwt_path(&data_dir))?;
    Ok(runtime.status.clone())
}

async fn model_gateway_runtime_status(
    state: &AppState,
) -> Result<ModelGatewayRuntimeStatus, String> {
    let data_dir = app_data_dir(state)?;
    let settings = state.app_settings.lock().await.model_gateway.clone();
    let mut runtime = state.model_gateway.lock().await;
    refresh_runtime(&mut runtime, &settings, &data_dir).await;
    Ok(runtime.status.clone())
}

pub(crate) async fn model_gateway_start_for_app(
    app: AppHandle,
) -> Result<ModelGatewayRuntimeStatus, String> {
    let state = app.state::<AppState>();
    start_model_gateway_runtime(&app, &state).await
}

pub(crate) async fn model_gateway_stop_for_state(
    state: State<'_, AppState>,
) -> Result<ModelGatewayRuntimeStatus, String> {
    stop_model_gateway_runtime(&state).await
}

#[command]
pub(crate) async fn model_gateway_test_provider(
    input: ModelGatewayProviderProbeInput,
) -> Result<ModelGatewayProviderProbeResult, String> {
    model_gateway_test_provider_core(input).await
}

#[command]
pub(crate) async fn model_gateway_refresh_models(
    input: ModelGatewayProviderProbeInput,
) -> Result<Vec<ModelGatewayModelConfig>, String> {
    model_gateway_refresh_models_core(input).await
}

#[command]
pub(crate) async fn model_gateway_provider_secret_status(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<ModelGatewayProviderSecretStatus, String> {
    let settings = state.app_settings.lock().await.model_gateway.clone();
    let provider = find_provider(&settings, &provider_id)?;
    Ok(provider_secret_status(&provider.id, &provider.api_key_env))
}

#[command]
pub(crate) async fn model_gateway_provider_secret_set(
    provider_id: String,
    api_key: String,
    state: State<'_, AppState>,
) -> Result<ModelGatewayProviderSecretStatus, String> {
    let settings = state.app_settings.lock().await.model_gateway.clone();
    let provider = find_provider(&settings, &provider_id)?;
    set_provider_secret(&provider.id, &api_key)?;
    Ok(provider_secret_status(&provider.id, &provider.api_key_env))
}

#[command]
pub(crate) async fn model_gateway_provider_secret_clear(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<ModelGatewayProviderSecretStatus, String> {
    let settings = state.app_settings.lock().await.model_gateway.clone();
    let provider = find_provider(&settings, &provider_id)?;
    clear_provider_secret(&provider.id)?;
    Ok(provider_secret_status(&provider.id, &provider.api_key_env))
}

#[command]
pub(crate) async fn model_gateway_daemon_start(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ModelGatewayRuntimeStatus, String> {
    start_model_gateway_runtime(&app, &state).await
}

#[command]
pub(crate) async fn model_gateway_daemon_stop(
    state: State<'_, AppState>,
) -> Result<ModelGatewayRuntimeStatus, String> {
    stop_model_gateway_runtime(&state).await
}

#[command]
pub(crate) async fn model_gateway_daemon_status(
    state: State<'_, AppState>,
) -> Result<ModelGatewayRuntimeStatus, String> {
    model_gateway_runtime_status(&state).await
}

// Credential Manager 保存规范副本；Gateway 只读取 BlackRain app-data 下的短期运行文件。
#[command]
pub(crate) async fn model_gateway_credit_jwt_set(
    jwt: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = jwt.trim();
    if token.is_empty() {
        return model_gateway_credit_jwt_clear(state).await;
    }
    set_credit_jwt_secret(token)?;
    let data_dir = app_data_dir(&state)?;
    write_runtime_credit_jwt(&data_dir, token)?;
    if let Ok(path) = legacy_credit_jwt_path() {
        remove_file_if_exists(&path)?;
    }
    Ok(())
}

// 登出/会话失效：同时清理凭据、运行时桥和旧版 Home 文件。
#[command]
pub(crate) async fn model_gateway_credit_jwt_clear(
    state: State<'_, AppState>,
) -> Result<(), String> {
    // 即使 Credential Manager 暂时不可用，也必须继续尝试清掉磁盘上的运行时桥，
    // 避免登出命令因第一个错误提前返回而留下仍可被 Gateway 使用的 token。
    let credential_result = clear_credit_jwt_secret();
    let runtime_result = app_data_dir(&state)
        .and_then(|data_dir| remove_file_if_exists(&runtime_credit_jwt_path(&data_dir)));
    let legacy_result =
        legacy_credit_jwt_path().map_or(Ok(()), |path| remove_file_if_exists(&path));

    credential_result.and(runtime_result).and(legacy_result)
}

// 重启网关：模式切换（credit↔dev/BYOK）会改 base_url，必须重起进程才能生效。
// JWT 在同一 credit 模式内刷新不需要调它（网关每请求读文件）。
#[command]
pub(crate) async fn model_gateway_daemon_restart(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ModelGatewayRuntimeStatus, String> {
    let _ = stop_model_gateway_runtime(&state).await;
    start_model_gateway_runtime(&app, &state).await
}

#[cfg(test)]
mod tests {
    use super::{
        gateway_registry_env_with_secrets, remove_file_if_exists, runtime_credit_jwt_path,
        write_runtime_credit_jwt, CREDIT_JWT_RUNTIME_DIR, CREDIT_JWT_RUNTIME_FILENAME,
    };
    use crate::types::{
        ModelGatewayProviderConfig, ModelGatewayProviderKind, ModelGatewaySettings,
    };
    use serde_json::Value;
    use std::path::PathBuf;

    fn test_data_dir() -> PathBuf {
        std::env::temp_dir().join(format!(
            "blackrain-model-gateway-test-{}",
            uuid::Uuid::new_v4()
        ))
    }

    fn credit_settings() -> ModelGatewaySettings {
        ModelGatewaySettings {
            enabled: true,
            port: 8899,
            default_model: Some("deepseek-v4-flash".to_string()),
            providers: vec![ModelGatewayProviderConfig {
                id: "deepseek".to_string(),
                name: "DeepSeek".to_string(),
                kind: ModelGatewayProviderKind::Deepseek,
                base_url: "https://api.deepseek.com/v1".to_string(),
                api_key_env: "DEEPSEEK_API_KEY".to_string(),
                api_key_file: String::new(),
                enabled: true,
                models: Vec::new(),
            }],
        }
    }

    #[test]
    fn runtime_credit_jwt_path_stays_under_app_data() {
        let data_dir = PathBuf::from("blackrain-app-data");

        assert_eq!(
            runtime_credit_jwt_path(&data_dir),
            data_dir
                .join(CREDIT_JWT_RUNTIME_DIR)
                .join(CREDIT_JWT_RUNTIME_FILENAME)
        );
    }

    #[test]
    fn credit_registry_points_to_app_data_runtime_file() {
        let data_dir = PathBuf::from("blackrain-app-data");
        let runtime_path = runtime_credit_jwt_path(&data_dir);
        let registry =
            gateway_registry_env_with_secrets(&credit_settings(), Some(runtime_path.as_path()))
                .expect("build credit registry");
        let providers: Vec<Value> = serde_json::from_str(&registry).expect("parse registry");
        let provider = providers[0].as_object().expect("provider object");

        assert_eq!(
            provider.get("apiKeyFile").and_then(Value::as_str),
            Some(runtime_path.to_string_lossy().as_ref())
        );
        assert!(!provider.contains_key("apiKey"));
    }

    #[test]
    fn runtime_credit_jwt_file_can_be_replaced_and_cleared() {
        let data_dir = test_data_dir();
        let runtime_path = write_runtime_credit_jwt(&data_dir, "first-token")
            .expect("write initial runtime token");
        assert_eq!(
            std::fs::read_to_string(&runtime_path).expect("read initial token"),
            "first-token"
        );

        write_runtime_credit_jwt(&data_dir, "refreshed-token").expect("replace runtime token");
        assert_eq!(
            std::fs::read_to_string(&runtime_path).expect("read refreshed token"),
            "refreshed-token"
        );

        remove_file_if_exists(&runtime_path).expect("remove runtime token");
        remove_file_if_exists(&runtime_path).expect("remove missing runtime token");
        assert!(!runtime_path.exists());
        std::fs::remove_dir_all(&data_dir).expect("remove test data directory");
    }
}
