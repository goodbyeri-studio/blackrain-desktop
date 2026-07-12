use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use futures_util::StreamExt;
use tokio::sync::Mutex;

use super::client::{
    HermesApiClient, HermesConversationMessage, HermesRunCreateRequest, HermesStreamCancellation,
};
use super::events::HermesEventNormalizer;
use super::protocol::HermesSseFrame;
use super::tasks::{local_user_message_event_id, HermesTaskStore};
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
    pub(crate) initial_events: Vec<WorkEvent>,
}

pub(crate) struct WorkRunPresentation {
    pub(crate) user_text: String,
    pub(crate) project_file_refs: Vec<String>,
    pub(crate) source_follow_up_id: Option<String>,
}

const MAX_HISTORY_MESSAGES: usize = 128;
const MAX_HISTORY_MESSAGE_CHARS: usize = 65_536;
const MAX_HISTORY_TOTAL_CHARS: usize = 262_144;

pub(crate) fn build_task_conversation_history(
    events: &[WorkEvent],
) -> Vec<HermesConversationMessage> {
    let mut messages = Vec::new();
    let mut pending_user_run: Option<&str> = None;

    for event in events {
        match &event.kind {
            super::types::WorkEventKind::UserMessageAdded {
                text,
                project_file_refs,
                ..
            } => {
                if pending_user_run.is_some() {
                    messages.push(history_message(
                        "assistant",
                        "[Previous run ended before a final response.]",
                    ));
                }
                messages.push(history_message(
                    "user",
                    &history_user_content(text, project_file_refs),
                ));
                pending_user_run = Some(&event.run_id);
            }
            super::types::WorkEventKind::AgentMessageCompleted { text }
                if pending_user_run == Some(event.run_id.as_str()) && !text.trim().is_empty() =>
            {
                messages.push(history_message("assistant", text));
                pending_user_run = None;
            }
            super::types::WorkEventKind::TaskStatusChanged { status }
                if pending_user_run == Some(event.run_id.as_str())
                    && is_terminal_status(status) =>
            {
                let placeholder = match status {
                    WorkTaskStatus::Cancelled => {
                        "[Previous run was stopped by the user before a final response.]"
                    }
                    WorkTaskStatus::Failed => {
                        "[Previous run failed before producing a final response.]"
                    }
                    _ => "[Previous run completed without a final response.]",
                };
                messages.push(history_message("assistant", placeholder));
                pending_user_run = None;
            }
            _ => {}
        }
    }
    if pending_user_run.is_some() {
        messages.push(history_message(
            "assistant",
            "[Previous run ended before a final response.]",
        ));
    }

    bound_history(messages)
}

fn history_user_content(text: &str, project_file_refs: &[String]) -> String {
    if project_file_refs.is_empty() {
        return text.to_string();
    }
    let mut content = String::with_capacity(text.len() + project_file_refs.len() * 64);
    content.push_str(text);
    content.push_str("\n\nProject file references from that turn:");
    for path in project_file_refs {
        content.push_str("\n- ");
        content.push_str(path);
    }
    content
}

fn history_message(role: &str, content: &str) -> HermesConversationMessage {
    HermesConversationMessage {
        role: role.into(),
        content: serde_json::Value::String(truncate_history_content(content)),
    }
}

fn truncate_history_content(content: &str) -> String {
    let char_count = content.chars().count();
    if char_count <= MAX_HISTORY_MESSAGE_CHARS {
        return content.to_string();
    }
    const MARKER: &str = "\n[... historical message truncated ...]\n";
    let retained = MAX_HISTORY_MESSAGE_CHARS.saturating_sub(MARKER.chars().count());
    let head_len = retained / 2;
    let tail_len = retained.saturating_sub(head_len);
    let head: String = content.chars().take(head_len).collect();
    let mut tail: Vec<char> = content.chars().rev().take(tail_len).collect();
    tail.reverse();
    format!("{head}{MARKER}{}", tail.into_iter().collect::<String>())
}

fn bound_history(messages: Vec<HermesConversationMessage>) -> Vec<HermesConversationMessage> {
    let mut selected = Vec::new();
    let mut total_chars = 0_usize;
    for message in messages.into_iter().rev() {
        let chars = message
            .content
            .as_str()
            .map(|content| content.chars().count())
            .unwrap_or(0);
        if selected.len() >= MAX_HISTORY_MESSAGES
            || total_chars.saturating_add(chars) > MAX_HISTORY_TOTAL_CHARS
        {
            break;
        }
        total_chars = total_chars.saturating_add(chars);
        selected.push(message);
    }
    selected.reverse();
    while selected
        .first()
        .is_some_and(|message| message.role != "user")
    {
        selected.remove(0);
    }
    selected
}

pub(crate) async fn start_task_run(
    store: &Arc<Mutex<HermesTaskStore>>,
    registry: &Arc<HermesRunRegistry>,
    client: &HermesApiClient,
    task_id: &str,
    request: &HermesRunCreateRequest,
    presentation: WorkRunPresentation,
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
    let cancellation = match registry.activate(task_id, &started.run_id).await {
        Ok(cancellation) => cancellation,
        Err(error) => {
            let _ = client.stop_run(&started.run_id).await;
            registry.release(task_id, None).await;
            return Err(error);
        }
    };
    let attached = match store.lock().await.attach_run_with_user_message(
        task_id,
        &started.run_id,
        session_id,
        &presentation.user_text,
        &presentation.project_file_refs,
        presentation.source_follow_up_id.as_deref(),
        request.model.as_deref(),
    ) {
        Ok(attached) => attached,
        Err(error) => {
            cancellation.cancel();
            let _ = client.stop_run(&started.run_id).await;
            registry.release(task_id, Some(&started.run_id)).await;
            return Err(error);
        }
    };
    Ok(StartedTaskRun {
        task: attached.task,
        run_id: started.run_id,
        cancellation,
        initial_events: vec![attached.user_event],
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
    let suppress_upstream_user_message = store
        .lock()
        .await
        .load_events(task_id)?
        .iter()
        .any(|event| event.event_id == local_user_message_event_id(run_id));
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
                    if suppress_upstream_user_message && raw.event == "user.message" {
                        continue;
                    }
                    let normalized = normalizer.normalize(&raw)?;
                    if normalized.is_empty() {
                        continue;
                    }
                    let result = store.lock().await.append_events(task_id, &normalized)?;
                    appended_any |= result.appended > 0;
                    let terminal = is_terminal_status(&result.task.status);
                    for event in result.appended_events {
                        emit(event);
                    }
                    if terminal {
                        return Ok(());
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
        build_task_conversation_history, consume_run_events_with_policy, start_task_run,
        HermesRunRegistry, RunnerRetryPolicy, WorkRunPresentation, MAX_HISTORY_MESSAGES,
        MAX_HISTORY_MESSAGE_CHARS, MAX_HISTORY_TOTAL_CHARS,
    };
    use crate::shared::hermes_core::client::{
        HermesApiClient, HermesRunCreateRequest, HermesStreamCancellation,
    };
    use crate::shared::hermes_core::fake_server::{FakeExchange, FakeHermesServer};
    use crate::shared::hermes_core::tasks::HermesTaskStore;
    use crate::shared::hermes_core::types::{
        WorkErrorKind, WorkEvent, WorkEventKind, WorkTask, WorkTaskStatus, WORK_SCHEMA_VERSION,
    };

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
            activation_id: Some("activation-office-demo".into()),
            workbench_id: "office-agent".into(),
            workbench_version: "0.1.0".into(),
            project_path: r"C:\Users\demo\BlackRain Project".into(),
            title: None,
            pinned: false,
            archived: false,
            model: Some("deepseek-v4-flash".into()),
            hermes_session_id: None,
            active_run_id: None,
            status: WorkTaskStatus::Draft,
            last_event_sequence: 0,
            created_at: 1.0,
            updated_at: 1.0,
            recovery: Default::default(),
            activation_migrations: Vec::new(),
        }
    }

    fn event(sequence: u64, run_id: &str, kind: WorkEventKind) -> WorkEvent {
        WorkEvent {
            schema_version: WORK_SCHEMA_VERSION,
            event_id: format!("event-{sequence}"),
            sequence,
            task_id: "task-runner".into(),
            run_id: run_id.into(),
            timestamp: sequence as f64,
            item_id: None,
            kind,
        }
    }

    #[test]
    fn conversation_history_uses_visible_messages_and_closes_cancelled_turns() {
        let events = vec![
            event(
                1,
                "run-1",
                WorkEventKind::UserMessageAdded {
                    text: "整理报告".into(),
                    project_file_refs: vec![r"C:\Project\report.xlsx".into()],
                    source_follow_up_id: None,
                },
            ),
            event(
                2,
                "run-1",
                WorkEventKind::ToolCompleted {
                    tool: "read_file".into(),
                    duration: Some(0.1),
                    error: false,
                },
            ),
            event(
                3,
                "run-1",
                WorkEventKind::AgentMessageCompleted {
                    text: "报告已整理。".into(),
                },
            ),
            event(
                4,
                "run-2",
                WorkEventKind::UserMessageAdded {
                    text: "继续补充图表".into(),
                    project_file_refs: Vec::new(),
                    source_follow_up_id: None,
                },
            ),
            event(
                5,
                "run-2",
                WorkEventKind::TaskStatusChanged {
                    status: WorkTaskStatus::Cancelled,
                },
            ),
        ];

        let history = build_task_conversation_history(&events);
        assert_eq!(history.len(), 4);
        assert_eq!(history[0].role, "user");
        assert!(history[0]
            .content
            .as_str()
            .unwrap()
            .contains(r"C:\Project\report.xlsx"));
        assert_eq!(history[1].content, serde_json::json!("报告已整理。"));
        assert_eq!(history[2].content, serde_json::json!("继续补充图表"));
        assert_eq!(
            history[3].content,
            serde_json::json!("[Previous run was stopped by the user before a final response.]")
        );
    }

    #[test]
    fn conversation_history_is_bounded_and_starts_at_a_user_turn() {
        let mut events = Vec::new();
        for index in 0..70_u64 {
            let run_id = format!("run-{index}");
            events.push(event(
                index * 2 + 1,
                &run_id,
                WorkEventKind::UserMessageAdded {
                    text: if index == 69 {
                        "末尾".repeat(MAX_HISTORY_MESSAGE_CHARS)
                    } else {
                        format!("用户 {index}")
                    },
                    project_file_refs: Vec::new(),
                    source_follow_up_id: None,
                },
            ));
            events.push(event(
                index * 2 + 2,
                &run_id,
                WorkEventKind::AgentMessageCompleted {
                    text: format!("助手 {index}"),
                },
            ));
        }

        let history = build_task_conversation_history(&events);
        assert!(history.len() <= MAX_HISTORY_MESSAGES);
        assert_eq!(
            history.first().map(|message| message.role.as_str()),
            Some("user")
        );
        assert!(history.iter().all(|message| {
            message
                .content
                .as_str()
                .is_some_and(|content| content.chars().count() <= MAX_HISTORY_MESSAGE_CHARS)
        }));
        assert!(
            history
                .iter()
                .filter_map(|message| message.content.as_str())
                .map(|content| content.chars().count())
                .sum::<usize>()
                <= MAX_HISTORY_TOTAL_CHARS
        );
        assert_eq!(
            history.last().unwrap().content,
            serde_json::json!("助手 69")
        );
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
            WorkRunPresentation {
                user_text: "整理季度报告".into(),
                project_file_refs: vec![r"C:\Users\demo\BlackRain Project\quarterly.xlsx".into()],
                source_follow_up_id: None,
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
        assert_eq!(started.task.last_event_sequence, 1);
        let assert_roundtrip = |actual: &[WorkEvent]| {
            assert_eq!(actual.len(), started.initial_events.len());
            assert!((actual[0].timestamp - started.initial_events[0].timestamp).abs() < 0.000_001);
            let mut normalized = actual.to_vec();
            normalized[0].timestamp = started.initial_events[0].timestamp;
            assert_eq!(normalized, started.initial_events);
        };
        let events = store.lock().await.load_events("task-runner").unwrap();
        assert_roundtrip(&events);
        assert!(matches!(
            &events[0].kind,
            crate::shared::hermes_core::types::WorkEventKind::UserMessageAdded {
                text,
                project_file_refs,
                ..
            } if text == "整理季度报告"
                && project_file_refs == &[r"C:\Users\demo\BlackRain Project\quarterly.xlsx"]
        ));
        let requests = server.finish().await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&requests[0].body).unwrap();
        assert_eq!(body["input"], "整理季度报告");
        assert_eq!(body["instructions"], "只处理当前项目");
        assert_eq!(body["model"], "office-fast");
        assert!(body.get("host").is_none());
        assert!(body.get("port").is_none());
        assert!(body.get("env").is_none());
        let restored = HermesTaskStore::new(&root);
        let restored_events = restored.load_events("task-runner").unwrap();
        assert_roundtrip(&restored_events);
        registry.release("task-runner", Some("run_demo_001")).await;
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn create_run_503_leaves_no_ghost_run_and_requires_an_explicit_retry() {
        let root = temp_root();
        let store = Arc::new(Mutex::new(HermesTaskStore::new(&root)));
        store.lock().await.upsert_task(&task()).unwrap();
        let registry = Arc::new(HermesRunRegistry::default());
        let server = FakeHermesServer::spawn(vec![
            FakeExchange::json(
                "POST",
                "/v1/runs",
                503,
                r#"{"error":{"message":"model unavailable","code":"upstream_busy"}}"#,
            ),
            FakeExchange::json(
                "POST",
                "/v1/runs",
                202,
                r#"{"run_id":"run-after-explicit-retry","status":"started"}"#,
            ),
        ])
        .await
        .unwrap();
        let client = HermesApiClient::new(
            &server.base_url,
            "blackrain-test-bearer-runner-503-123456789",
        )
        .unwrap();
        let request = HermesRunCreateRequest {
            input: serde_json::Value::String("整理季度报告".into()),
            instructions: None,
            session_id: None,
            model: Some("office-fast".into()),
            conversation_history: Vec::new(),
        };

        let error = match start_task_run(
            &store,
            &registry,
            &client,
            "task-runner",
            &request,
            WorkRunPresentation {
                user_text: "整理季度报告".into(),
                project_file_refs: Vec::new(),
                source_follow_up_id: None,
            },
        )
        .await
        {
            Ok(_) => panic!("503 response must not attach a Hermes run"),
            Err(error) => error,
        };

        assert_eq!(error.code, "upstream_busy");
        assert!(error.retryable);
        let failed_task = store.lock().await.load_task("task-runner").unwrap();
        assert_eq!(failed_task.status, WorkTaskStatus::Draft);
        assert_eq!(failed_task.active_run_id, None);
        assert_eq!(failed_task.hermes_session_id, None);
        assert!(store
            .lock()
            .await
            .load_events("task-runner")
            .unwrap()
            .is_empty());

        let started = start_task_run(
            &store,
            &registry,
            &client,
            "task-runner",
            &request,
            WorkRunPresentation {
                user_text: "整理季度报告".into(),
                project_file_refs: Vec::new(),
                source_follow_up_id: None,
            },
        )
        .await
        .unwrap();

        assert_eq!(started.run_id, "run-after-explicit-retry");
        assert_eq!(started.task.status, WorkTaskStatus::Running);
        assert_eq!(server.finish().await.unwrap().len(), 2);
        registry
            .release("task-runner", Some("run-after-explicit-retry"))
            .await;
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn create_run_timeout_is_not_replayed_and_does_not_mutate_the_task() {
        let root = temp_root();
        let store = Arc::new(Mutex::new(HermesTaskStore::new(&root)));
        store.lock().await.upsert_task(&task()).unwrap();
        let registry = Arc::new(HermesRunRegistry::default());
        let server = FakeHermesServer::spawn(vec![FakeExchange::json(
            "POST",
            "/v1/runs",
            202,
            r#"{"run_id":"run-too-late","status":"started"}"#,
        )
        .delay_body(Duration::from_millis(150))])
        .await
        .unwrap();
        let client = HermesApiClient::with_timeouts(
            &server.base_url,
            "blackrain-test-bearer-runner-timeout-123456789",
            Duration::from_millis(30),
            Duration::from_secs(1),
        )
        .unwrap();

        let error = match start_task_run(
            &store,
            &registry,
            &client,
            "task-runner",
            &HermesRunCreateRequest {
                input: serde_json::Value::String("生成报告".into()),
                instructions: None,
                session_id: None,
                model: Some("office-fast".into()),
                conversation_history: Vec::new(),
            },
            WorkRunPresentation {
                user_text: "生成报告".into(),
                project_file_refs: Vec::new(),
                source_follow_up_id: None,
            },
        )
        .await
        {
            Ok(_) => panic!("timed out run creation must not attach a Hermes run"),
            Err(error) => error,
        };

        assert_eq!(error.kind, WorkErrorKind::Timeout);
        assert_eq!(error.code, "hermes_request_timeout");
        assert!(error.retryable);
        let failed_task = store.lock().await.load_task("task-runner").unwrap();
        assert_eq!(failed_task.status, WorkTaskStatus::Draft);
        assert_eq!(failed_task.active_run_id, None);
        assert_eq!(failed_task.hermes_session_id, None);
        assert!(store
            .lock()
            .await
            .load_events("task-runner")
            .unwrap()
            .is_empty());
        assert_eq!(server.finish().await.unwrap().len(), 1);

        registry.reserve("task-runner").await.unwrap();
        registry.release("task-runner", None).await;
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn task_persistence_failure_stops_the_new_run_and_releases_the_registry() {
        let root = temp_root();
        let store = Arc::new(Mutex::new(HermesTaskStore::new(&root)));
        store.lock().await.upsert_task(&task()).unwrap();
        let blocked_journal = store.lock().await.paths.events.join("task-runner.ndjson");
        fs::create_dir_all(&blocked_journal).unwrap();
        let registry = Arc::new(HermesRunRegistry::default());
        let server = FakeHermesServer::spawn(vec![
            FakeExchange::json(
                "POST",
                "/v1/runs",
                202,
                r#"{"run_id":"run-without-local-journal","status":"started"}"#,
            ),
            FakeExchange::json(
                "POST",
                "/v1/runs/run-without-local-journal/stop",
                200,
                r#"{"run_id":"run-without-local-journal","status":"stopping"}"#,
            ),
        ])
        .await
        .unwrap();
        let client = HermesApiClient::new(
            &server.base_url,
            "blackrain-test-bearer-runner-persistence-123456789",
        )
        .unwrap();

        let error = match start_task_run(
            &store,
            &registry,
            &client,
            "task-runner",
            &HermesRunCreateRequest {
                input: serde_json::Value::String("生成报告".into()),
                instructions: None,
                session_id: None,
                model: Some("office-fast".into()),
                conversation_history: Vec::new(),
            },
            WorkRunPresentation {
                user_text: "生成报告".into(),
                project_file_refs: Vec::new(),
                source_follow_up_id: None,
            },
        )
        .await
        {
            Ok(_) => panic!("a run without a durable local journal must not be attached"),
            Err(error) => error,
        };

        assert!(matches!(error.kind, WorkErrorKind::Persistence));
        let failed_task = store.lock().await.load_task("task-runner").unwrap();
        assert_eq!(failed_task.status, WorkTaskStatus::Draft);
        assert_eq!(failed_task.active_run_id, None);
        assert_eq!(failed_task.hermes_session_id, None);
        let requests = server.finish().await.unwrap();
        assert_eq!(requests.len(), 2);
        assert_eq!(requests[1].method, "POST");
        assert_eq!(requests[1].path, "/v1/runs/run-without-local-journal/stop");

        registry.reserve("task-runner").await.unwrap();
        registry.release("task-runner", None).await;
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
        let conversation_history = build_task_conversation_history(&[
            event(
                1,
                "run-original",
                WorkEventKind::UserMessageAdded {
                    text: "先整理数据".into(),
                    project_file_refs: Vec::new(),
                    source_follow_up_id: None,
                },
            ),
            event(
                2,
                "run-original",
                WorkEventKind::AgentMessageCompleted {
                    text: "数据已整理。".into(),
                },
            ),
        ]);
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
                conversation_history,
            },
            WorkRunPresentation {
                user_text: "继续处理".into(),
                project_file_refs: Vec::new(),
                source_follow_up_id: None,
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
        assert_eq!(
            body["conversation_history"],
            serde_json::json!([
                {"role": "user", "content": "先整理数据"},
                {"role": "assistant", "content": "数据已整理。"}
            ])
        );
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
    async fn tool_failure_is_journaled_emitted_and_converges_the_task_to_failed() {
        let root = temp_root();
        let store = Arc::new(Mutex::new(HermesTaskStore::new(&root)));
        {
            let guard = store.lock().await;
            guard.upsert_task(&task()).unwrap();
            guard
                .attach_run("task-runner", "run_demo_failed", "run_demo_failed")
                .unwrap();
        }
        let server = FakeHermesServer::spawn(vec![FakeExchange::sse(
            "/v1/runs/run_demo_failed/events",
            include_str!("../../../test-fixtures/hermes/v2026.7.7.2/sse-failures.txt"),
        )])
        .await
        .unwrap();
        let client = HermesApiClient::new(
            &server.base_url,
            "blackrain-test-bearer-runner-tool-failure-123456789",
        )
        .unwrap();
        let emitted = Arc::new(StdMutex::new(Vec::new()));
        let emitted_for_run = Arc::clone(&emitted);

        consume_run_events_with_policy(
            &store,
            &client,
            "task-runner",
            "run_demo_failed",
            &HermesStreamCancellation::new(),
            &RunnerRetryPolicy { backoff: vec![] },
            move |event| emitted_for_run.lock().unwrap().push(event),
        )
        .await
        .unwrap();

        let events = store.lock().await.load_events("task-runner").unwrap();
        assert_eq!(*emitted.lock().unwrap(), events);
        assert!(events
            .iter()
            .any(|event| matches!(event.kind, WorkEventKind::ToolCompleted { error: true, .. })));
        assert!(events
            .iter()
            .any(|event| matches!(event.kind, WorkEventKind::TaskFailed { .. })));
        let failed_task = store.lock().await.load_task("task-runner").unwrap();
        assert_eq!(failed_task.status, WorkTaskStatus::Failed);
        assert_eq!(failed_task.active_run_id, None);
        assert_eq!(
            failed_task.last_event_sequence,
            events.last().unwrap().sequence
        );
        assert_eq!(server.finish().await.unwrap().len(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn local_user_message_suppresses_upstream_echo_for_the_same_run() {
        let root = temp_root();
        let store = Arc::new(Mutex::new(HermesTaskStore::new(&root)));
        {
            let guard = store.lock().await;
            guard.upsert_task(&task()).unwrap();
            guard
                .attach_run_with_user_message(
                    "task-runner",
                    "run_demo_001",
                    "run_demo_001",
                    "检查季度报告",
                    &[r"C:\Users\demo\BlackRain Project\quarterly.xlsx".into()],
                    None,
                    None,
                )
                .unwrap();
        }
        let sse = concat!(
            "data: {\"event\":\"user.message\",\"run_id\":\"run_demo_001\",\"timestamp\":1783814400.1,\"text\":\"检查季度报告\"}\n\n",
            "data: {\"event\":\"run.completed\",\"run_id\":\"run_demo_001\",\"timestamp\":1783814401.0,\"output\":\"检查完成。\"}\n\n"
        );
        let server =
            FakeHermesServer::spawn(vec![FakeExchange::sse("/v1/runs/run_demo_001/events", sse)])
                .await
                .unwrap();
        let client = HermesApiClient::new(
            &server.base_url,
            "blackrain-test-bearer-runner-user-echo-123456789",
        )
        .unwrap();

        consume_run_events_with_policy(
            &store,
            &client,
            "task-runner",
            "run_demo_001",
            &HermesStreamCancellation::new(),
            &RunnerRetryPolicy { backoff: vec![] },
            |_| {},
        )
        .await
        .unwrap();

        let events = store.lock().await.load_events("task-runner").unwrap();
        let user_messages = events
            .iter()
            .filter(|event| {
                matches!(
                    event.kind,
                    crate::shared::hermes_core::types::WorkEventKind::UserMessageAdded { .. }
                )
            })
            .collect::<Vec<_>>();
        assert_eq!(user_messages.len(), 1);
        assert_eq!(user_messages[0].event_id, "run_demo_001:local-user-message");
        assert_eq!(events.last().unwrap().sequence, 3);
        assert_eq!(server.finish().await.unwrap().len(), 1);
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
