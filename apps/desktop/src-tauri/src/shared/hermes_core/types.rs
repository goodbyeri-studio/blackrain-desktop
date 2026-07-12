use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub(crate) const WORK_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum WorkTaskStatus {
    Draft,
    Queued,
    Running,
    WaitingForApproval,
    Stopping,
    Completed,
    Failed,
    Cancelled,
    Degraded,
    Orphaned,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum WorkRuntimeState {
    NotInstalled,
    Stopped,
    Starting,
    Ready,
    Stopping,
    Degraded,
    Crashed,
    RepairRequired,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkRuntimeStatus {
    pub(crate) schema_version: u32,
    pub(crate) state: WorkRuntimeState,
    pub(crate) version: Option<String>,
    pub(crate) pid: Option<u32>,
    pub(crate) base_url: Option<String>,
    pub(crate) started_at: Option<f64>,
    pub(crate) last_error: Option<WorkError>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkTask {
    pub(crate) schema_version: u32,
    pub(crate) task_id: String,
    #[serde(default)]
    pub(crate) activation_id: Option<String>,
    pub(crate) workbench_id: String,
    pub(crate) workbench_version: String,
    pub(crate) project_path: String,
    pub(crate) hermes_session_id: Option<String>,
    pub(crate) active_run_id: Option<String>,
    pub(crate) status: WorkTaskStatus,
    pub(crate) last_event_sequence: u64,
    pub(crate) created_at: f64,
    pub(crate) updated_at: f64,
    #[serde(default)]
    pub(crate) recovery: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum WorkErrorKind {
    Connection,
    Authentication,
    CapabilityMissing,
    InvalidRequest,
    UpstreamModel,
    Tool,
    Timeout,
    Cancelled,
    Runtime,
    Persistence,
    Unsupported,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkError {
    pub(crate) kind: WorkErrorKind,
    pub(crate) code: String,
    pub(crate) message: String,
    pub(crate) retryable: bool,
    pub(crate) http_status: Option<u16>,
    pub(crate) request_id: Option<String>,
    #[serde(default)]
    pub(crate) details: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkEvent {
    pub(crate) schema_version: u32,
    pub(crate) event_id: String,
    pub(crate) sequence: u64,
    pub(crate) task_id: String,
    pub(crate) run_id: String,
    pub(crate) timestamp: f64,
    pub(crate) item_id: Option<String>,
    #[serde(flatten)]
    pub(crate) kind: WorkEventKind,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(crate) enum WorkEventKind {
    TaskStatusChanged {
        status: WorkTaskStatus,
    },
    UserMessageAdded {
        text: String,
        #[serde(default, rename = "projectFileRefs", alias = "project_file_refs")]
        project_file_refs: Vec<String>,
    },
    AgentTextDelta {
        delta: String,
    },
    AgentMessageCompleted {
        text: String,
    },
    ReasoningUpdated {
        text: String,
    },
    ToolStarted {
        tool: String,
        preview: Option<String>,
    },
    ToolProgress {
        tool: String,
        text: String,
    },
    ToolCompleted {
        tool: String,
        duration: Option<f64>,
        error: bool,
    },
    ApprovalRequested {
        command: Option<String>,
        description: Option<String>,
        choices: Vec<String>,
    },
    ApprovalResolved {
        choice: String,
        resolved: u64,
    },
    UserInputRequested {
        prompt: String,
        choices: Vec<String>,
    },
    OutputAvailable {
        path: String,
        media_type: Option<String>,
    },
    WarningRaised {
        message: String,
    },
    TaskFailed {
        error: WorkError,
    },
    Unknown {
        raw_event_type: String,
    },
}

#[cfg(test)]
mod tests {
    use super::{WorkEvent, WorkEventKind, WORK_SCHEMA_VERSION};

    #[test]
    fn rust_serialization_matches_shared_work_event_fixture() {
        let event = WorkEvent {
            schema_version: WORK_SCHEMA_VERSION,
            event_id: "run_demo_001:1".into(),
            sequence: 1,
            task_id: "task_demo_001".into(),
            run_id: "run_demo_001".into(),
            timestamp: 1_783_814_400.1,
            item_id: Some("message_agent_001".into()),
            kind: WorkEventKind::AgentTextDelta {
                delta: "正在读取季度报告。".into(),
            },
        };
        let actual = serde_json::to_value(event).unwrap();
        let expected: serde_json::Value = serde_json::from_str(include_str!(
            "../../../test-fixtures/hermes/v2026.7.7.2/work-event-agent-delta.json"
        ))
        .unwrap();
        assert_eq!(actual, expected);
    }

    #[test]
    fn rust_serialization_preserves_user_message_file_references() {
        let event = WorkEvent {
            schema_version: WORK_SCHEMA_VERSION,
            event_id: "run_demo_001:local-user-message".into(),
            sequence: 1,
            task_id: "task_demo_001".into(),
            run_id: "run_demo_001".into(),
            timestamp: 1_783_814_400.0,
            item_id: Some("user-message:run_demo_001".into()),
            kind: WorkEventKind::UserMessageAdded {
                text: "整理季度报告".into(),
                project_file_refs: vec![
                    r"C:\Users\demo\Office Project\reports\quarterly.xlsx".into()
                ],
            },
        };
        let actual = serde_json::to_value(event).unwrap();
        let expected: serde_json::Value = serde_json::from_str(include_str!(
            "../../../test-fixtures/hermes/v2026.7.7.2/work-event-user-message.json"
        ))
        .unwrap();
        assert_eq!(actual, expected);
    }

    #[test]
    fn legacy_user_message_without_file_refs_remains_readable() {
        let event: WorkEvent = serde_json::from_value(serde_json::json!({
            "schemaVersion": WORK_SCHEMA_VERSION,
            "eventId": "run_demo_001:user-message",
            "sequence": 1,
            "taskId": "task_demo_001",
            "runId": "run_demo_001",
            "timestamp": 1_783_814_400.0,
            "itemId": null,
            "type": "userMessageAdded",
            "text": "整理季度报告"
        }))
        .unwrap();

        assert!(matches!(
            event.kind,
            WorkEventKind::UserMessageAdded {
                project_file_refs,
                ..
            } if project_file_refs.is_empty()
        ));
    }
}
