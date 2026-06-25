// 002-accounts-credits / M-A1.4：账号会话钥匙串命令（App 进程薄适配器）。
// 领域逻辑在 shared::account_session_core；这里只做命令暴露。
// 前端 Supabase storage adapter 调这三个命令完成 session 持久化。

use tauri::command;

use crate::shared::account_session_core::{
    account_session_clear as clear_session, account_session_get as get_session,
    account_session_set as set_session,
};

#[command]
pub(crate) async fn account_session_get(key: String) -> Result<Option<String>, String> {
    get_session(&key)
}

#[command]
pub(crate) async fn account_session_set(key: String, value: String) -> Result<(), String> {
    set_session(&key, &value)
}

#[command]
pub(crate) async fn account_session_clear(key: String) -> Result<(), String> {
    clear_session(&key)
}
