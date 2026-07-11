use keyring::{Entry, Error as KeyringError};
use uuid::Uuid;

use super::config::HermesSecretReference;

const SERVICE: &str = "BlackRain Hermes WORK";

fn normalize_id(label: &str, value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.chars().any(char::is_control) {
        return Err(format!("Hermes {label} is required."));
    }
    Ok(trimmed.to_string())
}

fn api_server_username(profile_id: &str) -> Result<String, String> {
    Ok(format!(
        "api-server:{}",
        normalize_id("profile id", profile_id)?
    ))
}

fn provider_username(provider_id: &str) -> Result<String, String> {
    Ok(format!(
        "provider:{}",
        normalize_id("provider id", provider_id)?
    ))
}

fn entry(username: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, username)
        .map_err(|error| format!("Unable to open Hermes system credential entry: {error}"))
}

fn read(username: &str) -> Result<Option<String>, String> {
    match entry(username)?.get_password() {
        Ok(secret) if !secret.trim().is_empty() => Ok(Some(secret)),
        Ok(_) | Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(format!("Unable to read Hermes credential: {error}")),
    }
}

fn write(username: &str, secret: &str) -> Result<(), String> {
    if secret.trim().is_empty() || secret.chars().any(char::is_control) {
        return Err(
            "Hermes credential must be non-empty and contain no control characters.".into(),
        );
    }
    entry(username)?
        .set_password(secret)
        .map_err(|error| format!("Unable to save Hermes credential: {error}"))
}

fn clear(username: &str) -> Result<(), String> {
    match entry(username)?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(format!("Unable to clear Hermes credential: {error}")),
    }
}

pub(crate) fn generate_api_server_key() -> String {
    format!("br_{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

pub(crate) fn ensure_api_server_key(profile_id: &str, rotate: bool) -> Result<String, String> {
    let username = api_server_username(profile_id)?;
    if !rotate {
        if let Some(existing) = read(&username)? {
            return Ok(existing);
        }
    }
    let generated = generate_api_server_key();
    write(&username, &generated)?;
    Ok(generated)
}

pub(crate) fn clear_api_server_key(profile_id: &str) -> Result<(), String> {
    clear(&api_server_username(profile_id)?)
}

pub(crate) fn provider_secret_get(provider_id: &str) -> Result<Option<String>, String> {
    read(&provider_username(provider_id)?)
}

pub(crate) fn provider_secret_set(provider_id: &str, secret: &str) -> Result<(), String> {
    write(&provider_username(provider_id)?, secret)
}

pub(crate) fn provider_secret_clear(provider_id: &str) -> Result<(), String> {
    clear(&provider_username(provider_id)?)
}

pub(crate) fn resolve_secret_reference(
    secret_ref: &HermesSecretReference,
) -> Result<Option<String>, String> {
    secret_ref.validate()?;
    match secret_ref {
        HermesSecretReference::ProviderCredential { provider_id } => {
            provider_secret_get(provider_id)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        api_server_username, clear_api_server_key, ensure_api_server_key, generate_api_server_key,
        provider_secret_clear, provider_secret_get, provider_secret_set, provider_username,
        resolve_secret_reference,
    };
    use crate::shared::hermes_core::config::HermesSecretReference;
    use uuid::Uuid;

    #[test]
    fn namespaces_api_server_and_provider_credentials() {
        assert_eq!(
            api_server_username("default").unwrap(),
            "api-server:default"
        );
        assert_eq!(
            provider_username("blackrain-new-api").unwrap(),
            "provider:blackrain-new-api"
        );
        assert!(api_server_username(" ").is_err());
        assert!(provider_username("\n").is_err());
    }

    #[test]
    fn generated_api_server_keys_are_high_entropy_and_distinct() {
        let first = generate_api_server_key();
        let second = generate_api_server_key();
        assert!(first.starts_with("br_"));
        assert!(first.len() >= 67);
        assert_ne!(first, second);
    }

    #[test]
    fn secret_reference_rejects_invalid_provider_ids_before_keyring_access() {
        let secret_ref = HermesSecretReference::ProviderCredential {
            provider_id: "INVALID PROVIDER".into(),
        };
        assert!(resolve_secret_reference(&secret_ref).is_err());
    }

    #[test]
    fn real_system_credential_store_smoke_when_enabled() {
        if std::env::var("BLACKRAIN_HERMES_KEYCHAIN_SMOKE")
            .ok()
            .as_deref()
            != Some("1")
        {
            return;
        }
        let suffix = Uuid::new_v4().simple().to_string();
        let profile_id = format!("smoke-{suffix}");
        let provider_id = format!("smoke-provider-{suffix}");
        clear_api_server_key(&profile_id).unwrap();
        provider_secret_clear(&provider_id).unwrap();

        let first = ensure_api_server_key(&profile_id, false).unwrap();
        let second = ensure_api_server_key(&profile_id, false).unwrap();
        assert_eq!(first, second);
        let rotated = ensure_api_server_key(&profile_id, true).unwrap();
        assert_ne!(first, rotated);

        provider_secret_set(&provider_id, "provider-smoke-secret").unwrap();
        assert_eq!(
            provider_secret_get(&provider_id).unwrap().as_deref(),
            Some("provider-smoke-secret")
        );
        provider_secret_clear(&provider_id).unwrap();
        clear_api_server_key(&profile_id).unwrap();
    }
}
