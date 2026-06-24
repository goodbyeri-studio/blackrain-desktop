use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{command, AppHandle, Manager, State};
use tokio::time::sleep;

use crate::shared::model_gateway_core::{
    model_gateway_base_url, model_gateway_counts, model_gateway_health_url,
    model_gateway_refresh_models_core, model_gateway_test_provider_core,
    persist_blackrain_gateway_codex_config, ModelGatewayProviderProbeInput,
    ModelGatewayProviderProbeResult,
};
use crate::shared::model_gateway_secrets::{
    model_gateway_provider_api_key, model_gateway_provider_secret_clear as clear_provider_secret,
    model_gateway_provider_secret_set as set_provider_secret,
    model_gateway_provider_secret_status as provider_secret_status,
};
use crate::shared::process_core::{kill_child_process_tree, tokio_command};
use crate::state::{AppState, ModelGatewayRuntime};
use crate::types::{
    ModelGatewayModelConfig, ModelGatewayProviderConfig, ModelGatewayProviderSecretStatus,
    ModelGatewayRuntimeState, ModelGatewayRuntimeStatus, ModelGatewaySettings,
};

const DEFAULT_GATEWAY_TOKEN: &str = "local-app-gateway";
const GATEWAY_SCRIPT_ENV: &str = "BLACKRAIN_GATEWAY_SCRIPT";
const GATEWAY_PYTHON_ENV: &str = "BLACKRAIN_GATEWAY_PYTHON";

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

fn gateway_registry_env_with_secrets(settings: &ModelGatewaySettings) -> Result<String, String> {
    let mut value = serde_json::to_value(&settings.providers).map_err(|err| err.to_string())?;
    let providers = value
        .as_array_mut()
        .ok_or_else(|| "Model gateway providers must serialize to an array.".to_string())?;
    let mut enabled_count = 0usize;
    let mut configured_count = 0usize;
    let mut missing = Vec::new();

    for (index, item) in providers.iter_mut().enumerate() {
        let Some(provider) = settings.providers.get(index) else {
            continue;
        };
        if !provider.enabled {
            continue;
        }
        enabled_count += 1;
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

fn gateway_python() -> String {
    std::env::var(GATEWAY_PYTHON_ENV)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
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
    match std::env::var("BLACKRAIN_GATEWAY_API_KEY") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => {
            std::env::set_var("BLACKRAIN_GATEWAY_API_KEY", DEFAULT_GATEWAY_TOKEN);
            DEFAULT_GATEWAY_TOKEN.to_string()
        }
    }
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
    // 先把 Codex config 写对，与「sidecar 能否启动」解耦：即便后面因缺 key
    // 起不了网关，内核侧 blackrain_gateway provider 配置也已就位，不会缺失。
    let codex_home = crate::codex::home::resolve_default_codex_home()
        .ok_or_else(|| "Unable to resolve CODEX_HOME".to_string())?;
    std::fs::create_dir_all(&codex_home).map_err(|err| {
        format!(
            "Failed to create CODEX_HOME {}: {err}",
            codex_home.display()
        )
    })?;
    persist_blackrain_gateway_codex_config(&codex_home, &settings)?;
    let gateway_token = ensure_gateway_token();
    // registry 构建会在「无启用 provider / 缺 key」时返回 Err；放在写 config 之后，
    // 使配置持久化不被启动失败连带回滚。
    let registry_json = gateway_registry_env_with_secrets(&settings)?;

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

    let mut command = tokio_command(gateway_python());
    command
        .arg(&script)
        .env("GW_PORT", settings.port.to_string())
        .env("GW_LOG", &log_path)
        .env("BLACKRAIN_MODEL_GATEWAY_PROVIDERS", registry_json)
        .env("BLACKRAIN_GATEWAY_API_KEY", &gateway_token)
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
            runtime.status.state = ModelGatewayRuntimeState::Error;
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
