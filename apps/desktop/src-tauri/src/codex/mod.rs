use serde_json::{json, Map, Value};
use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};

pub(crate) mod args;
pub(crate) mod config;
pub(crate) mod home;

use crate::backend::app_server::spawn_workspace_session as spawn_workspace_session_inner;
pub(crate) use crate::backend::app_server::WorkspaceSession;
use crate::backend::events::AppServerEvent;
use crate::event_sink::TauriEventSink;
use crate::remote_backend;
use crate::shared::agents_config_core;
use crate::shared::codex_core::{self, insert_optional_nullable_string};
use crate::state::AppState;
use crate::types::WorkspaceEntry;

fn emit_thread_live_event(app: &AppHandle, workspace_id: &str, method: &str, params: Value) {
    let _ = app.emit(
        "app-server-event",
        AppServerEvent {
            workspace_id: workspace_id.to_string(),
            message: json!({
                "method": method,
                "params": params,
            }),
        },
    );
}

pub(crate) async fn spawn_workspace_session(
    entry: WorkspaceEntry,
    default_codex_bin: Option<String>,
    codex_args: Option<String>,
    app_handle: AppHandle,
    codex_home: Option<PathBuf>,
) -> Result<Arc<WorkspaceSession>, String> {
    let office_runtime = crate::office::configure_runtime_environment(&app_handle)
        .await
        .ok();
    crate::office::sync_builtin_assets_to_codex_home(&app_handle, codex_home.as_deref())?;
    let officecli_dir = office_runtime
        .as_ref()
        .and_then(|runtime| runtime.bin_path.as_ref())
        .and_then(|bin_path| {
            let bin_path = std::path::Path::new(bin_path);
            bin_path.parent().map(|path| path.to_path_buf())
        });
    let client_version = app_handle.package_info().version.to_string();
    let event_sink = TauriEventSink::new(app_handle);
    spawn_workspace_session_inner(
        entry,
        default_codex_bin,
        codex_args,
        codex_home,
        officecli_dir,
        client_version,
        event_sink,
    )
    .await
}

#[tauri::command]
pub(crate) async fn codex_doctor(
    codex_bin: Option<String>,
    codex_args: Option<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    crate::shared::codex_aux_core::codex_doctor_core(&state.app_settings, codex_bin, codex_args)
        .await
}

#[tauri::command]
pub(crate) async fn codex_update(
    codex_bin: Option<String>,
    codex_args: Option<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    crate::shared::codex_update_core::codex_update_core(&state.app_settings, codex_bin, codex_args)
        .await
}

#[tauri::command]
pub(crate) async fn start_thread(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "start_thread",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    codex_core::start_thread_core(&state.sessions, &state.workspaces, workspace_id).await
}

#[tauri::command]
pub(crate) async fn resume_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "resume_thread",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }

    codex_core::resume_thread_core(&state.sessions, workspace_id, thread_id).await
}

#[tauri::command]
pub(crate) async fn read_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "read_thread",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }

    codex_core::read_thread_core(&state.sessions, workspace_id, thread_id).await
}

#[tauri::command]
pub(crate) async fn thread_live_subscribe(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "thread_live_subscribe",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }

    codex_core::thread_live_subscribe_core(
        &state.sessions,
        workspace_id.clone(),
        thread_id.clone(),
    )
    .await?;
    let subscription_id = format!("{}:{}", workspace_id, thread_id);
    emit_thread_live_event(
        &app,
        &workspace_id,
        "thread/live_attached",
        json!({
            "workspaceId": workspace_id,
            "threadId": thread_id,
            "subscriptionId": subscription_id,
        }),
    );
    Ok(json!({
        "subscriptionId": subscription_id,
        "state": "live",
    }))
}

#[tauri::command]
pub(crate) async fn thread_live_unsubscribe(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "thread_live_unsubscribe",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }

    codex_core::thread_live_unsubscribe_core(
        &state.sessions,
        workspace_id.clone(),
        thread_id.clone(),
    )
    .await?;
    emit_thread_live_event(
        &app,
        &workspace_id,
        "thread/live_detached",
        json!({
            "workspaceId": workspace_id,
            "threadId": thread_id,
            "reason": "manual",
        }),
    );
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub(crate) async fn fork_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "fork_thread",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }

    codex_core::fork_thread_core(&state.sessions, workspace_id, thread_id).await
}

#[tauri::command]
pub(crate) async fn list_threads(
    workspace_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
    sort_key: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "list_threads",
            json!({
                "workspaceId": workspace_id,
                "cursor": cursor,
                "limit": limit,
                "sortKey": sort_key
            }),
        )
        .await;
    }

    codex_core::list_threads_core(&state.sessions, workspace_id, cursor, limit, sort_key).await
}

#[tauri::command]
pub(crate) async fn list_mcp_server_status(
    workspace_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "list_mcp_server_status",
            json!({ "workspaceId": workspace_id, "cursor": cursor, "limit": limit }),
        )
        .await;
    }

    codex_core::list_mcp_server_status_core(&state.sessions, workspace_id, cursor, limit).await
}

#[tauri::command]
pub(crate) async fn archive_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "archive_thread",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }

    codex_core::archive_thread_core(&state.sessions, workspace_id, thread_id).await
}

#[tauri::command]
pub(crate) async fn delete_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "delete_thread",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }

    codex_core::delete_thread_core(&state.sessions, workspace_id, thread_id).await
}

#[tauri::command]
pub(crate) async fn thread_items_list(
    workspace_id: String,
    thread_id: String,
    turn_id: Option<String>,
    cursor: Option<String>,
    limit: Option<u32>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "thread_items_list",
            json!({
                "workspaceId": workspace_id,
                "threadId": thread_id,
                "turnId": turn_id,
                "cursor": cursor,
                "limit": limit,
            }),
        )
        .await;
    }

    codex_core::thread_items_list_core(
        &state.sessions,
        workspace_id,
        thread_id,
        turn_id,
        cursor,
        limit,
    )
    .await
}

#[tauri::command]
pub(crate) async fn thread_background_terminals_list(
    workspace_id: String,
    thread_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "thread_background_terminals_list",
            json!({
                "workspaceId": workspace_id,
                "threadId": thread_id,
                "cursor": cursor,
                "limit": limit,
            }),
        )
        .await;
    }

    codex_core::thread_background_terminals_list_core(
        &state.sessions,
        workspace_id,
        thread_id,
        cursor,
        limit,
    )
    .await
}

#[tauri::command]
pub(crate) async fn thread_background_terminals_terminate(
    workspace_id: String,
    thread_id: String,
    process_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "thread_background_terminals_terminate",
            json!({
                "workspaceId": workspace_id,
                "threadId": thread_id,
                "processId": process_id,
            }),
        )
        .await;
    }

    codex_core::thread_background_terminals_terminate_core(
        &state.sessions,
        workspace_id,
        thread_id,
        process_id,
    )
    .await
}

#[tauri::command]
pub(crate) async fn environment_info(
    workspace_id: String,
    environment_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "environment_info",
            json!({ "workspaceId": workspace_id, "environmentId": environment_id }),
        )
        .await;
    }

    codex_core::environment_info_core(&state.sessions, workspace_id, environment_id).await
}

#[tauri::command]
pub(crate) async fn skills_config_write(
    workspace_id: String,
    path: Option<String>,
    name: Option<String>,
    enabled: bool,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "skills_config_write",
            json!({ "workspaceId": workspace_id, "path": path, "name": name, "enabled": enabled }),
        )
        .await;
    }
    codex_core::skills_config_write_core(&state.sessions, workspace_id, path, name, enabled).await
}

#[tauri::command]
pub(crate) async fn skills_extra_roots_set(
    workspace_id: String,
    extra_roots: Vec<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "skills_extra_roots_set",
            json!({ "workspaceId": workspace_id, "extraRoots": extra_roots }),
        )
        .await;
    }
    codex_core::skills_extra_roots_set_core(&state.sessions, workspace_id, extra_roots).await
}

#[tauri::command]
pub(crate) async fn hooks_list(
    workspace_id: String,
    cwds: Vec<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "hooks_list",
            json!({ "workspaceId": workspace_id, "cwds": cwds }),
        )
        .await;
    }
    codex_core::hooks_list_core(&state.sessions, workspace_id, cwds).await
}

#[tauri::command]
pub(crate) async fn plugin_list(
    workspace_id: String,
    cwds: Option<Vec<String>>,
    marketplace_kinds: Option<Vec<String>>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "plugin_list",
            json!({ "workspaceId": workspace_id, "cwds": cwds, "marketplaceKinds": marketplace_kinds }),
        )
        .await;
    }
    codex_core::plugin_list_core(&state.sessions, workspace_id, cwds, marketplace_kinds).await
}

#[tauri::command]
pub(crate) async fn plugin_installed(
    workspace_id: String,
    cwds: Option<Vec<String>>,
    install_suggestion_plugin_names: Option<Vec<String>>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "plugin_installed",
            json!({ "workspaceId": workspace_id, "cwds": cwds, "installSuggestionPluginNames": install_suggestion_plugin_names }),
        )
        .await;
    }
    codex_core::plugin_installed_core(&state.sessions, workspace_id, cwds, install_suggestion_plugin_names).await
}

#[tauri::command]
pub(crate) async fn plugin_read(
    workspace_id: String,
    plugin_name: String,
    marketplace_path: Option<String>,
    remote_marketplace_name: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "plugin_read",
            json!({ "workspaceId": workspace_id, "pluginName": plugin_name, "marketplacePath": marketplace_path, "remoteMarketplaceName": remote_marketplace_name }),
        )
        .await;
    }
    codex_core::plugin_read_core(&state.sessions, workspace_id, plugin_name, marketplace_path, remote_marketplace_name).await
}

#[tauri::command]
pub(crate) async fn plugin_install(
    workspace_id: String,
    plugin_name: String,
    marketplace_path: Option<String>,
    remote_marketplace_name: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "plugin_install",
            json!({ "workspaceId": workspace_id, "pluginName": plugin_name, "marketplacePath": marketplace_path, "remoteMarketplaceName": remote_marketplace_name }),
        )
        .await;
    }
    codex_core::plugin_install_core(&state.sessions, workspace_id, plugin_name, marketplace_path, remote_marketplace_name).await
}

#[tauri::command]
pub(crate) async fn plugin_uninstall(
    workspace_id: String,
    plugin_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "plugin_uninstall",
            json!({ "workspaceId": workspace_id, "pluginId": plugin_id }),
        )
        .await;
    }
    codex_core::plugin_uninstall_core(&state.sessions, workspace_id, plugin_id).await
}

#[tauri::command]
pub(crate) async fn plugin_skill_read(
    workspace_id: String,
    remote_marketplace_name: String,
    remote_plugin_id: String,
    skill_name: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "plugin_skill_read",
            json!({ "workspaceId": workspace_id, "remoteMarketplaceName": remote_marketplace_name, "remotePluginId": remote_plugin_id, "skillName": skill_name }),
        )
        .await;
    }
    codex_core::plugin_skill_read_core(&state.sessions, workspace_id, remote_marketplace_name, remote_plugin_id, skill_name).await
}

#[tauri::command]
pub(crate) async fn marketplace_add(
    workspace_id: String,
    source: String,
    ref_name: Option<String>,
    sparse_paths: Option<Vec<String>>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "marketplace_add",
            json!({ "workspaceId": workspace_id, "source": source, "refName": ref_name, "sparsePaths": sparse_paths }),
        )
        .await;
    }
    codex_core::marketplace_add_core(&state.sessions, workspace_id, source, ref_name, sparse_paths).await
}

#[tauri::command]
pub(crate) async fn marketplace_remove(
    workspace_id: String,
    marketplace_name: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "marketplace_remove",
            json!({ "workspaceId": workspace_id, "marketplaceName": marketplace_name }),
        )
        .await;
    }
    codex_core::marketplace_remove_core(&state.sessions, workspace_id, marketplace_name).await
}

#[tauri::command]
pub(crate) async fn marketplace_upgrade(
    workspace_id: String,
    marketplace_name: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "marketplace_upgrade",
            json!({ "workspaceId": workspace_id, "marketplaceName": marketplace_name }),
        )
        .await;
    }
    codex_core::marketplace_upgrade_core(&state.sessions, workspace_id, marketplace_name).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub(crate) async fn thread_search(
    workspace_id: String,
    search_term: String,
    cursor: Option<String>,
    limit: Option<u32>,
    archived: Option<bool>,
    sort_key: Option<String>,
    sort_direction: Option<String>,
    source_kinds: Option<Vec<String>>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "thread_search",
            json!({ "workspaceId": workspace_id, "searchTerm": search_term, "cursor": cursor, "limit": limit, "archived": archived, "sortKey": sort_key, "sortDirection": sort_direction, "sourceKinds": source_kinds }),
        )
        .await;
    }
    codex_core::thread_search_core(&state.sessions, workspace_id, search_term, cursor, limit, archived, sort_key, sort_direction, source_kinds).await
}

#[tauri::command]
pub(crate) async fn thread_goal_get(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "thread_goal_get", json!({ "workspaceId": workspace_id, "threadId": thread_id })).await;
    }
    codex_core::thread_goal_get_core(&state.sessions, workspace_id, thread_id).await
}

#[tauri::command]
pub(crate) async fn thread_goal_clear(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "thread_goal_clear", json!({ "workspaceId": workspace_id, "threadId": thread_id })).await;
    }
    codex_core::thread_goal_clear_core(&state.sessions, workspace_id, thread_id).await
}

#[tauri::command]
pub(crate) async fn thread_memory_mode_set(
    workspace_id: String,
    thread_id: String,
    mode: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "thread_memory_mode_set", json!({ "workspaceId": workspace_id, "threadId": thread_id, "mode": mode })).await;
    }
    codex_core::thread_memory_mode_set_core(&state.sessions, workspace_id, thread_id, mode).await
}

#[tauri::command]
pub(crate) async fn memory_reset(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "memory_reset", json!({ "workspaceId": workspace_id })).await;
    }
    codex_core::memory_reset_core(&state.sessions, workspace_id).await
}

#[tauri::command]
pub(crate) async fn thread_unarchive(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "thread_unarchive", json!({ "workspaceId": workspace_id, "threadId": thread_id })).await;
    }
    codex_core::thread_unarchive_core(&state.sessions, workspace_id, thread_id).await
}

#[tauri::command]
pub(crate) async fn thread_loaded_list(
    workspace_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "thread_loaded_list", json!({ "workspaceId": workspace_id, "cursor": cursor, "limit": limit })).await;
    }
    codex_core::thread_loaded_list_core(&state.sessions, workspace_id, cursor, limit).await
}

#[tauri::command]
pub(crate) async fn thread_shell_command(
    workspace_id: String,
    thread_id: String,
    command: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "thread_shell_command", json!({ "workspaceId": workspace_id, "threadId": thread_id, "command": command })).await;
    }
    codex_core::thread_shell_command_core(&state.sessions, workspace_id, thread_id, command).await
}

#[tauri::command]
pub(crate) async fn thread_background_terminals_clean(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "thread_background_terminals_clean", json!({ "workspaceId": workspace_id, "threadId": thread_id })).await;
    }
    codex_core::thread_background_terminals_clean_core(&state.sessions, workspace_id, thread_id).await
}

#[tauri::command]
pub(crate) async fn thread_goal_set(
    workspace_id: String,
    params: Value,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "thread_goal_set", json!({ "workspaceId": workspace_id, "params": params })).await;
    }
    codex_core::thread_goal_set_core(&state.sessions, workspace_id, params).await
}

#[tauri::command]
pub(crate) async fn thread_settings_update(
    workspace_id: String,
    params: Value,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "thread_settings_update", json!({ "workspaceId": workspace_id, "params": params })).await;
    }
    codex_core::thread_settings_update_core(&state.sessions, workspace_id, params).await
}

#[tauri::command]
pub(crate) async fn thread_metadata_update(
    workspace_id: String,
    params: Value,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "thread_metadata_update", json!({ "workspaceId": workspace_id, "params": params })).await;
    }
    codex_core::thread_metadata_update_core(&state.sessions, workspace_id, params).await
}

#[tauri::command]
pub(crate) async fn thread_approve_guardian_denied_action(
    workspace_id: String,
    params: Value,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "thread_approve_guardian_denied_action", json!({ "workspaceId": workspace_id, "params": params })).await;
    }
    codex_core::thread_approve_guardian_denied_action_core(&state.sessions, workspace_id, params).await
}

#[tauri::command]
pub(crate) async fn model_provider_capabilities_read(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "model_provider_capabilities_read", json!({ "workspaceId": workspace_id })).await;
    }
    codex_core::model_provider_capabilities_read_core(&state.sessions, workspace_id).await
}

#[tauri::command]
pub(crate) async fn experimental_feature_enablement_set(
    workspace_id: String,
    enablement: Value,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "experimental_feature_enablement_set", json!({ "workspaceId": workspace_id, "enablement": enablement })).await;
    }
    codex_core::experimental_feature_enablement_set_core(&state.sessions, workspace_id, enablement).await
}

#[tauri::command]
pub(crate) async fn permission_profile_list(
    workspace_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
    cwd: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "permission_profile_list", json!({ "workspaceId": workspace_id, "cursor": cursor, "limit": limit, "cwd": cwd })).await;
    }
    codex_core::permission_profile_list_core(&state.sessions, workspace_id, cursor, limit, cwd).await
}

#[tauri::command]
pub(crate) async fn account_logout(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "account_logout", json!({ "workspaceId": workspace_id })).await;
    }
    codex_core::account_logout_core(&state.sessions, workspace_id).await
}

#[tauri::command]
pub(crate) async fn mcp_server_oauth_login(
    workspace_id: String,
    name: String,
    thread_id: Option<String>,
    scopes: Option<Vec<String>>,
    timeout_secs: Option<i64>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "mcp_server_oauth_login", json!({ "workspaceId": workspace_id, "name": name, "threadId": thread_id, "scopes": scopes, "timeoutSecs": timeout_secs })).await;
    }
    codex_core::mcp_server_oauth_login_core(&state.sessions, workspace_id, name, thread_id, scopes, timeout_secs).await
}

#[tauri::command]
pub(crate) async fn mcp_resource_read(
    workspace_id: String,
    server: String,
    uri: String,
    thread_id: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "mcp_resource_read", json!({ "workspaceId": workspace_id, "server": server, "uri": uri, "threadId": thread_id })).await;
    }
    codex_core::mcp_resource_read_core(&state.sessions, workspace_id, server, uri, thread_id).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub(crate) async fn mcp_server_tool_call(
    workspace_id: String,
    thread_id: String,
    server: String,
    tool: String,
    arguments: Option<Value>,
    meta: Option<Value>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "mcp_server_tool_call", json!({ "workspaceId": workspace_id, "threadId": thread_id, "server": server, "tool": tool, "arguments": arguments, "meta": meta })).await;
    }
    codex_core::mcp_server_tool_call_core(&state.sessions, workspace_id, thread_id, server, tool, arguments, meta).await
}

#[tauri::command]
pub(crate) async fn windows_sandbox_setup_start(
    workspace_id: String,
    mode: String,
    cwd: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "windows_sandbox_setup_start", json!({ "workspaceId": workspace_id, "mode": mode, "cwd": cwd })).await;
    }
    codex_core::windows_sandbox_setup_start_core(&state.sessions, workspace_id, mode, cwd).await
}

#[tauri::command]
pub(crate) async fn windows_sandbox_readiness(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "windows_sandbox_readiness", json!({ "workspaceId": workspace_id })).await;
    }
    codex_core::windows_sandbox_readiness_core(&state.sessions, workspace_id).await
}

#[tauri::command]
pub(crate) async fn external_agent_config_detect(
    workspace_id: String,
    include_home: bool,
    cwds: Option<Vec<String>>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "external_agent_config_detect", json!({ "workspaceId": workspace_id, "includeHome": include_home, "cwds": cwds })).await;
    }
    codex_core::external_agent_config_detect_core(&state.sessions, workspace_id, include_home, cwds).await
}

#[tauri::command]
pub(crate) async fn external_agent_config_import(
    workspace_id: String,
    params: Value,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "external_agent_config_import", json!({ "workspaceId": workspace_id, "params": params })).await;
    }
    codex_core::external_agent_config_import_core(&state.sessions, workspace_id, params).await
}

#[tauri::command]
pub(crate) async fn external_agent_config_import_histories_read(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(&*state, app, "external_agent_config_import_histories_read", json!({ "workspaceId": workspace_id })).await;
    }
    codex_core::external_agent_config_import_histories_read_core(&state.sessions, workspace_id).await
}

#[tauri::command]
pub(crate) async fn rollback_thread(
    workspace_id: String,
    thread_id: String,
    turn_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "rollback_thread",
            json!({ "workspaceId": workspace_id, "threadId": thread_id, "turnId": turn_id }),
        )
        .await;
    }

    codex_core::rollback_thread_core(&state.sessions, workspace_id, thread_id, turn_id).await
}

#[tauri::command]
pub(crate) async fn compact_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "compact_thread",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }

    codex_core::compact_thread_core(&state.sessions, workspace_id, thread_id).await
}

#[tauri::command]
pub(crate) async fn set_thread_name(
    workspace_id: String,
    thread_id: String,
    name: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "set_thread_name",
            json!({ "workspaceId": workspace_id, "threadId": thread_id, "name": name }),
        )
        .await;
    }

    codex_core::set_thread_name_core(&state.sessions, workspace_id, thread_id, name).await
}

#[tauri::command]
pub(crate) async fn send_user_message(
    workspace_id: String,
    thread_id: String,
    text: String,
    model: Option<String>,
    effort: Option<String>,
    service_tier: Option<Option<String>>,
    access_mode: Option<String>,
    images: Option<Vec<String>>,
    app_mentions: Option<Vec<Value>>,
    collaboration_mode: Option<Value>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let images = images.map(|paths| {
            paths
                .into_iter()
                .map(remote_backend::normalize_path_for_remote)
                .collect::<Vec<_>>()
        });
        let mut payload = Map::new();
        payload.insert("workspaceId".to_string(), json!(workspace_id));
        payload.insert("threadId".to_string(), json!(thread_id));
        payload.insert("text".to_string(), json!(text));
        payload.insert("model".to_string(), json!(model));
        payload.insert("effort".to_string(), json!(effort));
        insert_optional_nullable_string(&mut payload, "serviceTier", service_tier);
        payload.insert("accessMode".to_string(), json!(access_mode));
        payload.insert("images".to_string(), json!(images));
        payload.insert("appMentions".to_string(), json!(app_mentions));
        if let Some(mode) = collaboration_mode {
            if !mode.is_null() {
                payload.insert("collaborationMode".to_string(), mode);
            }
        }
        return remote_backend::call_remote(
            &*state,
            app,
            "send_user_message",
            Value::Object(payload),
        )
        .await;
    }

    codex_core::send_user_message_core(
        &state.sessions,
        &state.workspaces,
        workspace_id,
        thread_id,
        text,
        model,
        effort,
        service_tier,
        access_mode,
        images,
        app_mentions,
        collaboration_mode,
    )
    .await
}

#[tauri::command]
pub(crate) async fn turn_steer(
    workspace_id: String,
    thread_id: String,
    turn_id: String,
    text: String,
    images: Option<Vec<String>>,
    app_mentions: Option<Vec<Value>>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let images = images.map(|paths| {
            paths
                .into_iter()
                .map(remote_backend::normalize_path_for_remote)
                .collect::<Vec<_>>()
        });
        return remote_backend::call_remote(
            &*state,
            app,
            "turn_steer",
            json!({
                "workspaceId": workspace_id,
                "threadId": thread_id,
                "turnId": turn_id,
                "text": text,
                "images": images,
                "appMentions": app_mentions,
            }),
        )
        .await;
    }

    codex_core::turn_steer_core(
        &state.sessions,
        workspace_id,
        thread_id,
        turn_id,
        text,
        images,
        app_mentions,
    )
    .await
}

#[tauri::command]
pub(crate) async fn collaboration_mode_list(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "collaboration_mode_list",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    codex_core::collaboration_mode_list_core(&state.sessions, workspace_id).await
}

#[tauri::command]
pub(crate) async fn turn_interrupt(
    workspace_id: String,
    thread_id: String,
    turn_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "turn_interrupt",
            json!({ "workspaceId": workspace_id, "threadId": thread_id, "turnId": turn_id }),
        )
        .await;
    }

    codex_core::turn_interrupt_core(&state.sessions, workspace_id, thread_id, turn_id).await
}

#[tauri::command]
pub(crate) async fn start_review(
    workspace_id: String,
    thread_id: String,
    target: Value,
    delivery: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "start_review",
            json!({
                "workspaceId": workspace_id,
                "threadId": thread_id,
                "target": target,
                "delivery": delivery,
            }),
        )
        .await;
    }

    codex_core::start_review_core(
        &state.sessions,
        workspace_id,
        thread_id,
        target,
        delivery,
    )
    .await
}

#[tauri::command]
pub(crate) async fn model_list(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "model_list",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    codex_core::model_list_core(&state.sessions, workspace_id).await
}

#[tauri::command]
pub(crate) async fn experimental_feature_list(
    workspace_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "experimental_feature_list",
            json!({
                "workspaceId": workspace_id,
                "cursor": cursor,
                "limit": limit
            }),
        )
        .await;
    }

    codex_core::experimental_feature_list_core(&state.sessions, workspace_id, cursor, limit).await
}

#[tauri::command]
pub(crate) async fn set_codex_feature_flag(
    feature_key: String,
    enabled: bool,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if remote_backend::is_remote_mode(&*state).await {
        remote_backend::call_remote(
            &*state,
            app,
            "set_codex_feature_flag",
            json!({
                "featureKey": feature_key,
                "enabled": enabled
            }),
        )
        .await?;
        return Ok(());
    }

    config::write_feature_enabled(feature_key.as_str(), enabled)
}

#[tauri::command]
pub(crate) async fn get_agents_settings(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<agents_config_core::AgentsSettingsDto, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response =
            remote_backend::call_remote(&*state, app, "get_agents_settings", json!({})).await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    agents_config_core::get_agents_settings_core()
}

#[tauri::command]
pub(crate) async fn set_agents_core_settings(
    input: agents_config_core::SetAgentsCoreInput,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<agents_config_core::AgentsSettingsDto, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response = remote_backend::call_remote(
            &*state,
            app,
            "set_agents_core_settings",
            json!({ "input": input }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    agents_config_core::set_agents_core_settings_core(input)
}

#[tauri::command]
pub(crate) async fn create_agent(
    input: agents_config_core::CreateAgentInput,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<agents_config_core::AgentsSettingsDto, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response =
            remote_backend::call_remote(&*state, app, "create_agent", json!({ "input": input }))
                .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    agents_config_core::create_agent_core(input)
}

#[tauri::command]
pub(crate) async fn update_agent(
    input: agents_config_core::UpdateAgentInput,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<agents_config_core::AgentsSettingsDto, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response =
            remote_backend::call_remote(&*state, app, "update_agent", json!({ "input": input }))
                .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    agents_config_core::update_agent_core(input)
}

#[tauri::command]
pub(crate) async fn delete_agent(
    input: agents_config_core::DeleteAgentInput,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<agents_config_core::AgentsSettingsDto, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response =
            remote_backend::call_remote(&*state, app, "delete_agent", json!({ "input": input }))
                .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    agents_config_core::delete_agent_core(input)
}

#[tauri::command]
pub(crate) async fn read_agent_config_toml(
    agent_name: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response = remote_backend::call_remote(
            &*state,
            app,
            "read_agent_config_toml",
            json!({ "agentName": agent_name }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    agents_config_core::read_agent_config_toml_core(agent_name.as_str())
}

#[tauri::command]
pub(crate) async fn write_agent_config_toml(
    agent_name: String,
    content: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if remote_backend::is_remote_mode(&*state).await {
        remote_backend::call_remote(
            &*state,
            app,
            "write_agent_config_toml",
            json!({
                "agentName": agent_name,
                "content": content,
            }),
        )
        .await?;
        return Ok(());
    }

    agents_config_core::write_agent_config_toml_core(agent_name.as_str(), content.as_str())
}

#[tauri::command]
pub(crate) async fn account_rate_limits(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "account_rate_limits",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    codex_core::account_rate_limits_core(&state.sessions, workspace_id).await
}

#[tauri::command]
pub(crate) async fn account_read(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "account_read",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    codex_core::account_read_core(&state.sessions, &state.workspaces, workspace_id).await
}

#[tauri::command]
pub(crate) async fn codex_login(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "codex_login",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    codex_core::codex_login_core(&state.sessions, &state.codex_login_cancels, workspace_id).await
}

#[tauri::command]
pub(crate) async fn codex_login_cancel(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "codex_login_cancel",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    codex_core::codex_login_cancel_core(&state.sessions, &state.codex_login_cancels, workspace_id)
        .await
}

#[tauri::command]
pub(crate) async fn skills_list(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "skills_list",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    codex_core::skills_list_core(&state.sessions, &state.workspaces, workspace_id).await
}

#[tauri::command]
pub(crate) async fn apps_list(
    workspace_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
    thread_id: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "apps_list",
            json!({
                "workspaceId": workspace_id,
                "cursor": cursor,
                "limit": limit,
                "threadId": thread_id
            }),
        )
        .await;
    }

    codex_core::apps_list_core(&state.sessions, workspace_id, cursor, limit, thread_id).await
}

#[tauri::command]
pub(crate) async fn respond_to_server_request(
    workspace_id: String,
    request_id: Value,
    result: Value,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if remote_backend::is_remote_mode(&*state).await {
        remote_backend::call_remote(
            &*state,
            app,
            "respond_to_server_request",
            json!({ "workspaceId": workspace_id, "requestId": request_id, "result": result }),
        )
        .await?;
        return Ok(());
    }

    codex_core::respond_to_server_request_core(&state.sessions, workspace_id, request_id, result)
        .await
}

#[tauri::command]
pub(crate) async fn remember_approval_rule(
    workspace_id: String,
    command: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    codex_core::remember_approval_rule_core(&state.workspaces, workspace_id, command).await
}

#[tauri::command]
pub(crate) async fn get_config_model(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "get_config_model",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    codex_core::get_config_model_core(&state.workspaces, workspace_id).await
}

/// Generates a commit message in the background without showing in the main chat
#[tauri::command]
pub(crate) async fn generate_commit_message(
    workspace_id: String,
    commit_message_model_id: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let value = remote_backend::call_remote(
            &*state,
            app,
            "generate_commit_message",
            json!({
                "workspaceId": workspace_id,
                "commitMessageModelId": commit_message_model_id,
            }),
        )
        .await?;
        return serde_json::from_value(value).map_err(|err| err.to_string());
    }

    let diff = crate::git::get_workspace_diff(&workspace_id, &state).await?;

    let commit_message_prompt = {
        let settings = state.app_settings.lock().await;
        settings.commit_message_prompt.clone()
    };
    crate::shared::codex_aux_core::generate_commit_message_core(
        &state.sessions,
        &state.workspaces,
        workspace_id,
        &diff,
        &commit_message_prompt,
        commit_message_model_id.as_deref(),
        |workspace_id, thread_id| {
            let _ = app.emit(
                "app-server-event",
                AppServerEvent {
                    workspace_id: workspace_id.to_string(),
                    message: json!({
                        "method": "codex/backgroundThread",
                        "params": {
                            "threadId": thread_id,
                            "action": "hide"
                        }
                    }),
                },
            );
        },
    )
    .await
}

#[tauri::command]
pub(crate) async fn generate_run_metadata(
    workspace_id: String,
    prompt: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "generate_run_metadata",
            json!({ "workspaceId": workspace_id, "prompt": prompt }),
        )
        .await;
    }

    crate::shared::codex_aux_core::generate_run_metadata_core(
        &state.sessions,
        &state.workspaces,
        workspace_id,
        &prompt,
        |workspace_id, thread_id| {
            let _ = app.emit(
                "app-server-event",
                AppServerEvent {
                    workspace_id: workspace_id.to_string(),
                    message: json!({
                        "method": "codex/backgroundThread",
                        "params": {
                            "threadId": thread_id,
                            "action": "hide"
                        }
                    }),
                },
            );
        },
    )
    .await
}

#[tauri::command]
pub(crate) async fn generate_agent_description(
    workspace_id: String,
    description: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<crate::shared::codex_aux_core::GeneratedAgentConfiguration, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let value = remote_backend::call_remote(
            &*state,
            app,
            "generate_agent_description",
            json!({ "workspaceId": workspace_id, "description": description }),
        )
        .await?;
        return serde_json::from_value(value).map_err(|err| err.to_string());
    }

    crate::shared::codex_aux_core::generate_agent_description_core(
        &state.sessions,
        &state.workspaces,
        workspace_id,
        &description,
        |workspace_id, thread_id| {
            let _ = app.emit(
                "app-server-event",
                AppServerEvent {
                    workspace_id: workspace_id.to_string(),
                    message: json!({
                        "method": "codex/backgroundThread",
                        "params": {
                            "threadId": thread_id,
                            "action": "hide"
                        }
                    }),
                },
            );
        },
    )
    .await
}
