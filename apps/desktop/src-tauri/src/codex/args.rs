use crate::types::{AppSettings, WorkspaceEntry};

pub(crate) fn parse_codex_args(value: Option<&str>) -> Result<Vec<String>, String> {
    let raw = match value {
        Some(raw) if !raw.trim().is_empty() => raw.trim(),
        _ => return Ok(Vec::new()),
    };
    shell_words::split(raw)
        .map_err(|err| format!("Invalid Codex args: {err}"))
        .map(|args| args.into_iter().filter(|arg| !arg.is_empty()).collect())
}

pub(crate) fn resolve_workspace_codex_args(
    _entry: &WorkspaceEntry,
    _parent_entry: Option<&WorkspaceEntry>,
    app_settings: Option<&AppSettings>,
) -> Option<String> {
    let settings = app_settings?;
    let base = settings
        .codex_args
        .as_deref()
        .and_then(normalize_codex_args);
    let gateway = model_gateway_runtime_args(settings);
    join_codex_args(base, gateway)
}

fn normalize_codex_args(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn model_gateway_runtime_args(settings: &AppSettings) -> Option<String> {
    if !settings.model_gateway.enabled {
        return None;
    }

    let mut args = Vec::new();
    if let Some(model) = settings
        .model_gateway
        .default_model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        args.extend(["-c".to_string(), format!("model={}", toml_string(model))]);
    }
    args.extend([
        "-c".to_string(),
        "model_provider=\"blackrain_gateway\"".to_string(),
        "-c".to_string(),
        "model_providers.blackrain_gateway.name=\"BlackRain Gateway\"".to_string(),
        "-c".to_string(),
        format!(
            "model_providers.blackrain_gateway.base_url=\"http://127.0.0.1:{}/v1\"",
            settings.model_gateway.port
        ),
        "-c".to_string(),
        "model_providers.blackrain_gateway.env_key=\"BLACKRAIN_GATEWAY_API_KEY\"".to_string(),
        "-c".to_string(),
        "model_providers.blackrain_gateway.wire_api=\"responses\"".to_string(),
    ]);
    Some(shell_words::join(args))
}

fn join_codex_args(base: Option<String>, extra: Option<String>) -> Option<String> {
    match (base, extra) {
        (Some(base), Some(extra)) => Some(format!("{base} {extra}")),
        (Some(base), None) => Some(base),
        (None, Some(extra)) => Some(extra),
        (None, None) => None,
    }
}

fn toml_string(value: &str) -> String {
    serde_json::to_string(value).expect("string serialization cannot fail")
}

#[cfg(test)]
mod tests {
    use super::{parse_codex_args, resolve_workspace_codex_args};
    use crate::types::{AppSettings, WorkspaceEntry, WorkspaceKind, WorkspaceSettings};

    #[test]
    fn parses_empty_args() {
        assert!(parse_codex_args(None).expect("parse none").is_empty());
        assert!(parse_codex_args(Some("   "))
            .expect("parse blanks")
            .is_empty());
    }

    #[test]
    fn parses_simple_args() {
        let args = parse_codex_args(Some("--profile personal --flag")).expect("parse args");
        assert_eq!(args, vec!["--profile", "personal", "--flag"]);
    }

    #[test]
    fn parses_quoted_args() {
        let args = parse_codex_args(Some("--path \"a b\" --name='c d'")).expect("parse args");
        assert_eq!(args, vec!["--path", "a b", "--name=c d"]);
    }

    #[test]
    fn resolves_workspace_codex_args_from_app_settings_only() {
        let mut app_settings = AppSettings::default();
        app_settings.model_gateway.enabled = false;
        app_settings.codex_args = Some("--profile app".to_string());

        let parent = WorkspaceEntry {
            id: "parent".to_string(),
            name: "Parent".to_string(),
            path: "/tmp/parent".to_string(),
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings::default(),
        };

        let child = WorkspaceEntry {
            id: "child".to_string(),
            name: "Child".to_string(),
            path: "/tmp/child".to_string(),
            kind: WorkspaceKind::Worktree,
            parent_id: Some(parent.id.clone()),
            worktree: None,
            settings: WorkspaceSettings::default(),
        };

        let resolved = resolve_workspace_codex_args(&child, Some(&parent), Some(&app_settings));
        assert_eq!(resolved.as_deref(), Some("--profile app"));

        let main = WorkspaceEntry {
            id: "main".to_string(),
            name: "Main".to_string(),
            path: "/tmp/main".to_string(),
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings::default(),
        };
        let resolved_main = resolve_workspace_codex_args(&main, None, Some(&app_settings));
        assert_eq!(resolved_main.as_deref(), Some("--profile app"));
    }

    #[test]
    fn adds_gateway_overrides_without_persisting_global_config() {
        let mut app_settings = AppSettings::default();
        app_settings.codex_args = Some("--profile app".to_string());
        app_settings.model_gateway.enabled = true;
        app_settings.model_gateway.port = 8899;
        app_settings.model_gateway.default_model = Some("deepseek-v4-pro".to_string());
        let entry = WorkspaceEntry {
            id: "main".to_string(),
            name: "Main".to_string(),
            path: "/tmp/main".to_string(),
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings::default(),
        };

        let resolved = resolve_workspace_codex_args(&entry, None, Some(&app_settings));
        let parsed = parse_codex_args(resolved.as_deref()).expect("parse resolved args");

        assert_eq!(&parsed[..2], ["--profile", "app"]);
        assert!(parsed.contains(&"model=\"deepseek-v4-pro\"".to_string()));
        assert!(parsed.contains(&"model_provider=\"blackrain_gateway\"".to_string()));
        assert!(parsed.contains(
            &"model_providers.blackrain_gateway.base_url=\"http://127.0.0.1:8899/v1\"".to_string()
        ));
    }
}
