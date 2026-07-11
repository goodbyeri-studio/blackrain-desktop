use std::collections::{BTreeMap, VecDeque};
use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::TcpStream;
use tokio::process::Child;
use tokio::sync::Mutex;
use tokio::time::{sleep, timeout, Instant};

use super::client::{HermesApiClient, HermesHttpTrace, HermesHttpTraceSink};
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
const RUNTIME_LEASE_SCHEMA_VERSION: u32 = 1;

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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HermesRuntimeLease {
    schema_version: u32,
    instance_id: String,
    pid: u32,
    port: u16,
    started_at: f64,
    executable: String,
    hermes_version: String,
}

pub(crate) struct HermesProcessSupervisor {
    layout: HermesRuntimeLayout,
    home: PathBuf,
    options: HermesSupervisorOptions,
    start_gate: Mutex<()>,
    state: Mutex<HermesProcessState>,
    logs: Arc<StdMutex<LogState>>,
    http_traces: HermesHttpTraceSink,
    lease_path: PathBuf,
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
            lease_path: home.join("runtime-lease.v1.json"),
            layout,
            home,
            logs: Arc::new(StdMutex::new(LogState::new(
                log_path,
                options.log_max_bytes,
                options.log_backups,
                options.log_memory_lines,
            ))),
            http_traces: HermesHttpTraceSink::default(),
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
        if self.lease_path.exists() {
            let error = runtime_error(
                "hermes_orphan_audit_required",
                "A previous Hermes runtime lease still exists and must be audited before start.",
                false,
            );
            self.set_failed(WorkRuntimeState::RepairRequired, error.clone(), None)
                .await;
            return Err(error);
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
            let error = classify_port_conflict(&base_url, &bearer, self.http_traces.clone()).await;
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
        let pid = pid.ok_or_else(|| {
            runtime_error(
                "hermes_pid_missing",
                "The managed Hermes process did not expose a process id.",
                true,
            )
        })?;
        let lease = HermesRuntimeLease {
            schema_version: RUNTIME_LEASE_SCHEMA_VERSION,
            instance_id: uuid::Uuid::new_v4().to_string(),
            pid,
            port,
            started_at: now_unix_seconds(),
            executable: self.layout.executable.to_string_lossy().to_string(),
            hermes_version: EXPECTED_HERMES_VERSION.into(),
        };
        if let Err(error) = write_runtime_lease(&self.lease_path, &lease) {
            self.fail_start(error.clone()).await;
            return Err(error);
        }

        let readiness_request_timeout = self.options.startup_timeout.min(Duration::from_secs(2));
        let client = match HermesApiClient::with_timeouts_and_trace_sink(
            &base_url,
            &bearer,
            readiness_request_timeout,
            Duration::from_secs(1),
            self.http_traces.clone(),
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
        remove_runtime_lease(&self.lease_path);
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

    pub(crate) fn recent_http_traces(&self) -> Vec<HermesHttpTrace> {
        self.http_traces.recent()
    }

    pub(crate) async fn api_client(&self, bearer: &str) -> Result<HermesApiClient, WorkError> {
        let status = self.status().await;
        if status.state != WorkRuntimeState::Ready {
            return Err(runtime_error(
                "hermes_runtime_not_ready",
                "Hermes runtime must be ready before WORK tasks can connect.",
                true,
            ));
        }
        let base_url = status.base_url.ok_or_else(|| {
            runtime_error(
                "hermes_runtime_url_missing",
                "Hermes runtime is ready but has no managed base URL.",
                false,
            )
        })?;
        HermesApiClient::with_trace_sink(&base_url, bearer, self.http_traces.clone())
    }

    pub(crate) async fn audit_orphaned_process(
        &self,
        bearer: &str,
    ) -> Result<WorkRuntimeStatus, WorkError> {
        let _gate = self.start_gate.lock().await;
        self.refresh_process_state().await;
        {
            let state = self.state.lock().await;
            if state.child.is_some() {
                return Ok(state.status.clone());
            }
        }
        let lease = match read_runtime_lease(&self.lease_path) {
            Ok(lease) => lease,
            Err(error) => {
                self.set_failed(WorkRuntimeState::RepairRequired, error.clone(), None)
                    .await;
                return Err(error);
            }
        };
        let Some(lease) = lease else {
            return Ok(self.state.lock().await.status.clone());
        };
        if let Err(error) = validate_runtime_lease(&lease, &self.layout) {
            self.set_failed(WorkRuntimeState::RepairRequired, error.clone(), None)
                .await;
            return Err(error);
        }
        let identity = match query_process_identity(lease.pid).await {
            Ok(identity) => identity,
            Err(error) => {
                self.set_failed(WorkRuntimeState::RepairRequired, error.clone(), None)
                    .await;
                return Err(error);
            }
        };
        let Some(identity) = identity else {
            remove_runtime_lease(&self.lease_path);
            let mut state = self.state.lock().await;
            state.status.state = if self.layout.inspect().is_ok() {
                WorkRuntimeState::Stopped
            } else {
                WorkRuntimeState::NotInstalled
            };
            state.status.pid = None;
            state.status.base_url = None;
            state.status.started_at = None;
            state.status.last_error = None;
            return Ok(state.status.clone());
        };
        if !identity.matches_layout(&self.layout) {
            let error = runtime_error(
                "hermes_orphan_pid_reused",
                "The saved Hermes PID now belongs to a different process; refusing to terminate it.",
                false,
            );
            self.set_failed(WorkRuntimeState::RepairRequired, error.clone(), None)
                .await;
            return Err(error);
        }

        if loopback_port_is_open(lease.port).await {
            let base_url = format!("http://127.0.0.1:{}", lease.port);
            let client = HermesApiClient::with_timeouts_and_trace_sink(
                &base_url,
                bearer,
                Duration::from_secs(2),
                Duration::from_secs(1),
                self.http_traces.clone(),
            )?;
            let verified = client.health().await.is_ok_and(|health| {
                health.platform == "hermes-agent" && health.version == EXPECTED_HERMES_VERSION
            }) && client
                .capabilities()
                .await
                .and_then(|capabilities| {
                    HermesApiClient::validate_required_capabilities(&capabilities)
                })
                .is_ok();
            if !verified {
                let error = runtime_error(
                    "hermes_orphan_verification_failed",
                    "A saved Hermes process is still listening but failed bearer/capability verification; refusing to terminate it automatically.",
                    false,
                );
                self.set_failed(
                    WorkRuntimeState::RepairRequired,
                    error.clone(),
                    Some(base_url),
                )
                .await;
                return Err(error);
            }
        }

        terminate_pid_tree(lease.pid).await;
        let process_gone = match wait_for_process_exit(lease.pid, Duration::from_secs(2)).await {
            Ok(process_gone) => process_gone,
            Err(error) => {
                self.set_failed(WorkRuntimeState::RepairRequired, error.clone(), None)
                    .await;
                return Err(error);
            }
        };
        if !process_gone {
            let error = runtime_error(
                "hermes_orphan_cleanup_failed",
                "Unable to terminate the verified orphaned Hermes process tree.",
                true,
            );
            self.set_failed(WorkRuntimeState::RepairRequired, error.clone(), None)
                .await;
            return Err(error);
        }
        remove_runtime_lease(&self.lease_path);
        let mut state = self.state.lock().await;
        state.status.state = WorkRuntimeState::Stopped;
        state.status.pid = None;
        state.status.base_url = None;
        state.status.started_at = None;
        state.status.last_error = None;
        self.logs
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .append("supervisor", "Cleaned a verified orphaned Hermes process.");
        Ok(state.status.clone())
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
                remove_runtime_lease(&self.lease_path);
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
                remove_runtime_lease(&self.lease_path);
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
        remove_runtime_lease(&self.lease_path);
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

async fn classify_port_conflict(
    base_url: &str,
    bearer: &str,
    trace_sink: HermesHttpTraceSink,
) -> WorkError {
    let Ok(client) = HermesApiClient::with_timeouts_and_trace_sink(
        base_url,
        bearer,
        Duration::from_secs(1),
        Duration::from_millis(500),
        trace_sink,
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

#[derive(Debug)]
struct ProcessIdentity {
    executable: String,
    command_line: String,
}

impl ProcessIdentity {
    fn matches_layout(&self, layout: &HermesRuntimeLayout) -> bool {
        let executable = self.executable.to_ascii_lowercase();
        let command_line = self.command_line.to_ascii_lowercase();
        let expected = layout.executable.to_string_lossy().to_ascii_lowercase();
        let runtime_root = layout.root.to_string_lossy().to_ascii_lowercase();
        executable == expected
            || executable.starts_with(&runtime_root)
            || command_line.contains(&expected)
            || command_line.contains(&runtime_root)
    }
}

#[cfg(windows)]
async fn query_process_identity(pid: u32) -> Result<Option<ProcessIdentity>, WorkError> {
    let command = format!(
        "$p=Get-CimInstance Win32_Process -Filter 'ProcessId = {pid}'; if($p){{@{{executable=$p.ExecutablePath;commandLine=$p.CommandLine}} | ConvertTo-Json -Compress}}"
    );
    let output = tokio_command("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", &command])
        .output()
        .await
        .map_err(|error| {
            runtime_error(
                "hermes_process_identity_query_failed",
                &format!("Unable to query saved Hermes process identity: {error}"),
                true,
            )
        })?;
    if !output.status.success() {
        return Err(runtime_error(
            "hermes_process_identity_query_failed",
            "Windows process identity query failed.",
            true,
        ));
    }
    let text = String::from_utf8_lossy(&output.stdout);
    if text.trim().is_empty() {
        return Ok(None);
    }
    let value = serde_json::from_str::<serde_json::Value>(text.trim()).map_err(|error| {
        runtime_error(
            "hermes_process_identity_invalid",
            &format!("Windows process identity response is invalid: {error}"),
            true,
        )
    })?;
    Ok(Some(ProcessIdentity {
        executable: value
            .get("executable")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string(),
        command_line: value
            .get("commandLine")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string(),
    }))
}

#[cfg(unix)]
async fn query_process_identity(pid: u32) -> Result<Option<ProcessIdentity>, WorkError> {
    let status_output = tokio_command("ps")
        .args(["-p", &pid.to_string(), "-o", "stat="])
        .output()
        .await
        .map_err(|error| {
            runtime_error(
                "hermes_process_identity_query_failed",
                &format!("Unable to query saved Hermes process status: {error}"),
                true,
            )
        })?;
    let status = String::from_utf8_lossy(&status_output.stdout);
    if !status_output.status.success() || status.trim_start().starts_with('Z') {
        return Ok(None);
    }
    let executable = tokio_command("ps")
        .args(["-p", &pid.to_string(), "-o", "comm="])
        .output()
        .await
        .map_err(|error| {
            runtime_error(
                "hermes_process_identity_query_failed",
                &format!("Unable to query saved Hermes process executable: {error}"),
                true,
            )
        })?;
    if !executable.status.success() {
        return Ok(None);
    }
    let command_line = tokio_command("ps")
        .args(["-p", &pid.to_string(), "-o", "command="])
        .output()
        .await
        .map_err(|error| {
            runtime_error(
                "hermes_process_identity_query_failed",
                &format!("Unable to query saved Hermes process command line: {error}"),
                true,
            )
        })?;
    if !command_line.status.success() {
        return Ok(None);
    }
    let executable = String::from_utf8_lossy(&executable.stdout)
        .trim()
        .to_string();
    if executable.is_empty() {
        return Ok(None);
    }
    Ok(Some(ProcessIdentity {
        executable,
        command_line: String::from_utf8_lossy(&command_line.stdout)
            .trim()
            .to_string(),
    }))
}

#[cfg(not(any(unix, windows)))]
async fn query_process_identity(_pid: u32) -> Result<Option<ProcessIdentity>, WorkError> {
    Err(runtime_error(
        "hermes_process_identity_unsupported",
        "Process identity audit is unsupported on this platform.",
        false,
    ))
}

async fn terminate_pid_tree(pid: u32) {
    #[cfg(windows)]
    {
        let _ = tokio_command("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .await;
    }
    #[cfg(unix)]
    {
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
        for _ in 0..10 {
            let exited = unsafe { libc::kill(pid as i32, 0) != 0 };
            if exited {
                return;
            }
            sleep(Duration::from_millis(50)).await;
        }
        unsafe {
            libc::kill(pid as i32, libc::SIGKILL);
        }
    }
}

async fn wait_for_process_exit(pid: u32, wait: Duration) -> Result<bool, WorkError> {
    let deadline = Instant::now() + wait;
    loop {
        if query_process_identity(pid).await?.is_none() {
            return Ok(true);
        }
        if Instant::now() >= deadline {
            return Ok(false);
        }
        sleep(Duration::from_millis(50)).await;
    }
}

fn write_runtime_lease(path: &Path, lease: &HermesRuntimeLease) -> Result<(), WorkError> {
    if path.exists() {
        return Err(runtime_error(
            "hermes_orphan_audit_required",
            "A previous Hermes runtime lease still exists and must be audited before start.",
            false,
        ));
    }
    let parent = path.parent().ok_or_else(|| {
        runtime_error(
            "hermes_lease_path_invalid",
            "Hermes runtime lease path has no parent directory.",
            false,
        )
    })?;
    fs::create_dir_all(parent).map_err(|error| {
        runtime_error(
            "hermes_lease_directory_failed",
            &format!("Unable to create Hermes lease directory: {error}"),
            false,
        )
    })?;
    let temporary = parent.join(format!(
        ".runtime-lease-{}.tmp",
        uuid::Uuid::new_v4().simple()
    ));
    let body = serde_json::to_vec_pretty(lease).map_err(|error| {
        runtime_error(
            "hermes_lease_serialize_failed",
            &format!("Unable to serialize Hermes runtime lease: {error}"),
            false,
        )
    })?;
    fs::write(&temporary, body).map_err(|error| {
        runtime_error(
            "hermes_lease_write_failed",
            &format!("Unable to write Hermes runtime lease: {error}"),
            false,
        )
    })?;
    fs::rename(&temporary, path).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        runtime_error(
            "hermes_lease_commit_failed",
            &format!("Unable to commit Hermes runtime lease: {error}"),
            false,
        )
    })
}

fn read_runtime_lease(path: &Path) -> Result<Option<HermesRuntimeLease>, WorkError> {
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path).map_err(|error| {
        runtime_error(
            "hermes_lease_read_failed",
            &format!("Unable to read Hermes runtime lease: {error}"),
            false,
        )
    })?;
    serde_json::from_slice(&bytes).map(Some).map_err(|error| {
        runtime_error(
            "hermes_lease_invalid",
            &format!("Hermes runtime lease is invalid: {error}"),
            false,
        )
    })
}

fn validate_runtime_lease(
    lease: &HermesRuntimeLease,
    layout: &HermesRuntimeLayout,
) -> Result<(), WorkError> {
    let valid = lease.schema_version == RUNTIME_LEASE_SCHEMA_VERSION
        && lease.pid != 0
        && lease.port != 0
        && lease.hermes_version == EXPECTED_HERMES_VERSION
        && Path::new(&lease.executable) == layout.executable;
    if valid {
        Ok(())
    } else {
        Err(runtime_error(
            "hermes_lease_mismatch",
            "Hermes runtime lease does not match the current bundled runtime.",
            false,
        ))
    }
}

fn remove_runtime_lease(path: &Path) {
    match fs::remove_file(path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => {}
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
    use std::process::Stdio;
    use std::sync::Arc;
    use std::time::Duration;

    use super::{
        classify_port_conflict, read_runtime_lease, redact_log_line, remove_runtime_lease,
        validate_runtime_lease, write_runtime_lease, HermesProcessSupervisor, HermesRuntimeLayout,
        HermesRuntimeLease, HermesSupervisorOptions, LogState, RUNTIME_LEASE_SCHEMA_VERSION,
    };
    use crate::shared::hermes_core::client::HermesHttpTraceSink;
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
                desired_state: home.join("desired-state.v1.json"),
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
    fn runtime_lease_is_atomic_versioned_and_refuses_overwrite() {
        let root = temp_dir("lease");
        let layout = create_layout(&root.join("runtime"), b"#!/bin/sh\nexit 0\n");
        let path = root.join("home/runtime-lease.v1.json");
        let lease = HermesRuntimeLease {
            schema_version: RUNTIME_LEASE_SCHEMA_VERSION,
            instance_id: "fixture-instance".into(),
            pid: 123,
            port: 8642,
            started_at: 1.0,
            executable: layout.executable.to_string_lossy().to_string(),
            hermes_version: "0.18.2".into(),
        };
        write_runtime_lease(&path, &lease).unwrap();
        assert_eq!(read_runtime_lease(&path).unwrap(), Some(lease.clone()));
        validate_runtime_lease(&lease, &layout).unwrap();
        assert_eq!(
            write_runtime_lease(&path, &lease).unwrap_err().code,
            "hermes_orphan_audit_required"
        );
        remove_runtime_lease(&path);
        assert!(!path.exists());
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
                HermesHttpTraceSink::default(),
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
            let traces = supervisor.recent_http_traces();
            assert!(traces.len() >= 3);
            let successful = &traces[traces.len() - 3..];
            assert_eq!(successful[0].path, "/health");
            assert_eq!(successful[1].path, "/v1/capabilities");
            assert_eq!(successful[2].path, "/v1/models");
            assert!(successful.iter().all(|trace| trace.outcome == "ok"));
            assert!(!serde_json::to_string(&traces)
                .unwrap()
                .contains("br_fixture_0123456789abcdef0123456789abcdef"));
            let server = server_task.await.unwrap();
            assert_eq!(server.finish().await.unwrap().len(), 3);
            assert!(supervisor.lease_path.is_file());
            assert_eq!(
                supervisor.stop().await.unwrap().state,
                WorkRuntimeState::Stopped
            );
            assert!(!supervisor.lease_path.exists());
            fs::remove_dir_all(root).unwrap();
        });
    }

    #[cfg(unix)]
    #[test]
    fn audits_and_cleans_verified_hung_orphan_from_lease() {
        run_async(async {
            let root = temp_dir("orphan");
            let layout = create_layout(
                &root.join("runtime"),
                b"#!/bin/sh\nwhile true; do sleep 1; done\n",
            );
            let home = root.join("home");
            let supervisor = HermesProcessSupervisor::with_options(
                layout.clone(),
                home,
                root.join("hermes.log"),
                HermesSupervisorOptions {
                    startup_timeout: Duration::from_secs(1),
                    poll_interval: Duration::from_millis(20),
                    graceful_stop_timeout: Duration::from_millis(100),
                    log_max_bytes: 1024,
                    log_backups: 1,
                    log_memory_lines: 50,
                },
            );
            let mut child = crate::shared::process_core::tokio_command(&layout.executable)
                .arg("gateway")
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .unwrap();
            let pid = child.id().unwrap();
            write_runtime_lease(
                &supervisor.lease_path,
                &HermesRuntimeLease {
                    schema_version: RUNTIME_LEASE_SCHEMA_VERSION,
                    instance_id: "orphan-fixture".into(),
                    pid,
                    port: free_port(),
                    started_at: 1.0,
                    executable: layout.executable.to_string_lossy().to_string(),
                    hermes_version: "0.18.2".into(),
                },
            )
            .unwrap();
            tokio::time::sleep(Duration::from_millis(30)).await;
            let status = supervisor
                .audit_orphaned_process("br_fixture_0123456789abcdef0123456789abcdef")
                .await
                .unwrap();
            assert_eq!(status.state, WorkRuntimeState::Stopped);
            assert!(!supervisor.lease_path.exists());
            let _ = child.wait().await;
            fs::remove_dir_all(root).unwrap();
        });
    }
}
