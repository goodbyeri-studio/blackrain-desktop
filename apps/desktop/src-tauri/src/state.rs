use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::process::Child;
use tokio::sync::Mutex;

use crate::dictation::DictationState;
use crate::shared::codex_core::CodexLoginCancelState;
use crate::shared::hermes_core::process::{HermesProcessSupervisor, HermesRuntimeLayout};
use crate::shared::hermes_core::runner::HermesRunRegistry;
use crate::shared::hermes_core::tasks::{HermesTaskRecoveryState, HermesTaskStore};
use crate::shared::plugin_core::VerifiedPluginRuntimeStore;
use crate::shared::workbench_core::ActivatedWorkbenchStore;
use crate::storage::{read_settings, read_workspaces};
use crate::types::{
    AppSettings, ModelGatewayRuntimeState, ModelGatewayRuntimeStatus, TcpDaemonState,
    TcpDaemonStatus, WorkspaceEntry,
};

pub(crate) struct TcpDaemonRuntime {
    pub(crate) child: Option<Child>,
    pub(crate) status: TcpDaemonStatus,
}

pub(crate) struct ModelGatewayRuntime {
    pub(crate) child: Option<Child>,
    /// 子进程实际启动时使用的端口。settings.port 改了但进程还没重启时，
    /// 用它判断「在跑的网关」和「当前配置端口」是否一致。
    pub(crate) child_port: Option<u16>,
    pub(crate) status: ModelGatewayRuntimeStatus,
}

impl Default for TcpDaemonRuntime {
    fn default() -> Self {
        Self {
            child: None,
            status: TcpDaemonStatus {
                state: TcpDaemonState::Stopped,
                pid: None,
                started_at_ms: None,
                last_error: None,
                listen_addr: None,
            },
        }
    }
}

impl ModelGatewayRuntime {
    fn new(data_dir: PathBuf, port: u16) -> Self {
        let base_url = format!("http://127.0.0.1:{port}/v1");
        let log_path = data_dir
            .join("model-gateway.log")
            .to_string_lossy()
            .to_string();
        Self {
            child: None,
            child_port: None,
            status: ModelGatewayRuntimeStatus {
                state: ModelGatewayRuntimeState::Stopped,
                pid: None,
                port,
                base_url,
                started_at_ms: None,
                last_error: None,
                log_path,
                provider_count: 0,
                model_count: 0,
            },
        }
    }
}

pub(crate) struct AppState {
    pub(crate) workspaces: Mutex<HashMap<String, WorkspaceEntry>>,
    pub(crate) sessions: Mutex<HashMap<String, Arc<crate::codex::WorkspaceSession>>>,
    pub(crate) terminal_sessions: Mutex<HashMap<String, Arc<crate::terminal::TerminalSession>>>,
    pub(crate) remote_backend: Mutex<Option<crate::remote_backend::RemoteBackend>>,
    pub(crate) storage_path: PathBuf,
    pub(crate) settings_path: PathBuf,
    /// 唯一由 Tauri App data API 派生的隔离 Hermes 路径；不得回退到用户 `~/.hermes`。
    pub(crate) hermes_paths: crate::shared::hermes_core::config::HermesPaths,
    pub(crate) app_settings: Mutex<AppSettings>,
    pub(crate) dictation: Mutex<DictationState>,
    pub(crate) codex_login_cancels: Mutex<HashMap<String, CodexLoginCancelState>>,
    pub(crate) tcp_daemon: Mutex<TcpDaemonRuntime>,
    pub(crate) model_gateway: Mutex<ModelGatewayRuntime>,
    pub(crate) hermes_runtime: Arc<HermesProcessSupervisor>,
    pub(crate) hermes_tasks: Arc<Mutex<HermesTaskStore>>,
    pub(crate) hermes_task_recovery: Arc<Mutex<HermesTaskRecoveryState>>,
    pub(crate) hermes_runs: Arc<HermesRunRegistry>,
    pub(crate) hermes_activation_gate: Arc<Mutex<()>>,
    pub(crate) plugin_runtimes: Arc<Mutex<VerifiedPluginRuntimeStore>>,
    pub(crate) workbench_activations: Arc<Mutex<ActivatedWorkbenchStore>>,
}

impl AppState {
    pub(crate) fn load(app: &AppHandle) -> Self {
        let data_dir = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| ".".into()));
        let storage_path = data_dir.join("workspaces.json");
        let settings_path = data_dir.join("settings.json");
        let hermes_paths =
            crate::shared::hermes_core::config::HermesPaths::from_app_data_dir(&data_dir);
        let hermes_runtime_root = app
            .path()
            .resource_dir()
            .ok()
            .map(|root| root.join("hermes-runtime").join("windows-x64"))
            .filter(|root| root.exists())
            .unwrap_or_else(|| {
                PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("resources")
                    .join("hermes-runtime")
                    .join("windows-x64")
            });
        let hermes_runtime = Arc::new(HermesProcessSupervisor::new(
            HermesRuntimeLayout::from_root(hermes_runtime_root),
            hermes_paths.home.clone(),
            data_dir.join("hermes-runtime.log"),
        ));
        let hermes_tasks = HermesTaskStore::new(&data_dir);
        let hermes_task_recovery = HermesTaskRecoveryState::from_result(
            hermes_tasks
                .audit_interrupted_follow_ups()
                .and_then(|_| hermes_tasks.audit_local_recovery()),
        );
        let workbench_activations = ActivatedWorkbenchStore::new(&data_dir);
        let plugin_runtimes = VerifiedPluginRuntimeStore::new(&data_dir);
        if std::env::var_os("CODEX_HOME").is_none() {
            std::env::set_var("CODEX_HOME", data_dir.join("codex-home"));
        }
        let workspaces = read_workspaces(&storage_path).unwrap_or_default();
        let app_settings = read_settings(&settings_path).unwrap_or_default();
        let gateway_port = app_settings.model_gateway.port;
        Self {
            workspaces: Mutex::new(workspaces),
            sessions: Mutex::new(HashMap::new()),
            terminal_sessions: Mutex::new(HashMap::new()),
            remote_backend: Mutex::new(None),
            storage_path,
            settings_path,
            hermes_paths,
            app_settings: Mutex::new(app_settings),
            dictation: Mutex::new(DictationState::default()),
            codex_login_cancels: Mutex::new(HashMap::new()),
            tcp_daemon: Mutex::new(TcpDaemonRuntime::default()),
            model_gateway: Mutex::new(ModelGatewayRuntime::new(data_dir, gateway_port)),
            hermes_runtime,
            hermes_tasks: Arc::new(Mutex::new(hermes_tasks)),
            hermes_task_recovery: Arc::new(Mutex::new(hermes_task_recovery)),
            hermes_runs: Arc::new(HermesRunRegistry::default()),
            hermes_activation_gate: Arc::new(Mutex::new(())),
            plugin_runtimes: Arc::new(Mutex::new(plugin_runtimes)),
            workbench_activations: Arc::new(Mutex::new(workbench_activations)),
        }
    }
}
