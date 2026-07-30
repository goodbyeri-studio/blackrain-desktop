#![allow(dead_code)]

use keyring::{Entry, Error as KeyringError};

use crate::types::{ModelGatewayProviderSecretStatus, ModelGatewaySecretSource};

const SERVICE: &str = "BlackRain2049 Model Gateway";
const CREDIT_JWT_USERNAME: &str = "credit-proxy-jwt";

fn provider_username(provider_id: &str) -> Result<String, String> {
    let id = provider_id.trim();
    if id.is_empty() {
        return Err("Provider id is required.".to_string());
    }
    Ok(format!("provider:{id}"))
}

fn provider_entry(provider_id: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, &provider_username(provider_id)?)
        .map_err(|err| format!("Unable to open system credential store: {err}"))
}

fn credit_jwt_entry() -> Result<Entry, String> {
    Entry::new(SERVICE, CREDIT_JWT_USERNAME)
        .map_err(|err| format!("Unable to open system credential store: {err}"))
}

fn read_keychain_secret(provider_id: &str) -> Result<Option<String>, String> {
    let entry = provider_entry(provider_id)?;
    match entry.get_password() {
        Ok(secret) => {
            let trimmed = secret.trim().to_string();
            if trimmed.is_empty() {
                Ok(None)
            } else {
                Ok(Some(trimmed))
            }
        }
        Err(KeyringError::NoEntry) => Ok(None),
        Err(err) => Err(format!(
            "Unable to read API key from system credential store: {err}"
        )),
    }
}

fn env_secret(api_key_env: &str) -> Option<String> {
    let env_key = api_key_env.trim();
    if env_key.is_empty() {
        return None;
    }
    std::env::var(env_key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(crate) fn model_gateway_provider_api_key(
    provider_id: &str,
    api_key_env: &str,
) -> Result<Option<String>, String> {
    match read_keychain_secret(provider_id) {
        Ok(Some(secret)) => Ok(Some(secret)),
        Ok(None) => Ok(env_secret(api_key_env)),
        Err(err) => {
            if let Some(secret) = env_secret(api_key_env) {
                return Ok(Some(secret));
            }
            Err(err)
        }
    }
}

pub(crate) fn model_gateway_provider_secret_status(
    provider_id: &str,
    api_key_env: &str,
) -> ModelGatewayProviderSecretStatus {
    let env_key = if api_key_env.trim().is_empty() {
        None
    } else {
        Some(api_key_env.trim().to_string())
    };

    match read_keychain_secret(provider_id) {
        Ok(Some(_)) => ModelGatewayProviderSecretStatus {
            provider_id: provider_id.trim().to_string(),
            configured: true,
            source: ModelGatewaySecretSource::Keychain,
            env_key,
            message: Some("API key is saved in the system credential store.".to_string()),
        },
        Ok(None) => {
            if env_secret(api_key_env).is_some() {
                ModelGatewayProviderSecretStatus {
                    provider_id: provider_id.trim().to_string(),
                    configured: true,
                    source: ModelGatewaySecretSource::Environment,
                    env_key,
                    message: Some("API key is available from the environment.".to_string()),
                }
            } else {
                ModelGatewayProviderSecretStatus {
                    provider_id: provider_id.trim().to_string(),
                    configured: false,
                    source: ModelGatewaySecretSource::Missing,
                    env_key,
                    message: Some("API key is missing.".to_string()),
                }
            }
        }
        Err(err) => {
            if env_secret(api_key_env).is_some() {
                ModelGatewayProviderSecretStatus {
                    provider_id: provider_id.trim().to_string(),
                    configured: true,
                    source: ModelGatewaySecretSource::Environment,
                    env_key,
                    message: Some(format!(
                        "System credential store is unavailable; using environment key. {err}"
                    )),
                }
            } else {
                ModelGatewayProviderSecretStatus {
                    provider_id: provider_id.trim().to_string(),
                    configured: false,
                    source: ModelGatewaySecretSource::Missing,
                    env_key,
                    message: Some(err),
                }
            }
        }
    }
}

pub(crate) fn model_gateway_provider_secret_set(
    provider_id: &str,
    api_key: &str,
) -> Result<(), String> {
    let secret = api_key.trim();
    if secret.is_empty() {
        return Err("API key is required.".to_string());
    }
    let entry = provider_entry(provider_id)?;
    entry
        .set_password(secret)
        .map_err(|err| format!("Unable to save API key to system credential store: {err}"))?;
    Ok(())
}

pub(crate) fn model_gateway_provider_secret_clear(provider_id: &str) -> Result<(), String> {
    let entry = provider_entry(provider_id)?;
    match entry.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(err) => Err(format!(
            "Unable to delete API key from system credential store: {err}"
        )),
    }
}

pub(crate) fn model_gateway_credit_jwt_get() -> Result<Option<String>, String> {
    match credit_jwt_entry()?.get_password() {
        Ok(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                Ok(None)
            } else {
                Ok(Some(trimmed.to_string()))
            }
        }
        Err(KeyringError::NoEntry) => Ok(None),
        Err(err) => Err(format!(
            "Unable to read credit token from system credential store: {err}"
        )),
    }
}

pub(crate) fn model_gateway_credit_jwt_set(jwt: &str) -> Result<(), String> {
    let token = jwt.trim();
    if token.is_empty() {
        return model_gateway_credit_jwt_clear();
    }
    credit_jwt_entry()?
        .set_password(token)
        .map_err(|err| format!("Unable to save credit token to system credential store: {err}"))
}

pub(crate) fn model_gateway_credit_jwt_clear() -> Result<(), String> {
    match credit_jwt_entry()?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(err) => Err(format!(
            "Unable to delete credit token from system credential store: {err}"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        model_gateway_provider_api_key, model_gateway_provider_secret_clear,
        model_gateway_provider_secret_set, model_gateway_provider_secret_status, provider_username,
        CREDIT_JWT_USERNAME,
    };
    use crate::types::ModelGatewaySecretSource;

    #[test]
    fn provider_username_rejects_empty_ids() {
        assert!(provider_username("  ").is_err());
        assert_eq!(
            provider_username("deepseek").expect("username"),
            "provider:deepseek"
        );
        assert_eq!(CREDIT_JWT_USERNAME, "credit-proxy-jwt");
    }

    #[test]
    fn real_system_credential_store_smoke_when_enabled() {
        if std::env::var("BLACKRAIN_KEYCHAIN_SMOKE").ok().as_deref() != Some("1") {
            return;
        }

        let provider_id = format!(
            "blackrain-smoke-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_millis()
        );
        let env_key = "BLACKRAIN_KEYCHAIN_SMOKE_SHOULD_NOT_EXIST";
        let secret = "sk-blackrain-smoke-test";

        model_gateway_provider_secret_clear(&provider_id).expect("clear before smoke");
        assert_eq!(
            model_gateway_provider_api_key(&provider_id, env_key).expect("read missing"),
            None
        );

        model_gateway_provider_secret_set(&provider_id, secret).expect("set smoke secret");
        assert_eq!(
            model_gateway_provider_api_key(&provider_id, env_key).expect("read smoke secret"),
            Some(secret.to_string())
        );
        let status = model_gateway_provider_secret_status(&provider_id, env_key);
        assert!(status.configured);
        assert_eq!(status.source, ModelGatewaySecretSource::Keychain);

        model_gateway_provider_secret_clear(&provider_id).expect("clear after smoke");
        assert_eq!(
            model_gateway_provider_api_key(&provider_id, env_key).expect("read cleared"),
            None
        );
    }
}
