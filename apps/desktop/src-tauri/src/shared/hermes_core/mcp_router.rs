use std::collections::BTreeMap;
use std::fs;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use reqwest::header::{HeaderValue, AUTHORIZATION};
use serde::{Deserialize, Serialize};
use tokio::net::TcpStream;
use tokio::process::Child;
use tokio::sync::Mutex;
use tokio::time::{sleep, Instant};

use super::process::{isolated_user_environment, safe_parent_environment, HermesRuntimeLayout};
use super::types::{WorkError, WorkErrorKind};
use crate::shared::process_core::{kill_child_process_tree, tokio_command};

const ROUTER_STARTUP_TIMEOUT: Duration = Duration::from_secs(20);
const ROUTER_POLL_INTERVAL: Duration = Duration::from_millis(100);
const ROUTER_REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const ROUTER_LEASE_SCHEMA_VERSION: u32 = 1;

#[derive(Clone)]
pub(crate) struct McpRouterConnection {
    pub(crate) mcp_url: String,
    pub(crate) mcp_bearer: String,
}

#[derive(Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct McpRouterDesiredServer {
    pub(crate) id: String,
    pub(crate) command: String,
    pub(crate) args: Vec<String>,
    pub(crate) environment: BTreeMap<String, String>,
    pub(crate) connect_timeout_seconds: u64,
    pub(crate) timeout_seconds: u64,
    pub(crate) supports_parallel_tool_calls: bool,
}

#[derive(Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct McpRouterDesiredGeneration {
    pub(crate) generation_id: String,
    pub(crate) servers: Vec<McpRouterDesiredServer>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct McpRouterGenerationSummary {
    pub(crate) ok: bool,
    pub(crate) changed: bool,
    pub(crate) generation_id: Option<String>,
    pub(crate) server_count: usize,
    pub(crate) tool_count: usize,
}

struct McpRouterProcessState {
    child: Option<Child>,
    control_url: Option<String>,
    control_bearer: Option<String>,
    connection: Option<McpRouterConnection>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct McpRouterLease {
    schema_version: u32,
    pid: u32,
    control_port: u16,
    mcp_port: u16,
    python: String,
    router_script: String,
    started_at: u64,
}

pub(crate) struct McpRouterSupervisor {
    layout: HermesRuntimeLayout,
    home: PathBuf,
    lease_path: PathBuf,
    gate: Mutex<()>,
    state: Mutex<McpRouterProcessState>,
    client: reqwest::Client,
}

impl McpRouterSupervisor {
    pub(crate) fn new(layout: HermesRuntimeLayout, home: PathBuf) -> Self {
        let client = reqwest::Client::builder()
            .no_proxy()
            .connect_timeout(Duration::from_secs(2))
            .timeout(ROUTER_REQUEST_TIMEOUT)
            .build()
            .expect("fixed MCP router HTTP client configuration must be valid");
        Self {
            lease_path: home.join("router-lease.v1.json"),
            layout,
            home,
            gate: Mutex::new(()),
            state: Mutex::new(McpRouterProcessState {
                child: None,
                control_url: None,
                control_bearer: None,
                connection: None,
            }),
            client,
        }
    }

    pub(crate) async fn start(&self) -> Result<McpRouterConnection, WorkError> {
        let _gate = self.gate.lock().await;
        self.refresh().await;
        if let Some(connection) = self.state.lock().await.connection.clone() {
            return Ok(connection);
        }
        self.layout.inspect()?;
        fs::create_dir_all(&self.home).map_err(|error| {
            router_error(
                "mcp_router_home_create_failed",
                &format!("Unable to create the managed MCP router home: {error}"),
                false,
            )
        })?;
        if self.lease_path.exists() {
            return Err(router_error(
                "mcp_router_orphan_audit_required",
                "A previous MCP router lease must be audited before starting a new process.",
                false,
            ));
        }
        let control_port = reserve_loopback_port()?;
        let mut mcp_port = reserve_loopback_port()?;
        while mcp_port == control_port {
            mcp_port = reserve_loopback_port()?;
        }
        let control_bearer = random_bearer("control");
        let mcp_bearer = random_bearer("mcp");
        let control_url = format!("http://127.0.0.1:{control_port}");
        let connection = McpRouterConnection {
            mcp_url: format!("http://127.0.0.1:{mcp_port}/mcp"),
            mcp_bearer: mcp_bearer.clone(),
        };
        let isolated = isolated_user_environment(&self.home)?;
        let mut command = tokio_command(&self.layout.python);
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.as_std_mut().process_group(0);
        }
        command
            .arg(&self.layout.router_script)
            .current_dir(&self.home)
            .env_clear()
            .envs(safe_parent_environment())
            .envs(isolated)
            .env(
                "BLACKRAIN_MCP_ROUTER_CONTROL_PORT",
                control_port.to_string(),
            )
            .env("BLACKRAIN_MCP_ROUTER_CONTROL_BEARER", &control_bearer)
            .env("BLACKRAIN_MCP_ROUTER_MCP_PORT", mcp_port.to_string())
            .env("BLACKRAIN_MCP_ROUTER_MCP_BEARER", &mcp_bearer)
            .env("PYTHONUTF8", "1")
            .env("PYTHONDONTWRITEBYTECODE", "1")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        let mut child = command.spawn().map_err(|error| {
            router_error(
                "mcp_router_spawn_failed",
                &format!("Unable to start the managed MCP router: {error}"),
                true,
            )
        })?;
        let pid = child.id().ok_or_else(|| {
            router_error(
                "mcp_router_pid_missing",
                "The managed MCP router did not expose a process id.",
                true,
            )
        })?;
        let lease = McpRouterLease {
            schema_version: ROUTER_LEASE_SCHEMA_VERSION,
            pid,
            control_port,
            mcp_port,
            python: self.layout.python.to_string_lossy().to_string(),
            router_script: self.layout.router_script.to_string_lossy().to_string(),
            started_at: now_unix_seconds(),
        };
        if let Err(error) = write_lease(&self.lease_path, &lease) {
            terminate_child_tree(&mut child).await;
            return Err(error);
        }
        {
            let mut state = self.state.lock().await;
            state.child = Some(child);
            state.control_url = Some(control_url.clone());
            state.control_bearer = Some(control_bearer.clone());
            state.connection = None;
        }
        let deadline = Instant::now() + ROUTER_STARTUP_TIMEOUT;
        loop {
            if let Some(error) = self.early_exit().await {
                self.clear_state().await;
                return Err(error);
            }
            match self
                .authorized(
                    self.client.get(format!("{control_url}/health")),
                    &control_bearer,
                )?
                .send()
                .await
            {
                Ok(response)
                    if response.status().is_success() && loopback_port_is_open(mcp_port).await =>
                {
                    let summary = match response.json::<McpRouterGenerationSummary>().await {
                        Ok(summary) => summary,
                        Err(_) => {
                            self.stop_locked().await;
                            return Err(router_error(
                                "mcp_router_health_invalid",
                                "The managed MCP router returned an invalid health response.",
                                true,
                            ));
                        }
                    };
                    if !summary.ok {
                        self.stop_locked().await;
                        return Err(router_error(
                            "mcp_router_health_invalid",
                            "The managed MCP router did not report a healthy state.",
                            true,
                        ));
                    }
                    self.state.lock().await.connection = Some(connection.clone());
                    return Ok(connection);
                }
                _ if Instant::now() < deadline => sleep(ROUTER_POLL_INTERVAL).await,
                _ => {
                    self.stop_locked().await;
                    return Err(router_error(
                        "mcp_router_start_timeout",
                        "The managed MCP router did not become ready before timeout.",
                        true,
                    ));
                }
            }
        }
    }

    pub(crate) async fn replace(
        &self,
        desired: &McpRouterDesiredGeneration,
    ) -> Result<McpRouterGenerationSummary, WorkError> {
        let _gate = self.gate.lock().await;
        self.refresh().await;
        let (control_url, control_bearer) = {
            let state = self.state.lock().await;
            match (&state.control_url, &state.control_bearer, &state.connection) {
                (Some(url), Some(bearer), Some(_)) => (url.clone(), bearer.clone()),
                _ => {
                    return Err(router_error(
                        "mcp_router_not_ready",
                        "The managed MCP router must be ready before applying tools.",
                        true,
                    ));
                }
            }
        };
        let response = self
            .authorized(
                self.client.put(format!("{control_url}/v1/servers")),
                &control_bearer,
            )?
            .json(desired)
            .send()
            .await
            .map_err(|_| {
                router_error(
                    "mcp_router_control_unavailable",
                    "Unable to reach the managed MCP router control plane.",
                    true,
                )
            })?;
        if !response.status().is_success() {
            return Err(router_error(
                "mcp_router_generation_rejected",
                "The managed MCP router rejected the verified tool generation.",
                response.status().is_server_error(),
            ));
        }
        response
            .json::<McpRouterGenerationSummary>()
            .await
            .map_err(|_| {
                router_error(
                    "mcp_router_control_invalid",
                    "The managed MCP router returned an invalid control response.",
                    true,
                )
            })
    }

    pub(crate) async fn audit_orphaned_process(&self) -> Result<(), WorkError> {
        let _gate = self.gate.lock().await;
        self.refresh().await;
        if self.state.lock().await.child.is_some() {
            return Ok(());
        }
        let Some(lease) = read_lease(&self.lease_path)? else {
            return Ok(());
        };
        validate_lease(&lease, &self.layout)?;
        let Some(identity) = query_process_identity(lease.pid).await? else {
            remove_lease(&self.lease_path);
            return Ok(());
        };
        if !identity.matches(&self.layout) {
            return Err(router_error(
                "mcp_router_orphan_pid_reused",
                "The saved MCP router PID belongs to another process; refusing to terminate it.",
                false,
            ));
        }
        terminate_pid_tree(lease.pid).await;
        if !wait_for_process_exit(lease.pid, Duration::from_secs(3)).await? {
            return Err(router_error(
                "mcp_router_orphan_cleanup_failed",
                "Unable to terminate the verified orphaned MCP router process tree.",
                true,
            ));
        }
        remove_lease(&self.lease_path);
        Ok(())
    }

    pub(crate) async fn stop(&self) {
        let _gate = self.gate.lock().await;
        self.stop_locked().await;
    }

    async fn stop_locked(&self) {
        let child = self.state.lock().await.child.take();
        if let Some(mut child) = child {
            terminate_child_tree(&mut child).await;
        }
        self.clear_state().await;
    }

    async fn refresh(&self) {
        let exited = {
            let mut state = self.state.lock().await;
            match state.child.as_mut().map(|child| child.try_wait()) {
                Some(Ok(Some(_))) | Some(Err(_)) => true,
                Some(Ok(None)) | None => false,
            }
        };
        if exited {
            self.clear_state().await;
        }
    }

    async fn early_exit(&self) -> Option<WorkError> {
        let mut state = self.state.lock().await;
        let child = state.child.as_mut()?;
        match child.try_wait() {
            Ok(Some(_)) => Some(router_error(
                "mcp_router_process_exited",
                "The managed MCP router exited during startup.",
                true,
            )),
            Ok(None) => None,
            Err(_) => Some(router_error(
                "mcp_router_process_inspection_failed",
                "Unable to inspect the managed MCP router process.",
                true,
            )),
        }
    }

    async fn clear_state(&self) {
        let mut state = self.state.lock().await;
        state.child = None;
        state.control_url = None;
        state.control_bearer = None;
        state.connection = None;
        remove_lease(&self.lease_path);
    }

    fn authorized(
        &self,
        request: reqwest::RequestBuilder,
        bearer: &str,
    ) -> Result<reqwest::RequestBuilder, WorkError> {
        let value = HeaderValue::from_str(&format!("Bearer {bearer}")).map_err(|_| {
            router_error(
                "mcp_router_bearer_invalid",
                "The managed MCP router bearer is invalid.",
                false,
            )
        })?;
        Ok(request.header(AUTHORIZATION, value))
    }
}

#[derive(Debug)]
struct RouterProcessIdentity {
    executable: String,
    command_line: String,
}

impl RouterProcessIdentity {
    fn matches(&self, layout: &HermesRuntimeLayout) -> bool {
        let executable = self.executable.to_ascii_lowercase();
        let command_line = self.command_line.to_ascii_lowercase();
        let python = layout.python.to_string_lossy().to_ascii_lowercase();
        let router = layout.router_script.to_string_lossy().to_ascii_lowercase();
        command_line.contains(&router) && (executable == python || command_line.contains(&python))
    }
}

#[cfg(windows)]
async fn query_process_identity(pid: u32) -> Result<Option<RouterProcessIdentity>, WorkError> {
    let command = format!(
        "$p=Get-CimInstance Win32_Process -Filter 'ProcessId = {pid}'; if($p){{@{{executable=$p.ExecutablePath;commandLine=$p.CommandLine}} | ConvertTo-Json -Compress}}"
    );
    let output = tokio_command("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", &command])
        .output()
        .await
        .map_err(|_| {
            router_error(
                "mcp_router_process_identity_query_failed",
                "Unable to query the saved MCP router process identity.",
                true,
            )
        })?;
    if !output.status.success() {
        return Err(router_error(
            "mcp_router_process_identity_query_failed",
            "Unable to query the saved MCP router process identity.",
            true,
        ));
    }
    let text = String::from_utf8_lossy(&output.stdout);
    if text.trim().is_empty() {
        return Ok(None);
    }
    let value = serde_json::from_str::<serde_json::Value>(text.trim()).map_err(|_| {
        router_error(
            "mcp_router_process_identity_invalid",
            "The saved MCP router process identity response is invalid.",
            true,
        )
    })?;
    Ok(Some(RouterProcessIdentity {
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
async fn query_process_identity(pid: u32) -> Result<Option<RouterProcessIdentity>, WorkError> {
    let status = tokio_command("ps")
        .args(["-p", &pid.to_string(), "-o", "stat="])
        .output()
        .await
        .map_err(|_| {
            router_error(
                "mcp_router_process_identity_query_failed",
                "Unable to query the saved MCP router process identity.",
                true,
            )
        })?;
    if !status.status.success()
        || String::from_utf8_lossy(&status.stdout)
            .trim_start()
            .starts_with('Z')
    {
        return Ok(None);
    }
    let command = tokio_command("ps")
        .args(["-p", &pid.to_string(), "-o", "command="])
        .output()
        .await
        .map_err(|_| {
            router_error(
                "mcp_router_process_identity_query_failed",
                "Unable to query the saved MCP router process identity.",
                true,
            )
        })?;
    if !command.status.success() {
        return Ok(None);
    }
    let command_line = String::from_utf8_lossy(&command.stdout).trim().to_string();
    if command_line.is_empty() {
        return Ok(None);
    }
    let executable = command_line
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_string();
    Ok(Some(RouterProcessIdentity {
        executable,
        command_line,
    }))
}

#[cfg(not(any(unix, windows)))]
async fn query_process_identity(_pid: u32) -> Result<Option<RouterProcessIdentity>, WorkError> {
    Err(router_error(
        "mcp_router_process_identity_unsupported",
        "MCP router process identity inspection is unsupported on this platform.",
        false,
    ))
}

async fn terminate_child_tree(child: &mut Child) {
    let pid = child.id();
    #[cfg(unix)]
    if let Some(pid) = pid {
        unsafe {
            libc::kill(-(pid as i32), libc::SIGTERM);
        }
        if tokio::time::timeout(Duration::from_secs(3), child.wait())
            .await
            .is_ok()
        {
            unsafe {
                libc::kill(-(pid as i32), libc::SIGKILL);
            }
            return;
        }
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
        }
    }
    kill_child_process_tree(child).await;
    let _ = child.wait().await;
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
            libc::kill(-(pid as i32), libc::SIGTERM);
        }
        sleep(Duration::from_millis(300)).await;
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
        }
    }
}

async fn wait_for_process_exit(pid: u32, duration: Duration) -> Result<bool, WorkError> {
    let deadline = Instant::now() + duration;
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

fn write_lease(path: &Path, lease: &McpRouterLease) -> Result<(), WorkError> {
    if path.exists() {
        return Err(router_error(
            "mcp_router_orphan_audit_required",
            "A previous MCP router lease must be audited before starting a new process.",
            false,
        ));
    }
    let parent = path.parent().ok_or_else(|| {
        router_error(
            "mcp_router_lease_path_invalid",
            "The managed MCP router lease path is invalid.",
            false,
        )
    })?;
    fs::create_dir_all(parent).map_err(|_| {
        router_error(
            "mcp_router_lease_write_failed",
            "Unable to create the managed MCP router lease directory.",
            false,
        )
    })?;
    let temporary = parent.join(format!(
        ".router-lease-{}.tmp",
        uuid::Uuid::new_v4().simple()
    ));
    let body = serde_json::to_vec_pretty(lease).map_err(|_| {
        router_error(
            "mcp_router_lease_serialize_failed",
            "Unable to serialize the managed MCP router lease.",
            false,
        )
    })?;
    fs::write(&temporary, body).map_err(|_| {
        router_error(
            "mcp_router_lease_write_failed",
            "Unable to write the managed MCP router lease.",
            false,
        )
    })?;
    fs::rename(&temporary, path).map_err(|_| {
        let _ = fs::remove_file(&temporary);
        router_error(
            "mcp_router_lease_commit_failed",
            "Unable to commit the managed MCP router lease.",
            false,
        )
    })
}

fn read_lease(path: &Path) -> Result<Option<McpRouterLease>, WorkError> {
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path).map_err(|_| {
        router_error(
            "mcp_router_lease_read_failed",
            "Unable to read the managed MCP router lease.",
            false,
        )
    })?;
    serde_json::from_slice(&bytes).map(Some).map_err(|_| {
        router_error(
            "mcp_router_lease_invalid",
            "The managed MCP router lease is invalid.",
            false,
        )
    })
}

fn validate_lease(lease: &McpRouterLease, layout: &HermesRuntimeLayout) -> Result<(), WorkError> {
    let valid = lease.schema_version == ROUTER_LEASE_SCHEMA_VERSION
        && lease.pid != 0
        && lease.control_port != 0
        && lease.mcp_port != 0
        && lease.control_port != lease.mcp_port
        && Path::new(&lease.python) == layout.python
        && Path::new(&lease.router_script) == layout.router_script;
    if valid {
        Ok(())
    } else {
        Err(router_error(
            "mcp_router_lease_mismatch",
            "The managed MCP router lease does not match the bundled runtime.",
            false,
        ))
    }
}

fn remove_lease(path: &Path) {
    let _ = fs::remove_file(path);
}

fn now_unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn reserve_loopback_port() -> Result<u16, WorkError> {
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|listener| listener.local_addr())
        .map(|address| address.port())
        .map_err(|error| {
            router_error(
                "mcp_router_port_allocation_failed",
                &format!("Unable to allocate a managed MCP router port: {error}"),
                true,
            )
        })
}

async fn loopback_port_is_open(port: u16) -> bool {
    tokio::time::timeout(
        Duration::from_millis(200),
        TcpStream::connect(("127.0.0.1", port)),
    )
    .await
    .is_ok_and(|result| result.is_ok())
}

fn random_bearer(purpose: &str) -> String {
    format!(
        "br_mcp_{purpose}_{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

fn router_error(code: &str, message: &str, retryable: bool) -> WorkError {
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

#[cfg(test)]
mod tests {
    use std::fs;
    use std::future::Future;
    use std::path::Path;

    use super::{
        random_bearer, read_lease, reserve_loopback_port, validate_lease, write_lease,
        McpRouterDesiredGeneration, McpRouterLease, ROUTER_LEASE_SCHEMA_VERSION,
    };
    use crate::shared::hermes_core::process::HermesRuntimeLayout;

    fn run_async(future: impl Future<Output = ()>) {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(future);
    }

    fn temp_root(label: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!(
            "blackrain-mcp-router-{label}-{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[cfg(unix)]
    fn create_process_fixture(root: &Path) -> HermesRuntimeLayout {
        use std::os::unix::fs::PermissionsExt;

        let layout = HermesRuntimeLayout::from_root(root.to_path_buf());
        fs::create_dir_all(layout.executable.parent().unwrap()).unwrap();
        fs::create_dir_all(layout.runtime_manifest.parent().unwrap()).unwrap();
        fs::write(&layout.executable, "#!/bin/sh\nexit 0\n").unwrap();
        fs::write(&layout.python, "#!/bin/sh\nexec python3 \"$1\"\n").unwrap();
        fs::write(
            &layout.router_script,
            r#"import json, os, threading
from http.server import BaseHTTPRequestHandler, HTTPServer

bearer = os.environ["BLACKRAIN_MCP_ROUTER_CONTROL_BEARER"]
port = int(os.environ["BLACKRAIN_MCP_ROUTER_CONTROL_PORT"])
mcp_port = int(os.environ["BLACKRAIN_MCP_ROUTER_MCP_PORT"])

class Handler(BaseHTTPRequestHandler):
    def reply(self, body):
        encoded = json.dumps(body, separators=(",", ":")).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)
    def authorized(self):
        return self.headers.get("Authorization") == "Bearer " + bearer
    def do_GET(self):
        if not self.authorized():
            self.send_error(401); return
        self.reply({"ok": True, "changed": False, "generationId": None, "serverCount": 0, "toolCount": 0})
    def do_PUT(self):
        if not self.authorized():
            self.send_error(401); return
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
        self.reply({"ok": True, "changed": True, "generationId": body["generationId"], "serverCount": len(body["servers"]), "toolCount": 0})
    def log_message(self, *_args):
        pass

threading.Thread(target=HTTPServer(("127.0.0.1", mcp_port), Handler).serve_forever, daemon=True).start()
HTTPServer(("127.0.0.1", port), Handler).serve_forever()
"#,
        )
        .unwrap();
        fs::write(
            &layout.runtime_manifest,
            br#"{"hermes":{"version":"0.18.2"}}"#,
        )
        .unwrap();
        fs::write(&layout.checksums, "fixture").unwrap();
        for path in [&layout.executable, &layout.python] {
            let mut permissions = fs::metadata(path).unwrap().permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(path, permissions).unwrap();
        }
        layout
    }

    #[test]
    fn allocates_loopback_ports_and_high_entropy_bearers() {
        assert_ne!(reserve_loopback_port().unwrap(), 0);
        let first = random_bearer("control");
        let second = random_bearer("control");
        assert!(first.len() >= 64);
        assert_ne!(first, second);
        assert!(!first.chars().any(char::is_whitespace));
    }

    #[test]
    fn desired_generation_uses_strict_router_contract_names() {
        let value = serde_json::to_value(McpRouterDesiredGeneration {
            generation_id: "activation-1".into(),
            servers: Vec::new(),
        })
        .unwrap();
        assert_eq!(
            value,
            serde_json::json!({"generationId":"activation-1","servers":[]})
        );
    }

    #[test]
    fn lease_is_versioned_and_contains_no_bearers_or_secrets() {
        let root = temp_root("lease");
        let layout = HermesRuntimeLayout::from_root(root.join("runtime"));
        let lease = McpRouterLease {
            schema_version: ROUTER_LEASE_SCHEMA_VERSION,
            pid: 42,
            control_port: 41001,
            mcp_port: 41002,
            python: layout.python.to_string_lossy().to_string(),
            router_script: layout.router_script.to_string_lossy().to_string(),
            started_at: 1,
        };
        let path = root.join("router-lease.v1.json");
        write_lease(&path, &lease).unwrap();
        let content = fs::read_to_string(&path).unwrap();
        assert!(!content.to_ascii_lowercase().contains("bearer"));
        assert!(!content.to_ascii_lowercase().contains("secret"));
        let loaded = read_lease(&path).unwrap().unwrap();
        assert_eq!(loaded, lease);
        validate_lease(&loaded, &layout).unwrap();
        let other = HermesRuntimeLayout::from_root(root.join("other-runtime"));
        assert_eq!(
            validate_lease(&loaded, &other).unwrap_err().code,
            "mcp_router_lease_mismatch"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn supervisor_spawns_controls_and_stops_router_with_ephemeral_bearers() {
        if std::process::Command::new("python3")
            .arg("--version")
            .output()
            .is_err()
        {
            return;
        }
        run_async(async {
            let root = temp_root("process");
            let layout = create_process_fixture(&root.join("runtime"));
            let supervisor = super::McpRouterSupervisor::new(layout, root.join("home"));
            let connection = supervisor.start().await.unwrap();
            assert!(connection.mcp_url.starts_with("http://127.0.0.1:"));
            assert!(connection.mcp_bearer.len() >= 64);
            assert!(supervisor.lease_path.is_file());
            let lease = fs::read_to_string(&supervisor.lease_path).unwrap();
            assert!(!lease.contains(&connection.mcp_bearer));
            let summary = supervisor
                .replace(&McpRouterDesiredGeneration {
                    generation_id: "activation-fixture".into(),
                    servers: Vec::new(),
                })
                .await
                .unwrap();
            assert_eq!(summary.generation_id.as_deref(), Some("activation-fixture"));
            supervisor.stop().await;
            assert!(!supervisor.lease_path.exists());
            fs::remove_dir_all(root).unwrap();
        });
    }
}
