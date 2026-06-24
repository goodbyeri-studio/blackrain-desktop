use std::path::Path;
use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use toml_edit::{value, Item, Table};

use crate::shared::config_toml_core;
use crate::shared::model_gateway_secrets::model_gateway_provider_api_key;
use crate::types::{ModelGatewayModelConfig, ModelGatewaySettings};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModelGatewayProviderProbeInput {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) base_url: String,
    pub(crate) api_key_env: String,
    #[serde(default, rename = "apiKey", skip_serializing)]
    pub(crate) api_key: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModelGatewayProviderProbeResult {
    pub(crate) ok: bool,
    pub(crate) status: Option<u16>,
    pub(crate) message: String,
    pub(crate) model_count: usize,
    pub(crate) models: Vec<ModelGatewayModelConfig>,
}

pub(crate) async fn model_gateway_test_provider_core(
    input: ModelGatewayProviderProbeInput,
) -> Result<ModelGatewayProviderProbeResult, String> {
    let response = fetch_provider_models(&input).await?;
    let status = response.status;
    let models = response.models;
    Ok(ModelGatewayProviderProbeResult {
        ok: status
            .map(|value| (200..300).contains(&value))
            .unwrap_or(false),
        status,
        message: format!(
            "Connected to {}. Found {} models.",
            input.name,
            models.len()
        ),
        model_count: models.len(),
        models,
    })
}

pub(crate) async fn model_gateway_refresh_models_core(
    input: ModelGatewayProviderProbeInput,
) -> Result<Vec<ModelGatewayModelConfig>, String> {
    let response = fetch_provider_models(&input).await?;
    if response.models.is_empty() {
        return Err(format!(
            "Provider `{}` returned no models from /models.",
            input.id
        ));
    }
    Ok(response.models)
}

#[allow(dead_code)]
pub(crate) fn model_gateway_base_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/v1")
}

#[allow(dead_code)]
pub(crate) fn model_gateway_health_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/v1/health")
}

#[allow(dead_code)]
pub(crate) fn model_gateway_registry_env(
    settings: &ModelGatewaySettings,
) -> Result<String, String> {
    serde_json::to_string(&settings.providers).map_err(|err| err.to_string())
}

#[allow(dead_code)]
pub(crate) fn model_gateway_counts(settings: &ModelGatewaySettings) -> (usize, usize) {
    let enabled_providers = settings
        .providers
        .iter()
        .filter(|provider| provider.enabled)
        .count();
    let enabled_models = settings
        .providers
        .iter()
        .filter(|provider| provider.enabled)
        .map(|provider| provider.models.len())
        .sum();
    (enabled_providers, enabled_models)
}

#[allow(dead_code)]
pub(crate) fn persist_blackrain_gateway_codex_config(
    codex_home: &Path,
    settings: &ModelGatewaySettings,
) -> Result<(), String> {
    let (_, mut document) = config_toml_core::load_global_config_document(codex_home)?;
    config_toml_core::set_top_level_string(
        &mut document,
        "model",
        settings.default_model.as_deref(),
    );
    config_toml_core::set_top_level_string(
        &mut document,
        "model_provider",
        Some("blackrain_gateway"),
    );

    let providers = config_toml_core::ensure_table(&mut document, "model_providers")?;
    if providers
        .get("blackrain_gateway")
        .and_then(Item::as_table)
        .is_none()
    {
        providers["blackrain_gateway"] = Item::Table(Table::new());
    }
    let provider = providers["blackrain_gateway"]
        .as_table_mut()
        .ok_or_else(|| "`model_providers.blackrain_gateway` must be a table".to_string())?;
    provider["name"] = value("BlackRain Gateway");
    provider["base_url"] = value(model_gateway_base_url(settings.port));
    provider["env_key"] = value("BLACKRAIN_GATEWAY_API_KEY");
    provider["wire_api"] = value("responses");

    config_toml_core::persist_global_config_document(codex_home, &document)
}

struct ProviderModelsResponse {
    status: Option<u16>,
    models: Vec<ModelGatewayModelConfig>,
}

async fn fetch_provider_models(
    input: &ModelGatewayProviderProbeInput,
) -> Result<ProviderModelsResponse, String> {
    validate_probe_input(input)?;
    let inline_key = input
        .api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string);
    // 内联 key 优先；否则统一走「系统凭据优先 → 环境变量兜底」，
    // 使 App 命令与 Daemon RPC 的密钥来源一致。
    let api_key = match inline_key {
        Some(key) => key,
        None => model_gateway_provider_api_key(input.id.trim(), input.api_key_env.trim())?
            .ok_or_else(|| {
                format!(
                    "Missing API key for provider `{}`. Save an API key in Settings or set env `{}`.",
                    input.id.trim(),
                    input.api_key_env.trim()
                )
            })?,
    };
    let url = provider_models_url(input.base_url.trim())?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|err| err.to_string())?;
    let mut headers = HeaderMap::new();
    let bearer = format!("Bearer {api_key}");
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&bearer).map_err(|_| "Invalid API key header.".to_string())?,
    );
    let response = client
        .get(url.clone())
        .headers(headers)
        .send()
        .await
        .map_err(|err| format!("Failed to reach `{url}`: {err}"))?;
    let status = response.status();
    let status_code = status.as_u16();
    let text = response
        .text()
        .await
        .map_err(|err| format!("Failed to read `{url}` response: {err}"))?;
    if !status.is_success() {
        return Err(format!(
            "Provider `{}` /models returned HTTP {}: {}",
            input.id.trim(),
            status_code,
            summarize_body(&text)
        ));
    }
    let value: Value = serde_json::from_str(&text).map_err(|err| {
        format!(
            "Provider `{}` returned invalid JSON: {err}",
            input.id.trim()
        )
    })?;
    Ok(ProviderModelsResponse {
        status: Some(status_code),
        models: parse_models_response(&value),
    })
}

fn validate_probe_input(input: &ModelGatewayProviderProbeInput) -> Result<(), String> {
    if input.id.trim().is_empty() {
        return Err("Provider id is required.".to_string());
    }
    if input.base_url.trim().is_empty() {
        return Err(format!(
            "Provider `{}` base URL is required.",
            input.id.trim()
        ));
    }
    if input.api_key_env.trim().is_empty() {
        return Err(format!(
            "Provider `{}` API key env is required.",
            input.id.trim()
        ));
    }
    Ok(())
}

fn provider_models_url(base_url: &str) -> Result<String, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Provider base URL is required.".to_string());
    }
    if trimmed.ends_with("/models") {
        return Ok(trimmed.to_string());
    }
    if trimmed.ends_with("/chat/completions") {
        let parent = trimmed.trim_end_matches("/chat/completions");
        return Ok(format!("{parent}/models"));
    }
    Ok(format!("{trimmed}/models"))
}

fn parse_models_response(value: &Value) -> Vec<ModelGatewayModelConfig> {
    let Some(items) = value.get("data").and_then(Value::as_array) else {
        return Vec::new();
    };
    let mut models: Vec<ModelGatewayModelConfig> = items
        .iter()
        .enumerate()
        .filter_map(|(index, item)| model_from_value(item, index))
        .collect();
    if !models.is_empty() && !models.iter().any(|model| model.is_default) {
        if let Some(first) = models.first_mut() {
            first.is_default = true;
        }
    }
    models
}

fn model_from_value(item: &Value, index: usize) -> Option<ModelGatewayModelConfig> {
    let id = string_field(item, &["id", "model"])?;
    let display_name =
        string_field(item, &["displayName", "display_name", "name"]).unwrap_or_else(|| id.clone());
    let description = string_field(item, &["description", "owned_by", "owner"]).unwrap_or_default();
    let is_default = item
        .get("isDefault")
        .or_else(|| item.get("is_default"))
        .and_then(Value::as_bool)
        .unwrap_or(index == 0);
    Some(ModelGatewayModelConfig {
        id,
        display_name,
        description,
        is_default,
    })
}

fn string_field(item: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        let Some(value) = item.get(key) else {
            continue;
        };
        if let Some(text) = value.as_str() {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

fn summarize_body(body: &str) -> String {
    let collapsed = body.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut chars = collapsed.chars();
    let truncated = chars.by_ref().take(240).collect::<String>();
    if chars.next().is_some() {
        format!("{truncated}...")
    } else if collapsed.is_empty() {
        "<empty body>".to_string()
    } else {
        collapsed
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        model_gateway_counts, model_gateway_registry_env, parse_models_response,
        persist_blackrain_gateway_codex_config, provider_models_url,
    };
    use crate::types::{
        ModelGatewayModelConfig, ModelGatewayProviderConfig, ModelGatewayProviderKind,
        ModelGatewaySettings,
    };

    fn sample_gateway_settings() -> ModelGatewaySettings {
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
                enabled: true,
                models: vec![ModelGatewayModelConfig {
                    id: "deepseek-v4-flash".to_string(),
                    display_name: "DeepSeek V4 Flash".to_string(),
                    description: String::new(),
                    is_default: true,
                }],
            }],
        }
    }

    #[test]
    fn provider_models_url_appends_models() {
        assert_eq!(
            provider_models_url("https://example.com/v1").expect("url"),
            "https://example.com/v1/models"
        );
        assert_eq!(
            provider_models_url("https://example.com/v1/models").expect("url"),
            "https://example.com/v1/models"
        );
        assert_eq!(
            provider_models_url("https://example.com/v1/chat/completions").expect("url"),
            "https://example.com/v1/models"
        );
    }

    #[test]
    fn parse_models_response_reads_openai_compatible_list() {
        let value = json!({
            "object": "list",
            "data": [
                {"id": "qwen3-coder-plus", "display_name": "Qwen3 Coder Plus"},
                {"model": "glm-4.5", "description": "coding"}
            ]
        });
        let models = parse_models_response(&value);
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].id, "qwen3-coder-plus");
        assert_eq!(models[0].display_name, "Qwen3 Coder Plus");
        assert!(models[0].is_default);
        assert_eq!(models[1].id, "glm-4.5");
        assert_eq!(models[1].description, "coding");
    }

    #[test]
    fn registry_env_and_counts_follow_enabled_providers() {
        let settings = sample_gateway_settings();
        let env = model_gateway_registry_env(&settings).expect("serialize registry");
        assert!(env.contains("DEEPSEEK_API_KEY"));
        assert_eq!(model_gateway_counts(&settings), (1, 1));
    }

    #[test]
    fn persists_blackrain_gateway_codex_config() {
        let root = std::env::temp_dir().join(format!(
            "blackrain-gateway-config-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).expect("create temp codex home");

        persist_blackrain_gateway_codex_config(&root, &sample_gateway_settings())
            .expect("persist config");

        let config = std::fs::read_to_string(root.join("config.toml")).expect("read config");
        assert!(config.contains("model_provider = \"blackrain_gateway\""));
        assert!(config.contains("base_url = \"http://127.0.0.1:8899/v1\""));
        assert!(config.contains("wire_api = \"responses\""));

        let _ = std::fs::remove_dir_all(&root);
    }
}
