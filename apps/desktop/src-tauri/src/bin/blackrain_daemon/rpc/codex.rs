use super::*;
use serde::de::DeserializeOwned;

fn parse_input<T: DeserializeOwned>(params: &Value) -> Result<T, String> {
    let input_value = params
        .as_object()
        .and_then(|map| map.get("input"))
        .cloned()
        .ok_or_else(|| "missing `input`".to_string())?;
    serde_json::from_value(input_value).map_err(|err| err.to_string())
}

pub(super) async fn try_handle(
    state: &DaemonState,
    method: &str,
    params: &Value,
) -> Option<Result<Value, String>> {
    match method {
        "get_codex_config_path" => {
            let path = match settings_core::get_codex_config_path_core() {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(Ok(Value::String(path)))
        }
        "get_config_model" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.get_config_model(workspace_id).await)
        }
        "start_thread" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.start_thread(workspace_id).await)
        }
        "resume_thread" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.resume_thread(workspace_id, thread_id).await)
        }
        "read_thread" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.read_thread(workspace_id, thread_id).await)
        }
        "thread_live_subscribe" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.thread_live_subscribe(workspace_id, thread_id).await)
        }
        "thread_live_unsubscribe" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.thread_live_unsubscribe(workspace_id, thread_id).await)
        }
        "fork_thread" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.fork_thread(workspace_id, thread_id).await)
        }
        "list_threads" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let cursor = parse_optional_string(params, "cursor");
            let limit = parse_optional_u32(params, "limit");
            let sort_key = parse_optional_string(params, "sortKey");
            Some(
                state
                    .list_threads(workspace_id, cursor, limit, sort_key)
                    .await,
            )
        }
        "list_mcp_server_status" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let cursor = parse_optional_string(params, "cursor");
            let limit = parse_optional_u32(params, "limit");
            Some(
                state
                    .list_mcp_server_status(workspace_id, cursor, limit)
                    .await,
            )
        }
        "archive_thread" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.archive_thread(workspace_id, thread_id).await)
        }
        "delete_thread" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.delete_thread(workspace_id, thread_id).await)
        }
        "thread_items_list" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let turn_id = parse_optional_string(params, "turnId");
            let cursor = parse_optional_string(params, "cursor");
            let limit = parse_optional_u32(params, "limit");
            Some(
                state
                    .thread_items_list(workspace_id, thread_id, turn_id, cursor, limit)
                    .await,
            )
        }
        "thread_background_terminals_list" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let cursor = parse_optional_string(params, "cursor");
            let limit = parse_optional_u32(params, "limit");
            Some(
                state
                    .thread_background_terminals_list(workspace_id, thread_id, cursor, limit)
                    .await,
            )
        }
        "thread_background_terminals_terminate" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let process_id = match parse_string(params, "processId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .thread_background_terminals_terminate(workspace_id, thread_id, process_id)
                    .await,
            )
        }
        "environment_info" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let environment_id = match parse_string(params, "environmentId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.environment_info(workspace_id, environment_id).await)
        }
        "skills_config_write" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let path = parse_optional_string(params, "path");
            let name = parse_optional_string(params, "name");
            let enabled = parse_optional_bool(params, "enabled").unwrap_or(false);
            Some(
                state
                    .skills_config_write(workspace_id, path, name, enabled)
                    .await,
            )
        }
        "skills_extra_roots_set" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let extra_roots = match parse_string_array(params, "extraRoots") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.skills_extra_roots_set(workspace_id, extra_roots).await)
        }
        "hooks_list" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let cwds = match parse_string_array(params, "cwds") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.hooks_list(workspace_id, cwds).await)
        }
        "plugin_list" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let cwds = parse_optional_string_array(params, "cwds");
            let marketplace_kinds = parse_optional_string_array(params, "marketplaceKinds");
            Some(
                state
                    .plugin_list(workspace_id, cwds, marketplace_kinds)
                    .await,
            )
        }
        "plugin_installed" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let cwds = parse_optional_string_array(params, "cwds");
            let install_suggestion_plugin_names =
                parse_optional_string_array(params, "installSuggestionPluginNames");
            Some(
                state
                    .plugin_installed(workspace_id, cwds, install_suggestion_plugin_names)
                    .await,
            )
        }
        "plugin_read" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let plugin_name = match parse_string(params, "pluginName") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let marketplace_path = parse_optional_string(params, "marketplacePath");
            let remote_marketplace_name = parse_optional_string(params, "remoteMarketplaceName");
            Some(
                state
                    .plugin_read(
                        workspace_id,
                        plugin_name,
                        marketplace_path,
                        remote_marketplace_name,
                    )
                    .await,
            )
        }
        "plugin_install" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let plugin_name = match parse_string(params, "pluginName") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let marketplace_path = parse_optional_string(params, "marketplacePath");
            let remote_marketplace_name = parse_optional_string(params, "remoteMarketplaceName");
            Some(
                state
                    .plugin_install(
                        workspace_id,
                        plugin_name,
                        marketplace_path,
                        remote_marketplace_name,
                    )
                    .await,
            )
        }
        "plugin_uninstall" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let plugin_id = match parse_string(params, "pluginId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.plugin_uninstall(workspace_id, plugin_id).await)
        }
        "plugin_skill_read" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let remote_marketplace_name = match parse_string(params, "remoteMarketplaceName") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let remote_plugin_id = match parse_string(params, "remotePluginId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let skill_name = match parse_string(params, "skillName") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .plugin_skill_read(
                        workspace_id,
                        remote_marketplace_name,
                        remote_plugin_id,
                        skill_name,
                    )
                    .await,
            )
        }
        "marketplace_add" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let source = match parse_string(params, "source") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let ref_name = parse_optional_string(params, "refName");
            let sparse_paths = parse_optional_string_array(params, "sparsePaths");
            Some(
                state
                    .marketplace_add(workspace_id, source, ref_name, sparse_paths)
                    .await,
            )
        }
        "marketplace_remove" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let marketplace_name = match parse_string(params, "marketplaceName") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.marketplace_remove(workspace_id, marketplace_name).await)
        }
        "marketplace_upgrade" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let marketplace_name = parse_optional_string(params, "marketplaceName");
            Some(state.marketplace_upgrade(workspace_id, marketplace_name).await)
        }
        "thread_search" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let search_term = match parse_string(params, "searchTerm") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let cursor = parse_optional_string(params, "cursor");
            let limit = parse_optional_u32(params, "limit");
            let archived = parse_optional_bool(params, "archived");
            let sort_key = parse_optional_string(params, "sortKey");
            let sort_direction = parse_optional_string(params, "sortDirection");
            let source_kinds = parse_optional_string_array(params, "sourceKinds");
            Some(
                state
                    .thread_search(
                        workspace_id,
                        search_term,
                        cursor,
                        limit,
                        archived,
                        sort_key,
                        sort_direction,
                        source_kinds,
                    )
                    .await,
            )
        }
        "thread_goal_get" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.thread_goal_get(workspace_id, thread_id).await)
        }
        "thread_goal_clear" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.thread_goal_clear(workspace_id, thread_id).await)
        }
        "thread_memory_mode_set" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let mode = match parse_string(params, "mode") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.thread_memory_mode_set(workspace_id, thread_id, mode).await)
        }
        "memory_reset" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.memory_reset(workspace_id).await)
        }
        "thread_unarchive" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.thread_unarchive(workspace_id, thread_id).await)
        }
        "thread_loaded_list" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let cursor = parse_optional_string(params, "cursor");
            let limit = parse_optional_u32(params, "limit");
            Some(state.thread_loaded_list(workspace_id, cursor, limit).await)
        }
        "thread_shell_command" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let command = match parse_string(params, "command") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .thread_shell_command(workspace_id, thread_id, command)
                    .await,
            )
        }
        "thread_background_terminals_clean" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .thread_background_terminals_clean(workspace_id, thread_id)
                    .await,
            )
        }
        "thread_goal_set" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let inner = parse_optional_value(params, "params").unwrap_or(Value::Null);
            Some(state.thread_goal_set(workspace_id, inner).await)
        }
        "thread_settings_update" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let inner = parse_optional_value(params, "params").unwrap_or(Value::Null);
            Some(state.thread_settings_update(workspace_id, inner).await)
        }
        "thread_metadata_update" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let inner = parse_optional_value(params, "params").unwrap_or(Value::Null);
            Some(state.thread_metadata_update(workspace_id, inner).await)
        }
        "thread_approve_guardian_denied_action" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let inner = parse_optional_value(params, "params").unwrap_or(Value::Null);
            Some(
                state
                    .thread_approve_guardian_denied_action(workspace_id, inner)
                    .await,
            )
        }
        "model_provider_capabilities_read" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.model_provider_capabilities_read(workspace_id).await)
        }
        "experimental_feature_enablement_set" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let enablement = parse_optional_value(params, "enablement").unwrap_or(Value::Null);
            Some(
                state
                    .experimental_feature_enablement_set(workspace_id, enablement)
                    .await,
            )
        }
        "permission_profile_list" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let cursor = parse_optional_string(params, "cursor");
            let limit = parse_optional_u32(params, "limit");
            let cwd = parse_optional_string(params, "cwd");
            Some(
                state
                    .permission_profile_list(workspace_id, cursor, limit, cwd)
                    .await,
            )
        }
        "account_logout" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.account_logout(workspace_id).await)
        }
        "mcp_server_oauth_login" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let name = match parse_string(params, "name") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = parse_optional_string(params, "threadId");
            let scopes = parse_optional_string_array(params, "scopes");
            let timeout_secs = params.get("timeoutSecs").and_then(Value::as_i64);
            Some(
                state
                    .mcp_server_oauth_login(workspace_id, name, thread_id, scopes, timeout_secs)
                    .await,
            )
        }
        "mcp_resource_read" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let server = match parse_string(params, "server") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let uri = match parse_string(params, "uri") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = parse_optional_string(params, "threadId");
            Some(
                state
                    .mcp_resource_read(workspace_id, server, uri, thread_id)
                    .await,
            )
        }
        "mcp_server_tool_call" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let server = match parse_string(params, "server") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let tool = match parse_string(params, "tool") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let arguments = parse_optional_value(params, "arguments");
            let meta = parse_optional_value(params, "meta");
            Some(
                state
                    .mcp_server_tool_call(workspace_id, thread_id, server, tool, arguments, meta)
                    .await,
            )
        }
        "windows_sandbox_setup_start" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let mode = match parse_string(params, "mode") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let cwd = parse_optional_string(params, "cwd");
            Some(
                state
                    .windows_sandbox_setup_start(workspace_id, mode, cwd)
                    .await,
            )
        }
        "windows_sandbox_readiness" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.windows_sandbox_readiness(workspace_id).await)
        }
        "external_agent_config_detect" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let include_home = parse_optional_bool(params, "includeHome").unwrap_or(false);
            let cwds = parse_optional_string_array(params, "cwds");
            Some(
                state
                    .external_agent_config_detect(workspace_id, include_home, cwds)
                    .await,
            )
        }
        "external_agent_config_import" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let inner = parse_optional_value(params, "params").unwrap_or(Value::Null);
            Some(
                state
                    .external_agent_config_import(workspace_id, inner)
                    .await,
            )
        }
        "external_agent_config_import_histories_read" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .external_agent_config_import_histories_read(workspace_id)
                    .await,
            )
        }
        "rollback_thread" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let turn_id = match parse_string(params, "turnId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.rollback_thread(workspace_id, thread_id, turn_id).await)
        }
        "compact_thread" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.compact_thread(workspace_id, thread_id).await)
        }
        "set_thread_name" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let name = match parse_string(params, "name") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.set_thread_name(workspace_id, thread_id, name).await)
        }
        "send_user_message" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let text = match parse_string(params, "text") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let model = parse_optional_string(params, "model");
            let effort = parse_optional_string(params, "effort");
            let service_tier = parse_optional_nullable_string(params, "serviceTier");
            let access_mode = parse_optional_string(params, "accessMode");
            let images = parse_optional_string_array(params, "images");
            let app_mentions = parse_optional_value(params, "appMentions")
                .and_then(|value| value.as_array().cloned());
            let collaboration_mode = parse_optional_value(params, "collaborationMode");
            Some(
                state
                    .send_user_message(
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
                    .await,
            )
        }
        "turn_interrupt" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let turn_id = match parse_string(params, "turnId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.turn_interrupt(workspace_id, thread_id, turn_id).await)
        }
        "turn_steer" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let turn_id = match parse_string(params, "turnId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let text = match parse_string(params, "text") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let images = parse_optional_string_array(params, "images");
            let app_mentions = parse_optional_value(params, "appMentions")
                .and_then(|value| value.as_array().cloned());
            Some(
                state
                    .turn_steer(workspace_id, thread_id, turn_id, text, images, app_mentions)
                    .await,
            )
        }
        "start_review" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let target = match params
                .as_object()
                .and_then(|map| map.get("target"))
                .cloned()
                .ok_or("missing `target`")
            {
                Ok(value) => value,
                Err(err) => return Some(Err(err.to_string())),
            };
            let delivery = parse_optional_string(params, "delivery");
            Some(
                state
                    .start_review(workspace_id, thread_id, target, delivery)
                    .await,
            )
        }
        "model_list" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.model_list(workspace_id).await)
        }
        "experimental_feature_list" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let cursor = parse_optional_string(params, "cursor");
            let limit = parse_optional_u32(params, "limit");
            Some(
                state
                    .experimental_feature_list(workspace_id, cursor, limit)
                    .await,
            )
        }
        "collaboration_mode_list" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.collaboration_mode_list(workspace_id).await)
        }
        "set_codex_feature_flag" => {
            let feature_key = match parse_string(params, "featureKey") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let enabled = match parse_optional_bool(params, "enabled") {
                Some(value) => value,
                None => return Some(Err("missing or invalid `enabled`".to_string())),
            };
            Some(
                state
                    .set_codex_feature_flag(feature_key, enabled)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "get_agents_settings" => Some(
            state
                .get_agents_settings()
                .await
                .and_then(|value| serde_json::to_value(value).map_err(|err| err.to_string())),
        ),
        "set_agents_core_settings" => {
            let input = match parse_input::<agents_config_core::SetAgentsCoreInput>(params) {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .set_agents_core_settings(input)
                    .await
                    .and_then(|value| serde_json::to_value(value).map_err(|err| err.to_string())),
            )
        }
        "create_agent" => {
            let input = match parse_input::<agents_config_core::CreateAgentInput>(params) {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .create_agent(input)
                    .await
                    .and_then(|value| serde_json::to_value(value).map_err(|err| err.to_string())),
            )
        }
        "update_agent" => {
            let input = match parse_input::<agents_config_core::UpdateAgentInput>(params) {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .update_agent(input)
                    .await
                    .and_then(|value| serde_json::to_value(value).map_err(|err| err.to_string())),
            )
        }
        "delete_agent" => {
            let input = match parse_input::<agents_config_core::DeleteAgentInput>(params) {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .delete_agent(input)
                    .await
                    .and_then(|value| serde_json::to_value(value).map_err(|err| err.to_string())),
            )
        }
        "read_agent_config_toml" => {
            let agent_name = match parse_string(params, "agentName") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .read_agent_config_toml(agent_name)
                    .await
                    .and_then(|value| serde_json::to_value(value).map_err(|err| err.to_string())),
            )
        }
        "write_agent_config_toml" => {
            let agent_name = match parse_string(params, "agentName") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let content = match parse_string(params, "content") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .write_agent_config_toml(agent_name, content)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "account_rate_limits" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.account_rate_limits(workspace_id).await)
        }
        "account_read" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.account_read(workspace_id).await)
        }
        "codex_login" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.codex_login(workspace_id).await)
        }
        "codex_login_cancel" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.codex_login_cancel(workspace_id).await)
        }
        "skills_list" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.skills_list(workspace_id).await)
        }
        "apps_list" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let cursor = parse_optional_string(params, "cursor");
            let limit = parse_optional_u32(params, "limit");
            let thread_id = parse_optional_string(params, "threadId");
            Some(
                state
                    .apps_list(workspace_id, cursor, limit, thread_id)
                    .await,
            )
        }
        "respond_to_server_request" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let map = match params.as_object().ok_or("missing requestId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err.to_string())),
            };
            let request_id = match map
                .get("requestId")
                .cloned()
                .filter(|value| value.is_number() || value.is_string())
                .ok_or("missing requestId")
            {
                Ok(value) => value,
                Err(err) => return Some(Err(err.to_string())),
            };
            let result = match map.get("result").cloned().ok_or("missing `result`") {
                Ok(value) => value,
                Err(err) => return Some(Err(err.to_string())),
            };
            Some(
                state
                    .respond_to_server_request(workspace_id, request_id, result)
                    .await,
            )
        }
        "remember_approval_rule" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let command = match parse_string_array(params, "command") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.remember_approval_rule(workspace_id, command).await)
        }
        "codex_doctor" => {
            let codex_bin = parse_optional_string(params, "codexBin");
            let codex_args = parse_optional_string(params, "codexArgs");
            Some(state.codex_doctor(codex_bin, codex_args).await)
        }
        "generate_run_metadata" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let prompt = match parse_string(params, "prompt") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.generate_run_metadata(workspace_id, prompt).await)
        }
        "generate_agent_description" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let description = match parse_string(params, "description") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .generate_agent_description(workspace_id, description)
                    .await
                    .and_then(|value| serde_json::to_value(value).map_err(|err| err.to_string())),
            )
        }
        _ => None,
    }
}
