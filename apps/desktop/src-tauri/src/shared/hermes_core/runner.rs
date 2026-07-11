use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use futures_util::StreamExt;
use tokio::sync::Mutex;

use super::client::{HermesApiClient, HermesRunCreateRequest, HermesStreamCancellation};
use super::events::HermesEventNormalizer;
use super::protocol::HermesSseFrame;
use super::tasks::HermesTaskStore;
use super::types::{WorkError, WorkErrorKind, WorkEvent, WorkTask, WorkTaskStatus};

#[derive(Clone)]
struct ActiveRun {
    run_id: Option<String>,
    cancellation: Option<HermesStreamCancellation>,
}

#[derive(Default)]
pub(crate) struct HermesRunRegistry {
    active: Mutex<HashMap<String, ActiveRun>>,
}

pub(crate) struct StartedTaskRun {
    pub(crate) task: WorkTask,
    pub(crate) run_id: String,
    pub(crate) cancellation: HermesStreamCancellation,
}

pub(crate) async fn start_task_run(
    store: &Arc<Mutex<HermesTaskStore>>,
    registry: &Arc<HermesRunRegistry>,
    client: &HermesApiClient,
    task_id: &str,
    request: &HermesRunCreateRequest,
) -> Result<StartedTaskRun, WorkError> {
    registry.reserve(task_id).await?;
    let started = match client.create_run(request).await {
        Ok(started) => started,
        Err(error) => {
            registry.release(task_id, None).await;
            return Err(error);
        }
    };
    let session_id = request.session_id.as_deref().unwrap_or(&started.run_id);
    let task = match store
        .lock()
        .await
        .attach_run(task_id, &started.run_id, session_id)
    {
        Ok(task) => task,
        Err(error) => {
            let _ = client.stop_run(&started.run_id).await;
            registry.release(task_id, None).await;
            return Err(error);
        }
    };
    let cancellation = match registry.activate(task_id, &started.run_id).await {
        Ok(cancellation) => cancellation,
        Err(error) => {
            let _ = client.stop_run(&started.run_id).await;
            registry.release(task_id, None).await;
            return Err(error);
        }
    };
    Ok(StartedTaskRun {
        task,
        run_id: started.run_id,
        cancellation,
    })
}

impl HermesRunRegistry {
    pub(crate) async fn reserve(&self, task_id: &str) -> Result<(), WorkError> {
        let mut active = self.active.lock().await;
        if active.contains_key(task_id) {
            return Err(runner_error(
                "hermes_task_operation_in_progress",
                "A Hermes operation is already active for this WORK task.",
                false,
            ));
        }
        active.insert(
            task_id.into(),
            ActiveRun {
                run_id: None,
                cancellation: None,
            },
        );
        Ok(())
    }

    pub(crate) async fn activate(
        &self,
        task_id: &str,
        run_id: &str,
    ) -> Result<HermesStreamCancellation, WorkError> {
        let mut active = self.active.lock().await;
        if let Some(existing) = active.get(task_id) {
            let code = if existing.run_id.as_deref() == Some(run_id) {
                "hermes_run_stream_already_active"
            } else if existing.run_id.is_none() {
                let cancellation = HermesStreamCancellation::new();
                active.insert(
                    task_id.into(),
                    ActiveRun {
                        run_id: Some(run_id.into()),
                        cancellation: Some(cancellation.clone()),
                    },
                );
                return Ok(cancellation);
            } else {
                "hermes_task_has_different_active_stream"
            };
            return Err(runner_error(
                code,
                "A Hermes event stream is already active for this WORK task.",
                false,
            ));
        }
        let cancellation = HermesStreamCancellation::new();
        active.insert(
            task_id.into(),
            ActiveRun {
                run_id: Some(run_id.into()),
                cancellation: Some(cancellation.clone()),
            },
        );
        Ok(cancellation)
    }

    pub(crate) async fn cancel_all(&self) {
        let mut active = self.active.lock().await;
        for entry in active.values() {
            if let Some(cancellation) = &entry.cancellation {
                cancellation.cancel();
            }
        }
        active.clear();
    }

    pub(crate) async fn release(&self, task_id: &str, run_id: Option<&str>) {
        let mut active = self.active.lock().await;
        if active
            .get(task_id)
            .is_some_and(|entry| run_id.is_none() || entry.run_id.as_deref() == run_id)
        {
            active.remove(task_id);
        }
    }
}

pub(crate) async fn consume_run_events<F>(
    store: &Arc<Mutex<HermesTaskStore>>,
    client: &HermesApiClient,
    task_id: &str,
    run_id: &str,
    cancellation: &HermesStreamCancellation,
    emit: F,
) -> Result<(), WorkError>
where
    F: Fn(WorkEvent) + Send + Sync,
{
    consume_run_events_with_policy(
        store,
        client,
        task_id,
        run_id,
        cancellation,
        &RunnerRetryPolicy::default(),
        emit,
    )
    .await
}

struct RunnerRetryPolicy {
    backoff: Vec<Duration>,
}

impl Default for RunnerRetryPolicy {
    fn default() -> Self {
        Self {
            backoff: vec![
                Duration::from_millis(250),
                Duration::from_millis(750),
                Duration::from_millis(1_500),
            ],
        }
    }
}

async fn consume_run_events_with_policy<F>(
    store: &Arc<Mutex<HermesTaskStore>>,
    client: &HermesApiClient,
    task_id: &str,
    run_id: &str,
    cancellation: &HermesStreamCancellation,
    retry_policy: &RunnerRetryPolicy,
    emit: F,
) -> Result<(), WorkError>
where
    F: Fn(WorkEvent) + Send + Sync,
{
    let task = store.lock().await.load_task(task_id)?;
    if task.active_run_id.as_deref() != Some(run_id) {
        return Err(runner_error(
            "work_task_run_mismatch",
            "WORK task is no longer attached to the requested Hermes run.",
            false,
        ));
    }
    let mut normalizer = HermesEventNormalizer::new(task_id, run_id, task.last_event_sequence)?;
    let mut reconnect_attempt = 0_usize;
    loop {
        let mut stream = match client
            .stream_run_events_with_cancel(run_id, cancellation)
            .await
        {
            Ok(stream) => stream,
            Err(error) if error.kind == WorkErrorKind::Cancelled => return Ok(()),
            Err(error) => {
                let active = prepare_reconnect(store, client, task_id, run_id, &error).await?;
                if !active {
                    return Ok(());
                }
                if !error.retryable || reconnect_attempt >= retry_policy.backoff.len() {
                    return Err(error);
                }
                tokio::time::sleep(retry_policy.backoff[reconnect_attempt]).await;
                reconnect_attempt += 1;
                continue;
            }
        };
        let mut stream_error = None;
        let mut appended_any = false;
        while let Some(frame) = stream.next().await {
            match frame {
                Ok(HermesSseFrame::Comment(_)) => {}
                Ok(HermesSseFrame::Event(raw)) => {
                    let normalized = normalizer.normalize(&raw)?;
                    if normalized.is_empty() {
                        continue;
                    }
                    let result = store.lock().await.append_events(task_id, &normalized)?;
                    appended_any |= result.appended > 0;
                    for event in result.appended_events {
                        emit(event);
                    }
                }
                Err(error) if error.kind == WorkErrorKind::Cancelled => return Ok(()),
                Err(error) => {
                    stream_error = Some(error);
                    break;
                }
            }
        }

        let task = store.lock().await.load_task(task_id)?;
        if task.active_run_id.as_deref() != Some(run_id) {
            return Ok(());
        }
        let error = stream_error.unwrap_or_else(|| {
            runner_error_kind(
                WorkErrorKind::Connection,
                "hermes_sse_ended_before_terminal",
                "Hermes event stream ended before the run reached a terminal state.",
                true,
            )
        });
        let active = prepare_reconnect(store, client, task_id, run_id, &error).await?;
        if !active {
            return Ok(());
        }
        if appended_any {
            reconnect_attempt = 0;
        }
        if !error.retryable || reconnect_attempt >= retry_policy.backoff.len() {
            let exhausted = if error.retryable {
                runner_error_kind(
                    WorkErrorKind::Connection,
                    "hermes_sse_reconnect_exhausted",
                    "Hermes event stream reconnect attempts were exhausted.",
                    true,
                )
            } else {
                error
            };
            store
                .lock()
                .await
                .reconcile_remote_error(task_id, run_id, &exhausted)?;
            return Err(exhausted);
        }
        tokio::time::sleep(retry_policy.backoff[reconnect_attempt]).await;
        reconnect_attempt += 1;
    }
}

async fn prepare_reconnect(
    store: &Arc<Mutex<HermesTaskStore>>,
    client: &HermesApiClient,
    task_id: &str,
    run_id: &str,
    stream_error: &WorkError,
) -> Result<bool, WorkError> {
    match client.run_status(run_id).await {
        Ok(status) => {
            store
                .lock()
                .await
                .reconcile_remote_status(task_id, run_id, &status)?;
            let task = store.lock().await.load_task(task_id)?;
            Ok(task.active_run_id.as_deref() == Some(run_id)
                && !is_terminal_status(&task.status)
                && task.status != WorkTaskStatus::Orphaned)
        }
        Err(status_error) => {
            store
                .lock()
                .await
                .reconcile_remote_error(task_id, run_id, &status_error)?;
            if !stream_error.retryable || !status_error.retryable {
                return Err(status_error);
            }
            Ok(true)
        }
    }
}

fn runner_error_kind(kind: WorkErrorKind, code: &str, message: &str, retryable: bool) -> WorkError {
    WorkError {
        kind,
        code: code.into(),
        message: message.into(),
        retryable,
        http_status: None,
        request_id: None,
        details: Default::default(),
    }
}

pub(crate) fn is_terminal_status(status: &WorkTaskStatus) -> bool {
    matches!(
        status,
        WorkTaskStatus::Completed | WorkTaskStatus::Failed | WorkTaskStatus::Cancelled
    )
}

fn runner_error(code: &str, message: &str, retryable: bool) -> WorkError {
    WorkError {
        kind: WorkErrorKind::Runtime,
        code: code.into(),
        message: message.into(),
        retryable,
        http_status: None,
        request_id: None,
        details: Default::default(),
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::sync::{Arc, Mutex as StdMutex};
    use std::time::Duration;

    use tokio::sync::Mutex;

    use super::{
        consume_run_events_with_policy, start_task_run, HermesRunRegistry, RunnerRetryPolicy,
    };
    use crate::shared::hermes_core::client::{
        HermesApiClient, HermesRunCreateRequest, HermesStreamCancellation,
    };
    use crate::shared::hermes_core::fake_server::{FakeExchange, FakeHermesServer};
    use crate::shared::hermes_core::tasks::HermesTaskStore;
    use crate::shared::hermes_core::types::{WorkTask, WorkTaskStatus, WORK_SCHEMA_VERSION};

    fn temp_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "blackrain-hermes-runner-{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn task() -> WorkTask {
        WorkTask {
            schema_version: WORK_SCHEMA_VERSION,
            task_id: "task-runner".into(),
            workbench_id: "office-agent".into(),
            workbench_version: "0.1.0".into(),
            project_path: r"C:\Users\demo\BlackRain Project".into(),
            hermes_session_id: None,
            active_run_id: None,
            status: WorkTaskStatus::Draft,
            last_event_sequence: 0,
            created_at: 1.0,
            updated_at: 1.0,
            recovery: Default::default(),
        }
    }

    #[tokio::test]
    async fn registry_blocks_duplicate_task_operations() {
        let registry = HermesRunRegistry::default();
        registry.reserve("task-1").await.unwrap();
        assert_eq!(
            registry.reserve("task-1").await.unwrap_err().code,
            "hermes_task_operation_in_progress"
        );
        let cancellation = registry.activate("task-1", "run-1").await.unwrap();
        registry.cancel_all().await;
        assert!(cancellation.is_cancelled());
        registry.release("task-1", Some("run-1")).await;
        registry.reserve("task-1").await.unwrap();
    }

    #[tokio::test]
    async fn start_run_is_transactionally_attached_to_the_task() {
        let root = temp_root();
        let store = Arc::new(Mutex::new(HermesTaskStore::new(&root)));
        store.lock().await.upsert_task(&task()).unwrap();
        let registry = Arc::new(HermesRunRegistry::default());
        let server = FakeHermesServer::spawn(vec![FakeExchange::json(
            "POST",
            "/v1/runs",
            202,
            r#"{"run_id":"run_demo_001","status":"started"}"#,
        )])
        .await
        .unwrap();
        let client = HermesApiClient::new(
            &server.base_url,
            "blackrain-test-bearer-runner-start-123456789",
        )
        .unwrap();
        let started = start_task_run(
            &store,
            &registry,
            &client,
            "task-runner",
            &HermesRunCreateRequest {
                input: serde_json::Value::String("整理季度报告".into()),
                instructions: Some("只处理当前项目".into()),
                session_id: None,
                model: Some("office-fast".into()),
                conversation_history: Vec::new(),
            },
        )
        .await
        .unwrap();

        assert_eq!(started.run_id, "run_demo_001");
        assert_eq!(started.task.status, WorkTaskStatus::Running);
        assert_eq!(
            started.task.hermes_session_id.as_deref(),
            Some("run_demo_001")
        );
        assert_eq!(started.task.active_run_id.as_deref(), Some("run_demo_001"));
        let requests = server.finish().await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&requests[0].body).unwrap();
        assert_eq!(body["input"], "整理季度报告");
        assert_eq!(body["instructions"], "只处理当前项目");
        assert_eq!(body["model"], "office-fast");
        assert!(body.get("host").is_none());
        assert!(body.get("port").is_none());
        assert!(body.get("env").is_none());
        registry.release("task-runner", Some("run_demo_001")).await;
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn continuation_preserves_the_existing_session_scope() {
        let root = temp_root();
        let store = Arc::new(Mutex::new(HermesTaskStore::new(&root)));
        let mut continuing = task();
        continuing.task_id = "task-continue".into();
        continuing.status = WorkTaskStatus::Completed;
        continuing.hermes_session_id = Some("session-original".into());
        store.lock().await.upsert_task(&continuing).unwrap();
        let registry = Arc::new(HermesRunRegistry::default());
        let server = FakeHermesServer::spawn(vec![FakeExchange::json(
            "POST",
            "/v1/runs",
            202,
            r#"{"run_id":"run-continued","status":"started"}"#,
        )])
        .await
        .unwrap();
        let client = HermesApiClient::new(
            &server.base_url,
            "blackrain-test-bearer-runner-continue-123456789",
        )
        .unwrap();
        let started = start_task_run(
            &store,
            &registry,
            &client,
            "task-continue",
            &HermesRunCreateRequest {
                input: serde_json::Value::String("继续处理".into()),
                instructions: None,
                session_id: Some("session-original".into()),
                model: None,
                conversation_history: Vec::new(),
            },
        )
        .await
        .unwrap();

        assert_eq!(started.task.active_run_id.as_deref(), Some("run-continued"));
        assert_eq!(
            started.task.hermes_session_id.as_deref(),
            Some("session-original")
        );
        let requests = server.finish().await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&requests[0].body).unwrap();
        assert_eq!(body["session_id"], "session-original");
        registry
            .release("task-continue", Some("run-continued"))
            .await;
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn replayed_sse_is_persisted_and_emitted_only_once() {
        let root = temp_root();
        let store = Arc::new(Mutex::new(HermesTaskStore::new(&root)));
        {
            let guard = store.lock().await;
            guard.upsert_task(&task()).unwrap();
            guard
                .attach_run("task-runner", "run_demo_001", "run_demo_001")
                .unwrap();
        }
        let sse = include_str!("../../../test-fixtures/hermes/v2026.7.7.2/sse-normal.txt");
        let completed = serde_json::json!({
            "object": "hermes.run",
            "run_id": "run_demo_001",
            "status": "completed",
            "created_at": 1.0,
            "updated_at": 3.0,
            "session_id": "run_demo_001",
            "model": "office-fast",
            "last_event": "run.completed"
        })
        .to_string();
        let server = FakeHermesServer::spawn(vec![
            FakeExchange::sse("/v1/runs/run_demo_001/events", sse),
            FakeExchange::sse("/v1/runs/run_demo_001/events", sse),
            FakeExchange::json("GET", "/v1/runs/run_demo_001", 200, &completed),
        ])
        .await
        .unwrap();
        let client = HermesApiClient::new(
            &server.base_url,
            "blackrain-test-bearer-runner-replay-123456789",
        )
        .unwrap();
        let emitted = Arc::new(StdMutex::new(Vec::new()));

        let emitted_for_run = Arc::clone(&emitted);
        consume_run_events_with_policy(
            &store,
            &client,
            "task-runner",
            "run_demo_001",
            &HermesStreamCancellation::new(),
            &RunnerRetryPolicy { backoff: vec![] },
            move |event| emitted_for_run.lock().unwrap().push(event),
        )
        .await
        .unwrap();
        let first_emit_count = emitted.lock().unwrap().len();
        let first_journal_count = store.lock().await.load_events("task-runner").unwrap().len();
        assert!(first_emit_count > 0);
        store
            .lock()
            .await
            .attach_run("task-runner", "run_demo_001", "run_demo_001")
            .unwrap();

        let emitted_for_replay = Arc::clone(&emitted);
        consume_run_events_with_policy(
            &store,
            &client,
            "task-runner",
            "run_demo_001",
            &HermesStreamCancellation::new(),
            &RunnerRetryPolicy { backoff: vec![] },
            move |event| emitted_for_replay.lock().unwrap().push(event),
        )
        .await
        .unwrap();

        assert_eq!(emitted.lock().unwrap().len(), first_emit_count);
        assert_eq!(
            store.lock().await.load_events("task-runner").unwrap().len(),
            first_journal_count
        );
        assert_eq!(server.finish().await.unwrap().len(), 3);
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn retryable_disconnect_queries_status_and_reconnects_without_duplicates() {
        let root = temp_root();
        let store = Arc::new(Mutex::new(HermesTaskStore::new(&root)));
        {
            let guard = store.lock().await;
            guard.upsert_task(&task()).unwrap();
            guard
                .attach_run("task-runner", "run_demo_001", "run_demo_001")
                .unwrap();
        }
        let sse = include_str!("../../../test-fixtures/hermes/v2026.7.7.2/sse-normal.txt");
        let disconnect_after = sse.find("\n\n").unwrap() + 12;
        let running = serde_json::json!({
            "object": "hermes.run",
            "run_id": "run_demo_001",
            "status": "running",
            "created_at": 1.0,
            "updated_at": 2.0,
            "session_id": "run_demo_001",
            "model": "office-fast",
            "last_event": "message.delta"
        })
        .to_string();
        let server = FakeHermesServer::spawn(vec![
            FakeExchange::sse("/v1/runs/run_demo_001/events", sse)
                .disconnect_after(disconnect_after),
            FakeExchange::json("GET", "/v1/runs/run_demo_001", 200, &running),
            FakeExchange::sse("/v1/runs/run_demo_001/events", sse),
        ])
        .await
        .unwrap();
        let client = HermesApiClient::new(
            &server.base_url,
            "blackrain-test-bearer-runner-reconnect-123456789",
        )
        .unwrap();
        let emitted = Arc::new(StdMutex::new(Vec::new()));
        let emitted_for_run = Arc::clone(&emitted);

        consume_run_events_with_policy(
            &store,
            &client,
            "task-runner",
            "run_demo_001",
            &HermesStreamCancellation::new(),
            &RunnerRetryPolicy {
                backoff: vec![Duration::ZERO],
            },
            move |event| emitted_for_run.lock().unwrap().push(event),
        )
        .await
        .unwrap();

        let events = store.lock().await.load_events("task-runner").unwrap();
        assert_eq!(emitted.lock().unwrap().len(), events.len());
        assert_eq!(
            events
                .iter()
                .map(|event| event.event_id.as_str())
                .collect::<std::collections::HashSet<_>>()
                .len(),
            events.len()
        );
        assert_eq!(
            store.lock().await.load_task("task-runner").unwrap().status,
            WorkTaskStatus::Completed
        );
        assert_eq!(server.finish().await.unwrap().len(), 3);
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn reconnect_attempts_are_bounded_and_leave_the_task_degraded() {
        let root = temp_root();
        let store = Arc::new(Mutex::new(HermesTaskStore::new(&root)));
        {
            let guard = store.lock().await;
            guard.upsert_task(&task()).unwrap();
            guard
                .attach_run("task-runner", "run_demo_001", "run_demo_001")
                .unwrap();
        }
        let sse = include_str!("../../../test-fixtures/hermes/v2026.7.7.2/sse-normal.txt");
        let disconnect_after = sse.find("\n\n").unwrap() + 12;
        let running = serde_json::json!({
            "object": "hermes.run",
            "run_id": "run_demo_001",
            "status": "running",
            "created_at": 1.0,
            "updated_at": 2.0,
            "session_id": "run_demo_001",
            "model": "office-fast",
            "last_event": "message.delta"
        })
        .to_string();
        let mut exchanges = Vec::new();
        for _ in 0..3 {
            exchanges.push(
                FakeExchange::sse("/v1/runs/run_demo_001/events", sse)
                    .disconnect_after(disconnect_after),
            );
            exchanges.push(FakeExchange::json(
                "GET",
                "/v1/runs/run_demo_001",
                200,
                &running,
            ));
        }
        let server = FakeHermesServer::spawn(exchanges).await.unwrap();
        let client = HermesApiClient::new(
            &server.base_url,
            "blackrain-test-bearer-runner-exhausted-123456789",
        )
        .unwrap();

        let error = consume_run_events_with_policy(
            &store,
            &client,
            "task-runner",
            "run_demo_001",
            &HermesStreamCancellation::new(),
            &RunnerRetryPolicy {
                backoff: vec![Duration::ZERO, Duration::ZERO],
            },
            |_| {},
        )
        .await
        .unwrap_err();

        assert_eq!(error.code, "hermes_sse_reconnect_exhausted");
        assert_eq!(
            store.lock().await.load_task("task-runner").unwrap().status,
            WorkTaskStatus::Degraded
        );
        assert_eq!(server.finish().await.unwrap().len(), 6);
        fs::remove_dir_all(root).unwrap();
    }
}
