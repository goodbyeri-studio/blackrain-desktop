// Supabase 会话 token 的系统钥匙串存取（领域核心）。
// App 与 Daemon 都只做薄适配器，调用本模块。
//
// 为什么进钥匙串而非 localStorage：会话 token 等同登录凭据，桌面端必须存系统凭据库，
// 不能落在可被扒包/明文读取的前端存储。前端 Supabase SDK 用自定义 storage adapter，
// 把 getItem/setItem/removeItem 转成下面三个命令。
//
// 与 account.rs 区分：account.rs 是 Codex 内核 ChatGPT 用量（非自有账号）；
// 本模块是 2049 自有账号系统。

use keyring::{Entry, Error as KeyringError};

const SERVICE: &str = "BlackRain2049 Account";

// Supabase SDK 用单一 storageKey（形如 "sb-<ref>-auth-token"）读写整个 session JSON。
// 我们把该 key 作为钥匙串 username，value 即 session JSON 原文。
fn session_username(key: &str) -> Result<String, String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err("Session storage key is required.".to_string());
    }
    Ok(trimmed.to_string())
}

fn session_entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, &session_username(key)?)
        .map_err(|err| format!("Unable to open system credential store: {err}"))
}

// 读会话：无则返回 None（对应 SDK storage.getItem → null）。
pub(crate) fn account_session_get(key: &str) -> Result<Option<String>, String> {
    let entry = session_entry(key)?;
    match entry.get_password() {
        Ok(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                Ok(None)
            } else {
                Ok(Some(value))
            }
        }
        Err(KeyringError::NoEntry) => Ok(None),
        Err(err) => Err(format!(
            "Unable to read session from system credential store: {err}"
        )),
    }
}

// 写会话（覆盖）。空值视为清除，避免在钥匙串里留空串。
pub(crate) fn account_session_set(key: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return account_session_clear(key);
    }
    let entry = session_entry(key)?;
    entry
        .set_password(value)
        .map_err(|err| format!("Unable to save session to system credential store: {err}"))
}

// 清除会话（登出 / 过期）。不存在视为成功，幂等。
pub(crate) fn account_session_clear(key: &str) -> Result<(), String> {
    let entry = session_entry(key)?;
    match entry.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(err) => Err(format!(
            "Unable to delete session from system credential store: {err}"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::session_username;

    #[test]
    fn session_username_rejects_empty() {
        assert!(session_username("   ").is_err());
        assert_eq!(
            session_username(" sb-abc-auth-token ").expect("username"),
            "sb-abc-auth-token"
        );
    }
}
