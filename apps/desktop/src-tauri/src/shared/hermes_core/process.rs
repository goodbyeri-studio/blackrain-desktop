use std::collections::{BTreeMap, VecDeque};
use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::TcpStream;
use tokio::process::Child;
use tokio::sync::Mutex;
use tokio::time::{sleep, timeout, Instant};

use super::client::HermesApiClient;
use super::config::HermesLaunchEnvironment;
use super::types::{
    WorkError, WorkErrorKind, WorkRuntimeState, WorkRuntimeStatus, WORK_SCHEMA_VERSION,
};
use crate::shared::process_core::{kill_child_process_tree, tokio_command};

const EXPECTED_HERMES_VERSION: &str = "0.18.2";
const DEFAULT_LOG_MAX_BYTES: u64 = 2 * 1024 * 1024;
const DEFAULT_LOG_BACKUPS: usize = 3;
const DEFAULT_LOG_MEMORY_LINES: usize = 400;
const MAX_LOG_LINE_CHARS: usize = 4096;

#[derive(Debug, Clone)]
pub(crate) struct HermesRuntimeLayout {
    pub(crate) root: PathBuf,
    pub(crate) executable: PathBuf,
    pub(crate) python: PathBuf,
    pub(crate) runtime_manifest: PathBuf,
    pub(crate) checksums: PathBuf,
}

impl HermesRuntimeLayout {
    pub(crate) fn from_root(root: PathBuf) -> Self {
        Self {
            executable: root.join("venv").join("Scripts").join("hermes.exe"),
            python: root.join("venv").join("Scripts").join("python.exe"),
            runtime_manifest: root.join("provenance").join("runtime-manifest.json"),
            checksums: root.join("SHA256SUMS"),
            root,
        }
    }

    pub(crate) fn inspect(&self) -> Result<(), WorkError> {
        let required = [
            ("Hermes entrypoint", &self.executable),
            ("Hermes venv Python", &self.python),
            ("Hermes runtime manifest", &self.runtime_manifest),
            ("Hermes runtime checksums", &self.checksums),
        ];
        let missing = required
            .iter()
            .filter(|(_, path)| !path.is_file())
            .map(|(label, path)| format!("{label}: {}", path.display()))
            .collect::<Vec<_>>();
        if !missing.is_empty() {
            let mut details = BTreeMap::new();
            details.insert("missingFiles".into(), serde_json::json!(missing));
            return Err(WorkError {
                kind: WorkErrorKind::Runtime,
                code: "hermes_runtime_not_installed".into(),
                message: "The bundled Hermes runtime is missing or incomplete.".into(),
                retryable: false,
                http_status: None,
                request_id: None,
                details,
            });
        }
        let canonical_root = fs::canonicalize(&self.root).map_err(|error| {
            runtime_error(
                "hermes_runtime_root_invalid",
                &format!("Unable to resolve Hermes runtime root: {error}"),
                false,
            )
        })?;
        let canonical_executable = fs::canonicalize(&self.executable).map_err(|error| {
            runtime_error(
                "hermes_runtime_entrypoint_invalid",
                &format!("Unable to resolve Hermes runtime entrypoint: {error}"),
                false,
            )
        })?;
        if !canonical_executable.starts_with(&canonical_root) {
            return Err(runtime_error(
                "hermes_runtime_entrypoint_escaped",
                "Hermes runtime entrypoint resolves outside the bundled runtime root.",
                false,
            ));
        }
        let manifest = fs::read(&self.runtime_manifest)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
            .ok_or_else(|| {
                runtime_error(
                    "hermes_runtime_manifest_invalid",
                    "Hermes runtime manifest is not valid JSON.",
                    false,
                )
            })?;
        if manifest
            .pointer("/hermes/version")
            .and_then(|value| value.as_str())
            != Some(EXPECTED_HERMES_VERSION)
        {
            return Err(runtime_error(
                "hermes_runtime_manifest_version_mismatch",
                "Hermes runtime manifest does not match the supported version.",
                false,
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub(crate) struct HermesSupervisorOptions {
    pub(crate) startup_timeout: Duration,
    pub(crate) poll_interval: Duration,
    pub(crate) graceful_stop_timeout: Duration,
    pub(crate) log_max_bytes: u64,
    pub(crate) log_backups: usize,
    pub(crate) log_memory_lines: usize,
}

impl Default for HermesSupervisorOptions {
    fn default() -> Self {
        Self {
            startup_timeout: Duration::from_secs(30),
            poll_interval: Duration::from_millis(200),
            graceful_stop_timeout: Duration::from_secs(4),
            log_max_bytes: DEFAULT_LOG_MAX_BYTES,
            log_backups: DEFAULT_LOG_BACKUPS,
            log_memory_lines: DEFAULT_LOG_MEMORY_LINES,
        }
    }
}

struct HermesProcessState {
    child: Option<Child>,
    status: WorkRuntimeStatus,
    port: Option<u16>,
}

pub(crate) struct HermesProcessSupervisor {
    layout: HermesRuntimeLayout,
    home: PathBuf,
    options: HermesSupervisorOptions,
    start_gate: Mutex<()>,
    state: Mutex<HermesProcessState>,
    logs: Arc<StdMutex<LogState>>,
}

impl HermesProcessSupervisor {
    pub(crate) fn new(layout: HermesRuntimeLayout, home: PathBuf, log_path: PathBuf) -> Self {
        Self::with_options(layout, home, log_path, HermesSupervisorOptions::default())
    }

    pub(crate) fn with_options(
        layout: HermesRuntimeLayout,
        home: PathBuf,
        log_path: PathBuf,
        options: HermesSupervisorOptions,
    ) -> Self {
        let (initial_state, initial_error) = match layout.inspect() {
            Ok(()) => (WorkRuntimeState::Stopped, None),
            Err(error) => (WorkRuntimeState::NotInstalled, Some(error)),
        };
        let status = WorkRuntimeStatus {
            schema_version: WORK_SCHEMA_VERSION,
            state: initial_state,
            version: None,
            pid: None,
            base_url: None,
            started_at: None,
            last_error: initial_error,
        };
        Self {
            layout,
            home,
            logs: Arc::new(StdMutex::new(LogState::new(
                log_path,
                options.log_max_bytes,
                options.log_backups,
                options.log_memory_lines,
            ))),
            options,
            start_gate: Mutex::new(()),
            state: Mutex::new(HermesProcessState {
                child: None,
                status,
                port: None,
            }),
        }
    }

    pub(crate) async fn status(&self) -> WorkRuntimeStatus {
        self.refresh_process_state().await;
        self.state.lock().await.status.clone()
    }

    pub(crate) async fn start(
        &self,
        environment: HermesLaunchEnvironment,
    ) -> Result<WorkRuntimeStatus, WorkError> {
        let gate = match self.start_gate.try_lock() {
            Ok(gate) => gate,
            Err(_) => {
                let _gate = self.start_gate.lock().await;
                let status = self.status().await;
                return if status.state == WorkRuntimeState::Ready {
                    Ok(status)
                } else {
                    Err(status.last_error.unwrap_or_else(|| {
                        runtime_error(
                            "hermes_concurrent_start_failed",
                            "The in-flight Hermes start did not become ready.",
                            true,
                        )
                    }))
                };
            }
        };
        let result = self.start_as_leader(environment).await;
        drop(gate);
        result
    }

    async fn start_as_leader(
        &self,
        environment: HermesLaunchEnvironment,
    ) -> Result<WorkRuntimeStatus, WorkError> {
        self.refresh_process_state().await;
        let port = environment
            .values()
            .get("API_SERVER_PORT")
            .and_then(|value| value.parse::<u16>().ok())
            .filter(|value| *value != 0)
            .ok_or_else(|| {
                runtime_error(
                    "invalid_hermes_port",
                    "Hermes launch environment has no valid managed port.",
                    false,
                )
            })?;
        let bearer = environment
            .values()
            .get("API_SERVER_KEY")
            .cloned()
            .ok_or_else(|| {
                runtime_error(
                    "missing_hermes_bearer",
                    "Hermes launch environment has no API bearer.",
                    false,
                )
            })?;
        let stale_child = {
            let mut state = self.state.lock().await;
            if state.status.state == WorkRuntimeState::Ready && state.port == Some(port) {
                return Ok(state.status.clone());
            }
            if state.child.is_some() {
                state.status.state = WorkRuntimeState::Stopping;
                state.child.take()
            } else {
                None
            }
        };
        if let Some(mut child) = stale_child {
            terminate_child_gracefully(&mut child, self.options.graceful_stop_timeout).await;
        }
        if let Err(error) = self.layout.inspect() {
            self.set_failed(WorkRuntimeState::NotInstalled, error.clone(), None)
                .await;
            return Err(error);
        }
        fs::create_dir_all(&self.home).map_err(|error| {
            runtime_error(
                "hermes_home_create_failed",
                &format!("Unable to create isolated HERMES_HOME: {error}"),
                false,
            )
        })?;

        let base_url = format!("http://127.0.0.1:{port}");
        if loopback_port_is_open(port).await {
            let error = classify_port_conflict(&base_url, &bearer).await;
            self.set_failed(WorkRuntimeState::Degraded, error.clone(), Some(base_url))
                .await;
            return Err(error);
        }

        let secrets = environment
            .values()
            .iter()
            .filter(|(key, value)| {
                !value.is_empty()
                    && (key.contains("KEY") || key.contains("TOKEN") || key.contains("SECRET"))
            })
            .map(|(_, value)| value.clone())
            .collect::<Vec<_>>();
        {
            let mut logs = self.logs.lock().unwrap_or_else(|error| error.into_inner());
            logs.set_secrets(secrets);
            logs.append("supervisor", "Starting managed Hermes runtime.");
        }

        let mut command = tokio_command(&self.layout.executable);
        command
            .arg("gateway")
            .current_dir(&self.home)
            .env_clear()
            .envs(safe_parent_environment())
            .envs(environment.values())
            .env("PYTHONUTF8", "1")
            .env("PYTHONDONTWRITEBYTECODE", "1")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                let error = runtime_error(
                    "hermes_spawn_failed",
                    &format!("Unable to start bundled Hermes runtime: {error}"),
                    true,
                );
                self.set_failed(WorkRuntimeState::Crashed, error.clone(), Some(base_url))
                    .await;
                return Err(error);
            }
        };
        let pid = child.id();
        if let Some(stdout) = child.stdout.take() {
            spawn_log_reader(stdout, "stdout", Arc::clone(&self.logs));
        }
        if let Some(stderr) = child.stderr.take() {
            spawn_log_reader(stderr, "stderr", Arc::clone(&self.logs));
        }
        {
            let mut state = self.state.lock().await;
            state.child = Some(child);
            state.port = Some(port);
            state.status = WorkRuntimeStatus {
                schema_version: WORK_SCHEMA_VERSION,
                state: WorkRuntimeState::Starting,
                version: None,
                pid,
                base_url: Some(base_url.clone()),
                started_at: Some(now_unix_seconds()),
                last_error: None,
            };
        }

        let readiness_request_timeout = self.options.startup_timeout.min(Duration::from_secs(2));
        let client = match HermesApiClient::with_timeouts(
            &base_url,
            &bearer,
            readiness_request_timeout,
            Duration::from_secs(1),
        ) {
            Ok(client) => client,
            Err(error) => {
                self.fail_start(error.clone()).await;
                return Err(error);
            }
        };
        let deadline = Instant::now() + self.options.startup_timeout;
        loop {
            if let Some(error) = self.detect_early_exit().await {
                self.set_failed(WorkRuntimeState::Crashed, error.clone(), Some(base_url))
                    .await;
                return Err(error);
            }
            let attempt_error = match client.health().await {
                Ok(health) => {
                    if health.version != EXPECTED_HERMES_VERSION {
                        let error = runtime_error(
                            "hermes_version_mismatch",
                            &format!(
                                "Managed Hermes reported version {}, expected {}.",
                                health.version, EXPECTED_HERMES_VERSION
                            ),
                            false,
                        );
                        self.fail_start(error.clone()).await;
                        return Err(error);
                    }
                    match client.capabilities().await {
                        Ok(capabilities) => {
                            if let Err(error) =
                                HermesApiClient::validate_required_capabilities(&capabilities)
                            {
                                self.fail_start(error.clone()).await;
                                return Err(error);
                            }
                            match client.models().await {
                                Ok(models) if !models.data.is_empty() => {
                                    let mut state = self.state.lock().await;
                                    state.status.state = WorkRuntimeState::Ready;
                                    state.status.version = Some(health.version);
                                    state.status.last_error = None;
                                    self.logs
                                        .lock()
                                        .unwrap_or_else(|error| error.into_inner())
                                        .append(
                                            "supervisor",
                                            "Hermes health and capabilities are ready.",
                                        );
                                    return Ok(state.status.clone());
                                }
                                Ok(_) => runtime_error(
                                    "hermes_models_empty",
                                    "Hermes returned no available models.",
                                    true,
                                ),
                                Err(error) => error,
                            }
                        }
                        Err(error) => error,
                    }
                }
                Err(error) => error,
            };
            if Instant::now() >= deadline {
                let mut error = runtime_error(
                    "hermes_start_timeout",
                    "Hermes did not become ready before the startup timeout.",
                    true,
                );
                error.details.insert(
                    "lastError".into(),
                    serde_json::to_value(&attempt_error).unwrap_or_default(),
                );
                self.fail_start(error.clone()).await;
                return Err(error);
            }
            sleep(self.options.poll_interval).await;
        }
    }

    pub(crate) async fn stop(&self) -> Result<WorkRuntimeStatus, WorkError> {
        let _gate = self.start_gate.lock().await;
        let child = {
            let mut state = self.state.lock().await;
            state.status.state = WorkRuntimeState::Stopping;
            state.child.take()
        };
        if let Some(mut child) = child {
            terminate_child_gracefully(&mut child, self.options.graceful_stop_timeout).await;
        }
        let mut state = self.state.lock().await;
        state.port = None;
        state.status.state = if self.layout.inspect().is_ok() {
            WorkRuntimeState::Stopped
        } else {
            WorkRuntimeState::NotInstalled
        };
        state.status.pid = None;
        state.status.base_url = None;
        state.status.started_at = None;
        state.status.last_error = None;
        self.logs
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .append("supervisor", "Managed Hermes runtime stopped.");
        Ok(state.status.clone())
    }

    pub(crate) fn recent_logs(&self) -> Vec<String> {
        self.logs
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .lines
            .iter()
            .cloned()
            .collect()
    }

    async fn refresh_process_state(&self) {
        let mut state = self.state.lock().await;
        let Some(child) = state.child.as_mut() else {
            if state.status.state == WorkRuntimeState::NotInstalled && self.layout.inspect().is_ok()
            {
                state.status.state = WorkRuntimeState::Stopped;
                state.status.last_error = None;
            }
            return;
        };
        match child.try_wait() {
            Ok(Some(exit)) => {
                let error = runtime_error(
                    "hermes_process_exited",
                    &format!("Managed Hermes process exited with status {exit}."),
                    true,
                );
                state.child = None;
                state.port = None;
                state.status.state = if exit.success() {
                    WorkRuntimeState::Stopped
                } else {
                    WorkRuntimeState::Crashed
                };
                state.status.pid = None;
                state.status.last_error = (!exit.success()).then_some(error);
            }
            Ok(None) => state.status.pid = child.id(),
            Err(error) => {
                state.status.state = WorkRuntimeState::Degraded;
                state.status.last_error = Some(runtime_error(
                    "hermes_process_inspection_failed",
                    &format!("Unable to inspect Hermes process: {error}"),
                    true,
                ));
            }
        }
    }

    async fn detect_early_exit(&self) -> Option<WorkError> {
        let mut state = self.state.lock().await;
        let child = state.child.as_mut()?;
        match child.try_wait() {
            Ok(Some(exit)) => {
                state.child = None;
                state.port = None;
                Some(runtime_error(
                    "hermes_process_exited_during_start",
                    &format!("Hermes exited during startup with status {exit}."),
                    true,
                ))
            }
            Ok(None) => None,
            Err(error) => Some(runtime_error(
                "hermes_process_inspection_failed",
                &format!("Unable to inspect Hermes startup process: {error}"),
                true,
            )),
        }
    }

    async fn fail_start(&self, error: WorkError) {
        let child = self.state.lock().await.child.take();
        if let Some(mut child) = child {
            terminate_child_gracefully(&mut child, self.options.graceful_stop_timeout).await;
        }
        self.set_failed(WorkRuntimeState::Crashed, error, None)
            .await;
    }

    async fn set_failed(
        &self,
        state_value: WorkRuntimeState,
        error: WorkError,
        base_url: Option<String>,
    ) {
        self.logs
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .append("supervisor", &format!("{}: {}", error.code, error.message));
        let mut state = self.state.lock().await;
        state.child = None;
        state.port = None;
        state.status.state = state_value;
        state.status.pid = None;
        if let Some(base_url) = base_url {
            state.status.base_url = Some(base_url);
        }
        state.status.last_error = Some(error);
    }
}

async fn loopback_port_is_open(port: u16) -> bool {
    timeout(
        Duration::from_millis(200),
        TcpStream::connect(("127.0.0.1", port)),
    )
    .await
    .is_ok_and(|result| result.is_ok())
}

async fn classify_port_conflict(base_url: &str, bearer: &str) -> WorkError {
    let Ok(client) = HermesApiClient::with_timeouts(
        base_url,
        bearer,
        Duration::from_secs(1),
        Duration::from_millis(500),
    ) else {
        return runtime_error(
            "hermes_port_in_use",
            "The managed Hermes loopback port is already in use.",
            true,
        );
    };
    match client.health().await {
        Ok(health) if health.platform == "hermes-agent" => match client.capabilities().await {
            Ok(_) => runtime_error(
                "hermes_unowned_instance",
                "A Hermes instance is already listening on the managed port, but it is not owned by this supervisor.",
                true,
            ),
            Err(error) if error.kind == WorkErrorKind::Authentication => runtime_error(
                "hermes_bearer_mismatch_instance",
                "A Hermes instance with a different bearer is already listening on the managed port.",
                true,
            ),
            Err(_) => runtime_error(
                "hermes_existing_instance_unverified",
                "A Hermes-like process is already listening on the managed port but failed capability verification.",
                true,
            ),
        },
        _ => runtime_error(
            "hermes_port_in_use",
            "The managed Hermes loopback port is already in use by an unknown process.",
            true,
        ),
    }
}

async fn terminate_child_gracefully(child: &mut Child, graceful_timeout: Duration) {
    let Some(pid) = child.id() else {
        let _ = child.wait().await;
        return;
    };

    #[cfg(windows)]
    {
        let _ = tokio_command("taskkill")
            .args(["/PID", &pid.to_string(), "/T"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .await;
    }
    #[cfg(unix)]
    unsafe {
        libc::kill(pid as i32, libc::SIGTERM);
    }

    if timeout(graceful_timeout, child.wait()).await.is_ok() {
        return;
    }
    kill_child_process_tree(child).await;
    let _ = child.wait().await;
}

fn safe_parent_environment() -> Vec<(OsString, OsString)> {
    const ALLOWED: &[&str] = &[
        "APPDATA",
        "COMSPEC",
        "HOME",
        "LANG",
        "LOCALAPPDATA",
        "PATH",
        "PATHEXT",
        "SYSTEMROOT",
        "TEMP",
        "TMP",
        "USERPROFILE",
        "WINDIR",
    ];
    std::env::vars_os()
        .filter(|(key, _)| {
            let key = key.to_string_lossy();
            ALLOWED
                .iter()
                .any(|allowed| key.eq_ignore_ascii_case(allowed))
        })
        .collect()
}

fn spawn_log_reader<R>(reader: R, source: &'static str, logs: Arc<StdMutex<LogState>>)
where
    R: tokio::io::AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let mut lines = BufReader::new(reader).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            logs.lock()
                .unwrap_or_else(|error| error.into_inner())
                .append(source, &line);
        }
    });
}

struct LogState {
    path: PathBuf,
    max_bytes: u64,
    backups: usize,
    max_memory_lines: usize,
    secrets: Vec<String>,
    lines: VecDeque<String>,
}

impl LogState {
    fn new(path: PathBuf, max_bytes: u64, backups: usize, max_memory_lines: usize) -> Self {
        Self {
            path,
            max_bytes: max_bytes.max(1024),
            backups,
            max_memory_lines: max_memory_lines.max(10),
            secrets: Vec::new(),
            lines: VecDeque::new(),
        }
    }

    fn set_secrets(&mut self, secrets: Vec<String>) {
        self.secrets = secrets;
    }

    fn append(&mut self, source: &str, line: &str) {
        let sanitized = redact_log_line(line, &self.secrets);
        let timestamp = now_unix_seconds();
        let rendered = format!("{timestamp:.3} [{source}] {sanitized}");
        self.lines.push_back(rendered.clone());
        while self.lines.len() > self.max_memory_lines {
            self.lines.pop_front();
        }
        if let Some(parent) = self.path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if fs::metadata(&self.path)
            .ok()
            .is_some_and(|metadata| metadata.len() >= self.max_bytes)
        {
            self.rotate();
        }
        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
        {
            let _ = writeln!(file, "{rendered}");
        }
    }

    fn rotate(&self) {
        if self.backups == 0 {
            let _ = fs::remove_file(&self.path);
            return;
        }
        for index in (1..self.backups).rev() {
            let from = numbered_log_path(&self.path, index);
            let to = numbered_log_path(&self.path, index + 1);
            if from.exists() {
                let _ = fs::rename(from, to);
            }
        }
        if self.path.exists() {
            let _ = fs::rename(&self.path, numbered_log_path(&self.path, 1));
        }
    }
}

fn numbered_log_path(path: &Path, index: usize) -> PathBuf {
    PathBuf::from(format!("{}.{}", path.to_string_lossy(), index))
}

fn redact_log_line(line: &str, secrets: &[String]) -> String {
    let mut output = line.to_string();
    for secret in secrets {
        if !secret.is_empty() {
            output = output.replace(secret, "<redacted>");
        }
    }
    let lower = output.to_ascii_lowercase();
    if [
        "conversation_history",
        "\"content\"",
        "\"input\"",
        "prompt=",
        "prompt:",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
    {
        output = "<redacted potentially sensitive Hermes content>".into();
    }
    output.chars().take(MAX_LOG_LINE_CHARS).collect()
}

fn runtime_error(code: &str, message: &str, retryable: bool) -> WorkError {
    WorkError {
        kind: WorkErrorKind::Runtime,
        code: code.into(),
        message: message.into(),
        retryable,
        http_status: None,
        request_id: None,
        details: BTreeMap::new(),
    }
}

fn now_unix_seconds() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::future::Future;
    use std::net::TcpListener;
    use std::path::{Path, PathBuf};
    use std::sync::Arc;
    use std::time::Duration;

    use super::{
        classify_port_conflict, redact_log_line, HermesProcessSupervisor, HermesRuntimeLayout,
        HermesSupervisorOptions, LogState,
    };
    use crate::shared::hermes_core::config::{HermesLaunchEnvironment, HermesPaths};
    use crate::shared::hermes_core::fake_server::{FakeExchange, FakeHermesServer};
    use crate::shared::hermes_core::types::WorkRuntimeState;

    fn run_async(future: impl Future<Output = ()>) {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(future);
    }

    fn temp_dir(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "blackrain-hermes-process-{label}-{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn free_port() -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.local_addr().unwrap().port()
    }

    fn create_layout(root: &Path, script: &[u8]) -> HermesRuntimeLayout {
        let layout = HermesRuntimeLayout::from_root(root.to_path_buf());
        fs::create_dir_all(layout.executable.parent().unwrap()).unwrap();
        fs::create_dir_all(layout.runtime_manifest.parent().unwrap()).unwrap();
        fs::write(&layout.executable, script).unwrap();
        fs::write(&layout.python, b"fixture").unwrap();
        fs::write(
            &layout.runtime_manifest,
            br#"{"hermes":{"version":"0.18.2"}}"#,
        )
        .unwrap();
        fs::write(&layout.checksums, b"fixture").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = fs::metadata(&layout.executable).unwrap().permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&layout.executable, permissions).unwrap();
        }
        layout
    }

    fn launch_environment(home: &Path, port: u16) -> HermesLaunchEnvironment {
        HermesLaunchEnvironment::build(
            &HermesPaths {
                home: home.to_path_buf(),
                config: home.join("config.yaml"),
                last_good_config: home.join("config.yaml.last-good"),
            },
            port,
            "br_fixture_0123456789abcdef0123456789abcdef",
            "provider-fixture-secret",
        )
        .unwrap()
    }

    #[test]
    fn runtime_layout_reports_missing_files_as_not_installed() {
        let root = temp_dir("missing");
        let layout = HermesRuntimeLayout::from_root(root.clone());
        let error = layout.inspect().unwrap_err();
        assert_eq!(error.code, "hermes_runtime_not_installed");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn log_redaction_removes_secrets_and_content() {
        assert_eq!(
            redact_log_line("Authorization br_secret_value", &["br_secret_value".into()]),
            "Authorization <redacted>"
        );
        assert_eq!(
            redact_log_line(r#"request {"input":"private"}"#, &[]),
            "<redacted potentially sensitive Hermes content>"
        );
    }

    #[test]
    fn rolling_log_keeps_bounded_memory_and_backups() {
        let root = temp_dir("logs");
        let path = root.join("hermes.log");
        let mut logs = LogState::new(path.clone(), 1024, 2, 10);
        for index in 0..80 {
            logs.append("test", &format!("line-{index}-{}", "x".repeat(40)));
        }
        assert_eq!(logs.lines.len(), 10);
        assert!(path.is_file());
        assert!(root.join("hermes.log.1").is_file());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn classifies_existing_hermes_with_different_bearer() {
        run_async(async {
            let server = FakeHermesServer::spawn(vec![
                FakeExchange::json(
                    "GET",
                    "/health",
                    200,
                    include_str!("../../../test-fixtures/hermes/v2026.7.7.2/health.json"),
                ),
                FakeExchange::json(
                    "GET",
                    "/v1/capabilities",
                    401,
                    include_str!("../../../test-fixtures/hermes/v2026.7.7.2/error-auth.json"),
                ),
            ])
            .await
            .unwrap();
            let error = classify_port_conflict(
                &server.base_url,
                "br_fixture_0123456789abcdef0123456789abcdef",
            )
            .await;
            assert_eq!(error.code, "hermes_bearer_mismatch_instance");
            server.finish().await.unwrap();
        });
    }

    #[cfg(unix)]
    #[test]
    fn concurrent_failed_starts_spawn_only_one_process_and_redact_logs() {
        run_async(async {
            let root = temp_dir("concurrent");
            let count_path = root.join("spawn-count.txt");
            let script = format!(
                "#!/bin/sh\necho x >> '{}'\necho \"provider-fixture-secret\"\nsleep 5\n",
                count_path.display()
            );
            let layout = create_layout(&root.join("runtime"), script.as_bytes());
            let home = root.join("home");
            let supervisor = Arc::new(HermesProcessSupervisor::with_options(
                layout,
                home.clone(),
                root.join("hermes.log"),
                HermesSupervisorOptions {
                    startup_timeout: Duration::from_millis(250),
                    poll_interval: Duration::from_millis(20),
                    graceful_stop_timeout: Duration::from_millis(100),
                    log_max_bytes: 1024,
                    log_backups: 1,
                    log_memory_lines: 50,
                },
            ));
            let environment = launch_environment(&home, free_port());
            let (first, second) = futures_util::future::join(
                supervisor.start(environment.clone()),
                supervisor.start(environment),
            )
            .await;
            assert!(first.is_err());
            assert!(second.is_err());
            assert_eq!(fs::read_to_string(&count_path).unwrap().lines().count(), 1);
            assert_eq!(supervisor.status().await.state, WorkRuntimeState::Crashed);
            let logs = supervisor.recent_logs().join("\n");
            assert!(!logs.contains("provider-fixture-secret"));
            assert!(logs.contains("<redacted>"));
            let disk_logs = fs::read_to_string(root.join("hermes.log")).unwrap();
            assert!(!disk_logs.contains("provider-fixture-secret"));
            assert!(disk_logs.contains("<redacted>"));
            fs::remove_dir_all(root).unwrap();
        });
    }

    #[cfg(unix)]
    #[test]
    fn reaches_ready_only_after_health_capabilities_and_models_then_stops() {
        run_async(async {
            let root = temp_dir("ready");
            let layout = create_layout(
                &root.join("runtime"),
                b"#!/bin/sh\necho runtime-started\nsleep 5\n",
            );
            let home = root.join("home");
            let supervisor = Arc::new(HermesProcessSupervisor::with_options(
                layout,
                home.clone(),
                root.join("hermes.log"),
                HermesSupervisorOptions {
                    startup_timeout: Duration::from_secs(2),
                    poll_interval: Duration::from_millis(20),
                    graceful_stop_timeout: Duration::from_millis(200),
                    log_max_bytes: 1024,
                    log_backups: 1,
                    log_memory_lines: 50,
                },
            ));
            let port = free_port();
            let environment = launch_environment(&home, port);
            let server_task = tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(60)).await;
                FakeHermesServer::spawn_on(
                    port,
                    vec![
                        FakeExchange::json(
                            "GET",
                            "/health",
                            200,
                            include_str!("../../../test-fixtures/hermes/v2026.7.7.2/health.json"),
                        ),
                        FakeExchange::json(
                            "GET",
                            "/v1/capabilities",
                            200,
                            include_str!(
                                "../../../test-fixtures/hermes/v2026.7.7.2/capabilities.json"
                            ),
                        ),
                        FakeExchange::json(
                            "GET",
                            "/v1/models",
                            200,
                            include_str!("../../../test-fixtures/hermes/v2026.7.7.2/models.json"),
                        ),
                    ],
                )
                .await
                .unwrap()
            });
            let ready = supervisor.start(environment).await.unwrap();
            assert_eq!(ready.state, WorkRuntimeState::Ready);
            assert_eq!(ready.version.as_deref(), Some("0.18.2"));
            let server = server_task.await.unwrap();
            assert_eq!(server.finish().await.unwrap().len(), 3);
            assert_eq!(
                supervisor.stop().await.unwrap().state,
                WorkRuntimeState::Stopped
            );
            fs::remove_dir_all(root).unwrap();
        });
    }
}
