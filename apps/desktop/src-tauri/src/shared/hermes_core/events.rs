use std::collections::{BTreeMap, HashSet, VecDeque};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::protocol::HermesRawEvent;
use super::types::{
    WorkError, WorkErrorKind, WorkEvent, WorkEventKind, WorkTaskStatus, WORK_SCHEMA_VERSION,
};

const MAX_SEEN_RAW_EVENTS: usize = 20_000;
const MAX_UNKNOWN_DIAGNOSTICS: usize = 200;
const MAX_MESSAGE_CHARS: usize = 256 * 1024;
const MAX_DELTA_CHARS: usize = 64 * 1024;
const MAX_REASONING_CHARS: usize = 32 * 1024;
const MAX_METADATA_CHARS: usize = 4 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesUnknownEventDiagnostic {
    pub(crate) event_type: String,
    pub(crate) run_id: String,
    pub(crate) timestamp: u64,
    pub(crate) payload_keys: Vec<String>,
    pub(crate) reason: String,
}

pub(crate) struct HermesEventNormalizer {
    task_id: String,
    run_id: String,
    next_sequence: u64,
    seen_fingerprints: HashSet<String>,
    seen_order: VecDeque<String>,
    active_tools: BTreeMap<String, u64>,
    approval_pending: u64,
    message_buffer: String,
    unknown_diagnostics: VecDeque<HermesUnknownEventDiagnostic>,
}

impl HermesEventNormalizer {
    pub(crate) fn new(
        task_id: impl Into<String>,
        run_id: impl Into<String>,
        last_sequence: u64,
    ) -> Result<Self, WorkError> {
        let task_id = task_id.into();
        let run_id = run_id.into();
        validate_identity("task id", &task_id)?;
        validate_identity("run id", &run_id)?;
        Ok(Self {
            task_id,
            run_id,
            next_sequence: last_sequence.saturating_add(1),
            seen_fingerprints: HashSet::new(),
            seen_order: VecDeque::new(),
            active_tools: BTreeMap::new(),
            approval_pending: 0,
            message_buffer: String::new(),
            unknown_diagnostics: VecDeque::new(),
        })
    }

    pub(crate) fn normalize(&mut self, raw: &HermesRawEvent) -> Result<Vec<WorkEvent>, WorkError> {
        if raw.run_id != self.run_id {
            let mut error = normalizer_error(
                WorkErrorKind::InvalidRequest,
                "hermes_cross_run_event",
                "Hermes event belongs to a different run and was rejected.",
                false,
            );
            error
                .details
                .insert("expectedRunId".into(), Value::String(self.run_id.clone()));
            error
                .details
                .insert("actualRunId".into(), Value::String(raw.run_id.clone()));
            return Err(error);
        }
        if !raw.timestamp.is_finite() || raw.timestamp < 0.0 {
            return Err(normalizer_error(
                WorkErrorKind::InvalidRequest,
                "invalid_hermes_event_timestamp",
                "Hermes event timestamp must be a finite non-negative number.",
                false,
            ));
        }

        let fingerprint = raw_fingerprint(raw)?;
        if !self.remember_fingerprint(fingerprint.clone()) {
            return Ok(Vec::new());
        }

        let mut output = Vec::new();
        match raw.event.as_str() {
            "message.delta" => {
                let Some(delta) = required_text(raw, "delta", MAX_DELTA_CHARS) else {
                    return Ok(self.malformed(raw, &fingerprint, "message.delta missing delta"));
                };
                append_bounded(&mut self.message_buffer, &delta, MAX_MESSAGE_CHARS);
                output.push(self.emit(
                    raw,
                    &fingerprint,
                    0,
                    Some(format!("message:{}", self.run_id)),
                    WorkEventKind::AgentTextDelta { delta },
                ));
            }
            "message.completed" => {
                let text = optional_text(raw, "text", MAX_MESSAGE_CHARS)
                    .filter(|value| !value.is_empty())
                    .unwrap_or_else(|| self.message_buffer.clone());
                self.message_buffer.clear();
                output.push(self.emit(
                    raw,
                    &fingerprint,
                    0,
                    Some(format!("message:{}", self.run_id)),
                    WorkEventKind::AgentMessageCompleted { text },
                ));
            }
            "user.message" => {
                let Some(text) = required_text(raw, "text", MAX_MESSAGE_CHARS) else {
                    return Ok(self.malformed(raw, &fingerprint, "user.message missing text"));
                };
                output.push(self.emit(
                    raw,
                    &fingerprint,
                    0,
                    None,
                    WorkEventKind::UserMessageAdded { text },
                ));
            }
            "reasoning.available" => {
                let Some(text) = required_text(raw, "text", MAX_REASONING_CHARS) else {
                    return Ok(self.malformed(
                        raw,
                        &fingerprint,
                        "reasoning.available missing text",
                    ));
                };
                output.push(self.emit(
                    raw,
                    &fingerprint,
                    0,
                    Some(format!("reasoning:{}", self.run_id)),
                    WorkEventKind::ReasoningUpdated { text },
                ));
            }
            "tool.started" => {
                let Some(tool) = required_identifier(raw, "tool") else {
                    return Ok(self.malformed(raw, &fingerprint, "tool.started missing tool"));
                };
                let preview = optional_text(raw, "preview", MAX_METADATA_CHARS);
                *self.active_tools.entry(tool.clone()).or_default() += 1;
                output.push(self.emit(
                    raw,
                    &fingerprint,
                    0,
                    Some(tool_item_id(&self.run_id, &tool)),
                    WorkEventKind::ToolStarted { tool, preview },
                ));
            }
            "tool.progress" => {
                let Some(tool) = required_identifier(raw, "tool") else {
                    return Ok(self.malformed(raw, &fingerprint, "tool.progress missing tool"));
                };
                let Some(text) = required_text(raw, "text", MAX_METADATA_CHARS) else {
                    return Ok(self.malformed(raw, &fingerprint, "tool.progress missing text"));
                };
                output.push(self.emit(
                    raw,
                    &fingerprint,
                    0,
                    Some(tool_item_id(&self.run_id, &tool)),
                    WorkEventKind::ToolProgress { tool, text },
                ));
            }
            "tool.completed" => {
                let Some(tool) = required_identifier(raw, "tool") else {
                    return Ok(self.malformed(raw, &fingerprint, "tool.completed missing tool"));
                };
                let duration = raw
                    .payload
                    .get("duration")
                    .and_then(Value::as_f64)
                    .filter(|value| value.is_finite() && *value >= 0.0);
                let error = raw.bool("error").unwrap_or(false);
                let was_active = self.active_tools.get_mut(&tool).is_some_and(|count| {
                    *count = count.saturating_sub(1);
                    true
                });
                if self.active_tools.get(&tool) == Some(&0) {
                    self.active_tools.remove(&tool);
                }
                let item_id = Some(tool_item_id(&self.run_id, &tool));
                if !was_active {
                    output.push(self.emit(
                        raw,
                        &fingerprint,
                        0,
                        item_id.clone(),
                        WorkEventKind::WarningRaised {
                            message:
                                "Hermes reported tool completion before its start event.".into(),
                        },
                    ));
                }
                output.push(self.emit(
                    raw,
                    &fingerprint,
                    usize::from(!was_active),
                    item_id,
                    WorkEventKind::ToolCompleted {
                        tool,
                        duration,
                        error,
                    },
                ));
            }
            "approval.request" => {
                self.approval_pending = self.approval_pending.saturating_add(1);
                let command = optional_text(raw, "command", MAX_METADATA_CHARS);
                let description = optional_text(raw, "description", MAX_METADATA_CHARS);
                let choices = string_array(raw.payload.get("choices"), 32, 80);
                output.push(self.emit(
                    raw,
                    &fingerprint,
                    0,
                    Some(format!("approval:{}", self.run_id)),
                    WorkEventKind::TaskStatusChanged {
                        status: WorkTaskStatus::WaitingForApproval,
                    },
                ));
                output.push(self.emit(
                    raw,
                    &fingerprint,
                    1,
                    Some(format!("approval:{}", self.run_id)),
                    WorkEventKind::ApprovalRequested {
                        command,
                        description,
                        choices,
                    },
                ));
            }
            "approval.responded" => {
                let Some(choice) = required_identifier(raw, "choice") else {
                    return Ok(self.malformed(
                        raw,
                        &fingerprint,
                        "approval.responded missing choice",
                    ));
                };
                let resolved = raw.u64("resolved").unwrap_or(0);
                if self.approval_pending == 0 {
                    output.push(self.emit(
                        raw,
                        &fingerprint,
                        0,
                        Some(format!("approval:{}", self.run_id)),
                        WorkEventKind::WarningRaised {
                            message: "Hermes reported an approval response without a pending request."
                                .into(),
                        },
                    ));
                }
                self.approval_pending = self.approval_pending.saturating_sub(resolved.max(1));
                output.push(self.emit(
                    raw,
                    &fingerprint,
                    usize::from(output.len() == 1),
                    Some(format!("approval:{}", self.run_id)),
                    WorkEventKind::ApprovalResolved { choice, resolved },
                ));
            }
            "user_input.request" | "clarification.request" => {
                let Some(prompt) = required_text(raw, "prompt", MAX_METADATA_CHARS) else {
                    return Ok(self.malformed(raw, &fingerprint, "user input missing prompt"));
                };
                let choices = string_array(raw.payload.get("choices"), 32, 200);
                output.push(self.emit(
                    raw,
                    &fingerprint,
                    0,
                    None,
                    WorkEventKind::UserInputRequested { prompt, choices },
                ));
            }
            "output.available" => {
                let Some(path) = required_path(raw, "path") else {
                    return Ok(self.malformed(raw, &fingerprint, "output.available missing path"));
                };
                let media_type = optional_text(raw, "media_type", 200);
                output.push(self.emit(
                    raw,
                    &fingerprint,
                    0,
                    None,
                    WorkEventKind::OutputAvailable { path, media_type },
                ));
            }
            "warning" | "run.warning" => {
                let Some(message) = required_text(raw, "message", MAX_METADATA_CHARS) else {
                    return Ok(self.malformed(raw, &fingerprint, "warning missing message"));
                };
                output.push(self.emit(
                    raw,
                    &fingerprint,
                    0,
                    None,
                    WorkEventKind::WarningRaised { message },
                ));
            }
            "run.completed" => {
                let text = optional_text(raw, "output", MAX_MESSAGE_CHARS)
                    .filter(|value| !value.is_empty())
                    .unwrap_or_else(|| self.message_buffer.clone());
                self.message_buffer.clear();
                output.push(self.emit(
                    raw,
                    &fingerprint,
                    0,
                    Some(format!("message:{}", self.run_id)),
                    WorkEventKind::AgentMessageCompleted { text },
                ));
                output.push(self.emit(
                    raw,
                    &fingerprint,
                    1,
                    None,
                    WorkEventKind::TaskStatusChanged {
                        status: WorkTaskStatus::Completed,
                    },
                ));
            }
            "run.failed" => {
                let message = optional_text(raw, "error", MAX_METADATA_CHARS)
                    .filter(|value| !value.is_empty())
                    .unwrap_or_else(|| "Hermes run failed.".into());
                output.push(self.emit(
                    raw,
                    &fingerprint,
                    0,
                    None,
                    WorkEventKind::TaskFailed {
                        error: WorkError {
                            kind: WorkErrorKind::Unknown,
                            code: "hermes_run_failed".into(),
                            message,
                            retryable: false,
                            http_status: None,
                            request_id: None,
                            details: BTreeMap::new(),
                        },
                    },
                ));
                output.push(self.emit(
                    raw,
                    &fingerprint,
                    1,
                    None,
                    WorkEventKind::TaskStatusChanged {
                        status: WorkTaskStatus::Failed,
                    },
                ));
            }
            "run.cancelled" => output.push(self.emit(
                raw,
                &fingerprint,
                0,
                None,
                WorkEventKind::TaskStatusChanged {
                    status: WorkTaskStatus::Cancelled,
                },
            )),
            _ => {
                self.record_diagnostic(raw, "unknown_event");
                output.push(self.emit(
                    raw,
                    &fingerprint,
                    0,
                    None,
                    WorkEventKind::Unknown {
                        raw_event_type:
                            safe_identifier(&raw.event, 120).unwrap_or_else(|| "unknown".into()),
                    },
                ));
            }
        }
        Ok(output)
    }

    pub(crate) fn recent_unknown_diagnostics(&self) -> Vec<HermesUnknownEventDiagnostic> {
        self.unknown_diagnostics.iter().cloned().collect()
    }

    pub(crate) fn last_sequence(&self) -> u64 {
        self.next_sequence.saturating_sub(1)
    }

    fn emit(
        &mut self,
        raw: &HermesRawEvent,
        fingerprint: &str,
        output_index: usize,
        item_id: Option<String>,
        kind: WorkEventKind,
    ) -> WorkEvent {
        let sequence = self.next_sequence;
        self.next_sequence = self.next_sequence.saturating_add(1);
        WorkEvent {
            schema_version: WORK_SCHEMA_VERSION,
            event_id: format!("{}:{}:{output_index}", self.run_id, fingerprint),
            sequence,
            task_id: self.task_id.clone(),
            run_id: self.run_id.clone(),
            timestamp: raw.timestamp,
            item_id,
            kind,
        }
    }

    fn remember_fingerprint(&mut self, fingerprint: String) -> bool {
        if !self.seen_fingerprints.insert(fingerprint.clone()) {
            return false;
        }
        self.seen_order.push_back(fingerprint);
        while self.seen_order.len() > MAX_SEEN_RAW_EVENTS {
            if let Some(expired) = self.seen_order.pop_front() {
                self.seen_fingerprints.remove(&expired);
            }
        }
        true
    }

    fn malformed(
        &mut self,
        raw: &HermesRawEvent,
        fingerprint: &str,
        reason: &str,
    ) -> Vec<WorkEvent> {
        self.record_diagnostic(raw, "malformed_known_event");
        vec![self.emit(
            raw,
            fingerprint,
            0,
            None,
            WorkEventKind::WarningRaised {
                message: format!("Ignored malformed Hermes event: {reason}."),
            },
        )]
    }

    fn record_diagnostic(&mut self, raw: &HermesRawEvent, reason: &str) {
        let payload_keys = raw
            .payload
            .keys()
            .map(|key| safe_identifier(key, 80).unwrap_or_else(|| "redacted-key".into()))
            .collect();
        self.unknown_diagnostics
            .push_back(HermesUnknownEventDiagnostic {
                event_type: safe_identifier(&raw.event, 120).unwrap_or_else(|| "unknown".into()),
                run_id: self.run_id.clone(),
                timestamp: (raw.timestamp * 1000.0).max(0.0) as u64,
                payload_keys,
                reason: reason.into(),
            });
        while self.unknown_diagnostics.len() > MAX_UNKNOWN_DIAGNOSTICS {
            self.unknown_diagnostics.pop_front();
        }
    }
}

fn raw_fingerprint(raw: &HermesRawEvent) -> Result<String, WorkError> {
    let bytes = serde_json::to_vec(raw).map_err(|error| {
        normalizer_error(
            WorkErrorKind::InvalidRequest,
            "serialize_hermes_raw_event",
            &format!("Unable to fingerprint Hermes event: {error}"),
            false,
        )
    })?;
    Ok(format!("{:032x}", stable_hash(&bytes)))
}

fn tool_item_id(run_id: &str, tool: &str) -> String {
    format!(
        "tool:{:032x}",
        stable_hash(format!("{run_id}:{tool}").as_bytes())
    )
}

fn stable_hash(bytes: &[u8]) -> u128 {
    bytes
        .iter()
        .fold(0x6c62272e07bb014262b821756295c58d_u128, |hash, byte| {
            (hash ^ u128::from(*byte)).wrapping_mul(0x0000000001000000000000000000013b_u128)
        })
}

fn required_text(raw: &HermesRawEvent, key: &str, max_chars: usize) -> Option<String> {
    optional_text(raw, key, max_chars).filter(|value| !value.trim().is_empty())
}

fn optional_text(raw: &HermesRawEvent, key: &str, max_chars: usize) -> Option<String> {
    raw.string(key).map(|value| bounded_text(value, max_chars))
}

fn required_identifier(raw: &HermesRawEvent, key: &str) -> Option<String> {
    raw.string(key)
        .and_then(|value| safe_identifier(value, 200))
}

fn required_path(raw: &HermesRawEvent, key: &str) -> Option<String> {
    let value = raw.string(key)?;
    let valid =
        !value.trim().is_empty() && value.len() <= 4096 && !value.chars().any(char::is_control);
    valid.then(|| value.to_string())
}

fn safe_identifier(value: &str, max_len: usize) -> Option<String> {
    let valid = !value.is_empty()
        && value.len() <= max_len
        && value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':' | b'/')
        });
    valid.then(|| value.to_string())
}

fn bounded_text(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

fn append_bounded(target: &mut String, value: &str, max_chars: usize) {
    let remaining = max_chars.saturating_sub(target.chars().count());
    target.extend(value.chars().take(remaining));
}

fn string_array(value: Option<&Value>, max_items: usize, max_chars: usize) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .take(max_items)
        .map(|value| bounded_text(value, max_chars))
        .collect()
}

fn validate_identity(label: &str, value: &str) -> Result<(), WorkError> {
    if value.trim().is_empty() || value.len() > 200 || value.chars().any(char::is_control) {
        return Err(normalizer_error(
            WorkErrorKind::InvalidRequest,
            "invalid_work_event_identity",
            &format!("WORK {label} is invalid."),
            false,
        ));
    }
    Ok(())
}

fn normalizer_error(kind: WorkErrorKind, code: &str, message: &str, retryable: bool) -> WorkError {
    WorkError {
        kind,
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
    use super::HermesEventNormalizer;
    use crate::shared::hermes_core::protocol::{
        parse_sse_transcript, HermesRawEvent, HermesSseFrame,
    };
    use crate::shared::hermes_core::types::{WorkEventKind, WorkTaskStatus};

    macro_rules! fixture {
        ($name:literal) => {
            include_str!(concat!("../../../test-fixtures/hermes/v2026.7.7.2/", $name))
        };
    }

    fn raw_events(name: &str) -> Vec<HermesRawEvent> {
        let input = match name {
            "normal" => fixture!("sse-normal.txt"),
            "disordered" => fixture!("sse-duplicates-unknown-out-of-order.txt"),
            "denied" => fixture!("sse-approval-denied.txt"),
            "failures" => fixture!("sse-failures.txt"),
            _ => panic!("unknown fixture"),
        };
        parse_sse_transcript(input)
            .unwrap()
            .into_iter()
            .filter_map(|frame| match frame {
                HermesSseFrame::Event(event) => Some(event),
                HermesSseFrame::Comment(_) => None,
            })
            .collect()
    }

    #[test]
    fn normalizes_full_known_lifecycle_with_monotonic_sequence() {
        let raw = raw_events("normal");
        let mut normalizer = HermesEventNormalizer::new("task-1", "run_demo_001", 0).unwrap();
        let events = raw
            .iter()
            .flat_map(|event| normalizer.normalize(event).unwrap())
            .collect::<Vec<_>>();
        assert_eq!(events.len(), 9);
        assert_eq!(normalizer.last_sequence(), 9);
        assert!(events
            .iter()
            .enumerate()
            .all(|(index, event)| event.sequence == index as u64 + 1));
        assert!(matches!(
            events.last().unwrap().kind,
            WorkEventKind::TaskStatusChanged {
                status: WorkTaskStatus::Completed
            }
        ));
        assert!(normalizer.recent_unknown_diagnostics().is_empty());
    }

    #[test]
    fn deduplicates_raw_events_and_preserves_unknown_and_out_of_order_signals() {
        let raw = raw_events("disordered");
        let mut normalizer =
            HermesEventNormalizer::new("task-2", "run_demo_disordered", 40).unwrap();
        let events = raw
            .iter()
            .flat_map(|event| normalizer.normalize(event).unwrap())
            .collect::<Vec<_>>();
        let delta_count = events
            .iter()
            .filter(|event| matches!(event.kind, WorkEventKind::AgentTextDelta { .. }))
            .count();
        assert_eq!(delta_count, 1);
        assert!(events
            .iter()
            .any(|event| matches!(event.kind, WorkEventKind::WarningRaised { .. })));
        assert!(events
            .iter()
            .any(|event| matches!(event.kind, WorkEventKind::Unknown { .. })));
        let diagnostics = normalizer.recent_unknown_diagnostics();
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].event_type, "future.progress");
        assert_eq!(diagnostics[0].payload_keys, vec!["percent", "phase"]);
        assert_eq!(normalizer.last_sequence(), 47);
    }

    #[test]
    fn produces_stable_event_ids_across_normalizer_restarts() {
        let raw = raw_events("normal").remove(0);
        let first = HermesEventNormalizer::new("task-1", "run_demo_001", 0)
            .unwrap()
            .normalize(&raw)
            .unwrap();
        let second = HermesEventNormalizer::new("task-1", "run_demo_001", 99)
            .unwrap()
            .normalize(&raw)
            .unwrap();
        assert_eq!(first[0].event_id, second[0].event_id);
        assert_ne!(first[0].sequence, second[0].sequence);
    }

    #[test]
    fn approval_without_request_warns_but_still_converges_to_cancelled() {
        let raw = raw_events("denied");
        let mut normalizer = HermesEventNormalizer::new("task-3", "run_demo_denied", 0).unwrap();
        let events = raw
            .iter()
            .flat_map(|event| normalizer.normalize(event).unwrap())
            .collect::<Vec<_>>();
        assert!(matches!(
            events[0].kind,
            WorkEventKind::WarningRaised { .. }
        ));
        assert!(events
            .iter()
            .any(|event| matches!(event.kind, WorkEventKind::ApprovalResolved { .. })));
        assert!(matches!(
            events.last().unwrap().kind,
            WorkEventKind::TaskStatusChanged {
                status: WorkTaskStatus::Cancelled
            }
        ));
    }

    #[test]
    fn rejects_cross_run_events_without_advancing_sequence() {
        let raw: HermesRawEvent =
            serde_json::from_str(fixture!("event-message-delta.json")).unwrap();
        let mut normalizer = HermesEventNormalizer::new("task-4", "other-run", 7).unwrap();
        let error = normalizer.normalize(&raw).unwrap_err();
        assert_eq!(error.code, "hermes_cross_run_event");
        assert_eq!(normalizer.last_sequence(), 7);
    }

    #[test]
    fn tracks_concurrent_same_tool_and_batched_approvals_without_false_warnings() {
        let values = [
            serde_json::json!({"event":"tool.started","run_id":"run-batch","timestamp":1.0,"tool":"read_file"}),
            serde_json::json!({"event":"tool.started","run_id":"run-batch","timestamp":2.0,"tool":"read_file"}),
            serde_json::json!({"event":"tool.completed","run_id":"run-batch","timestamp":3.0,"tool":"read_file","error":false}),
            serde_json::json!({"event":"tool.completed","run_id":"run-batch","timestamp":4.0,"tool":"read_file","error":false}),
            serde_json::json!({"event":"approval.request","run_id":"run-batch","timestamp":5.0,"choices":["once","deny"]}),
            serde_json::json!({"event":"approval.request","run_id":"run-batch","timestamp":6.0,"choices":["once","deny"]}),
            serde_json::json!({"event":"approval.responded","run_id":"run-batch","timestamp":7.0,"choice":"once","resolved":2}),
        ];
        let raw = values
            .into_iter()
            .map(|value| serde_json::from_value::<HermesRawEvent>(value).unwrap())
            .collect::<Vec<_>>();
        let mut normalizer = HermesEventNormalizer::new("task-batch", "run-batch", 0).unwrap();
        let events = raw
            .iter()
            .flat_map(|event| normalizer.normalize(event).unwrap())
            .collect::<Vec<_>>();
        assert!(!events
            .iter()
            .any(|event| matches!(event.kind, WorkEventKind::WarningRaised { .. })));
        assert_eq!(
            events
                .iter()
                .filter(|event| matches!(event.kind, WorkEventKind::ToolCompleted { .. }))
                .count(),
            2
        );
    }

    #[test]
    fn maps_tool_and_terminal_failures_without_guessing_the_failure_source() {
        let raw = raw_events("failures");
        let mut normalizer =
            HermesEventNormalizer::new("task-failed", "run_demo_failed", 0).unwrap();
        let events = raw
            .iter()
            .flat_map(|event| normalizer.normalize(event).unwrap())
            .collect::<Vec<_>>();
        assert!(events
            .iter()
            .any(|event| matches!(event.kind, WorkEventKind::ToolCompleted { error: true, .. })));
        let failure = events
            .iter()
            .find_map(|event| match &event.kind {
                WorkEventKind::TaskFailed { error } => Some(error),
                _ => None,
            })
            .unwrap();
        assert_eq!(
            failure.kind,
            crate::shared::hermes_core::types::WorkErrorKind::Unknown
        );
        assert_eq!(failure.code, "hermes_run_failed");
        assert!(matches!(
            events.last().unwrap().kind,
            WorkEventKind::TaskStatusChanged {
                status: WorkTaskStatus::Failed
            }
        ));
    }

    #[test]
    fn maps_user_input_output_and_warning_extensions_with_path_validation() {
        let values = [
            serde_json::json!({"event":"user_input.request","run_id":"run-extra","timestamp":1.0,"prompt":"选择模板","choices":["A","B"]}),
            serde_json::json!({"event":"output.available","run_id":"run-extra","timestamp":2.0,"path":"C:\\Users\\demo\\report.docx","media_type":"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}),
            serde_json::json!({"event":"run.warning","run_id":"run-extra","timestamp":3.0,"message":"网络恢复后继续"}),
            serde_json::json!({"event":"output.available","run_id":"run-extra","timestamp":4.0,"path":"bad\npath"}),
        ];
        let mut normalizer = HermesEventNormalizer::new("task-extra", "run-extra", 0).unwrap();
        let events = values
            .into_iter()
            .map(|value| serde_json::from_value::<HermesRawEvent>(value).unwrap())
            .flat_map(|event| normalizer.normalize(&event).unwrap())
            .collect::<Vec<_>>();
        assert!(events
            .iter()
            .any(|event| matches!(event.kind, WorkEventKind::UserInputRequested { .. })));
        assert!(events
            .iter()
            .any(|event| matches!(event.kind, WorkEventKind::OutputAvailable { .. })));
        assert_eq!(
            events
                .iter()
                .filter(|event| matches!(event.kind, WorkEventKind::WarningRaised { .. }))
                .count(),
            2
        );
        assert_eq!(normalizer.recent_unknown_diagnostics().len(), 1);
    }
}
