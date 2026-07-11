use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct HermesHealth {
    pub(crate) status: String,
    pub(crate) platform: String,
    pub(crate) version: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct HermesCapabilities {
    pub(crate) object: String,
    pub(crate) platform: String,
    pub(crate) model: String,
    pub(crate) auth: HermesAuthCapabilities,
    pub(crate) runtime: HermesRuntimeCapabilities,
    pub(crate) features: BTreeMap<String, Value>,
    pub(crate) endpoints: BTreeMap<String, HermesEndpointCapability>,
    #[serde(flatten)]
    pub(crate) extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct HermesAuthCapabilities {
    #[serde(rename = "type")]
    pub(crate) kind: String,
    pub(crate) required: bool,
    #[serde(flatten)]
    pub(crate) extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct HermesRuntimeCapabilities {
    pub(crate) mode: String,
    pub(crate) tool_execution: String,
    pub(crate) split_runtime: bool,
    pub(crate) description: Option<String>,
    #[serde(flatten)]
    pub(crate) extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct HermesEndpointCapability {
    pub(crate) method: String,
    pub(crate) path: String,
    #[serde(flatten)]
    pub(crate) extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct HermesModelList {
    pub(crate) object: String,
    pub(crate) data: Vec<HermesModel>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct HermesModel {
    pub(crate) id: String,
    pub(crate) object: String,
    pub(crate) created: i64,
    pub(crate) owned_by: String,
    pub(crate) permission: Vec<Value>,
    pub(crate) root: String,
    pub(crate) parent: Option<String>,
    #[serde(flatten)]
    pub(crate) extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct HermesRunStarted {
    pub(crate) run_id: String,
    pub(crate) status: String,
    #[serde(flatten)]
    pub(crate) extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct HermesRunStatus {
    pub(crate) object: String,
    pub(crate) run_id: String,
    /// 保留字符串而不是封闭 enum，避免上游新增状态导致整个恢复路径失败。
    pub(crate) status: String,
    pub(crate) created_at: f64,
    pub(crate) updated_at: f64,
    pub(crate) session_id: Option<String>,
    pub(crate) model: Option<String>,
    pub(crate) last_event: Option<String>,
    pub(crate) output: Option<String>,
    pub(crate) usage: Option<HermesUsage>,
    pub(crate) error: Option<String>,
    #[serde(flatten)]
    pub(crate) extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct HermesUsage {
    pub(crate) input_tokens: u64,
    pub(crate) output_tokens: u64,
    pub(crate) total_tokens: u64,
    #[serde(flatten)]
    pub(crate) extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct HermesRawEvent {
    pub(crate) event: String,
    pub(crate) run_id: String,
    pub(crate) timestamp: f64,
    /// 上游事件字段会漂移；raw 层完整保留，normalizer 再挑选产品字段。
    #[serde(flatten)]
    pub(crate) payload: BTreeMap<String, Value>,
}

impl HermesRawEvent {
    pub(crate) fn string(&self, key: &str) -> Option<&str> {
        self.payload.get(key).and_then(Value::as_str)
    }

    pub(crate) fn bool(&self, key: &str) -> Option<bool> {
        self.payload.get(key).and_then(Value::as_bool)
    }

    pub(crate) fn u64(&self, key: &str) -> Option<u64> {
        self.payload.get(key).and_then(Value::as_u64)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum HermesSseFrame {
    Event(HermesRawEvent),
    Comment(String),
}

const MAX_SSE_BUFFER_BYTES: usize = 1024 * 1024;

#[derive(Debug, Default)]
pub(crate) struct HermesSseDecoder {
    buffer: Vec<u8>,
}

impl HermesSseDecoder {
    pub(crate) fn push(&mut self, chunk: &[u8]) -> Result<Vec<HermesSseFrame>, String> {
        self.buffer.extend_from_slice(chunk);

        let mut frames = Vec::new();
        while let Some((frame_end, separator_len)) = find_sse_separator(&self.buffer) {
            let block = self.buffer[..frame_end].to_vec();
            self.buffer.drain(..frame_end + separator_len);
            let text = std::str::from_utf8(&block)
                .map_err(|error| format!("Hermes SSE frame is not UTF-8: {error}"))?;
            frames.extend(parse_sse_transcript(text)?);
        }
        if self.buffer.len() > MAX_SSE_BUFFER_BYTES {
            return Err("Hermes SSE frame buffer exceeded 1 MiB.".into());
        }
        Ok(frames)
    }

    pub(crate) fn finish(self) -> Result<Vec<HermesSseFrame>, String> {
        if self.buffer.iter().all(u8::is_ascii_whitespace) {
            return Ok(Vec::new());
        }
        let text = std::str::from_utf8(&self.buffer)
            .map_err(|_| "Hermes SSE stream ended with a truncated UTF-8 frame.".to_string())?;
        parse_sse_transcript(text)
            .map_err(|_| "Hermes SSE stream ended with a truncated frame.".to_string())
    }
}

fn find_sse_separator(bytes: &[u8]) -> Option<(usize, usize)> {
    let lf = bytes.windows(2).position(|window| window == b"\n\n");
    let crlf = bytes.windows(4).position(|window| window == b"\r\n\r\n");
    match (lf, crlf) {
        (Some(left), Some(right)) if left <= right => Some((left, 2)),
        (Some(_), Some(right)) => Some((right, 4)),
        (Some(left), None) => Some((left, 2)),
        (None, Some(right)) => Some((right, 4)),
        (None, None) => None,
    }
}

/// 解析锁定 Hermes 的 SSE framing，同时兼容 CRLF 和多行 data。
///
/// 该函数只解析已收到的完整 transcript；流式增量 decoder 在 API client 阶段实现。
pub(crate) fn parse_sse_transcript(input: &str) -> Result<Vec<HermesSseFrame>, String> {
    let normalized = input.replace("\r\n", "\n");
    let mut frames = Vec::new();
    for block in normalized.split("\n\n") {
        let block = block.trim_end_matches('\n');
        if block.trim().is_empty() {
            continue;
        }
        let mut comments = Vec::new();
        let mut data = Vec::new();
        for line in block.lines() {
            if let Some(comment) = line.strip_prefix(':') {
                comments.push(comment.trim_start().to_string());
            } else if let Some(value) = line.strip_prefix("data:") {
                data.push(value.trim_start());
            }
        }
        if !data.is_empty() {
            let payload = data.join("\n");
            let event = serde_json::from_str::<HermesRawEvent>(&payload)
                .map_err(|error| format!("Invalid Hermes SSE data frame: {error}"))?;
            frames.push(HermesSseFrame::Event(event));
        } else {
            frames.extend(comments.into_iter().map(HermesSseFrame::Comment));
        }
    }
    Ok(frames)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct HermesApprovalRequest {
    pub(crate) choice: String,
    #[serde(default)]
    pub(crate) resolve_all: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct HermesApprovalResponse {
    pub(crate) object: String,
    pub(crate) run_id: String,
    pub(crate) choice: String,
    pub(crate) resolved: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct HermesStopResponse {
    pub(crate) run_id: String,
    pub(crate) status: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct HermesErrorEnvelope {
    pub(crate) error: HermesApiError,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct HermesApiError {
    pub(crate) message: String,
    #[serde(rename = "type")]
    pub(crate) kind: Option<String>,
    pub(crate) param: Option<Value>,
    pub(crate) code: Option<String>,
    #[serde(flatten)]
    pub(crate) extra: BTreeMap<String, Value>,
}

#[cfg(test)]
mod tests {
    use super::{
        parse_sse_transcript, HermesApprovalRequest, HermesApprovalResponse, HermesCapabilities,
        HermesErrorEnvelope, HermesHealth, HermesModelList, HermesRawEvent, HermesRunStarted,
        HermesRunStatus, HermesSseDecoder, HermesSseFrame, HermesStopResponse,
    };

    const FIXTURE_ROOT: &str = "../../../test-fixtures/hermes/v2026.7.7.2";

    macro_rules! fixture {
        ($name:literal) => {
            include_str!(concat!("../../../test-fixtures/hermes/v2026.7.7.2/", $name))
        };
    }

    #[test]
    fn parses_top_level_contract_fixtures() {
        let health: HermesHealth = serde_json::from_str(fixture!("health.json")).unwrap();
        assert_eq!(health.platform, "hermes-agent");

        let capabilities: HermesCapabilities =
            serde_json::from_str(fixture!("capabilities.json")).unwrap();
        assert_eq!(capabilities.auth.kind, "bearer");
        assert_eq!(
            capabilities.endpoints["run_events"].path,
            "/v1/runs/{run_id}/events"
        );

        let models: HermesModelList = serde_json::from_str(fixture!("models.json")).unwrap();
        assert_eq!(models.data.len(), 2);

        let started: HermesRunStarted = serde_json::from_str(fixture!("run-started.json")).unwrap();
        assert_eq!(started.status, "started");

        for raw in [
            fixture!("run-status-running.json"),
            fixture!("run-status-completed.json"),
            fixture!("run-status-failed.json"),
        ] {
            let status: HermesRunStatus = serde_json::from_str(raw).unwrap();
            assert_eq!(status.object, "hermes.run");
        }
    }

    #[test]
    fn preserves_known_and_unknown_event_payloads() {
        let message: HermesRawEvent =
            serde_json::from_str(fixture!("event-message-delta.json")).unwrap();
        assert_eq!(message.event, "message.delta");
        assert_eq!(message.string("delta"), Some("正在读取季度报告。"));

        let completed: HermesRawEvent =
            serde_json::from_str(fixture!("event-tool-completed.json")).unwrap();
        assert_eq!(completed.bool("error"), Some(false));

        let unknown: HermesRawEvent = serde_json::from_str(fixture!("event-unknown.json")).unwrap();
        assert_eq!(unknown.event, "future.progress");
        assert_eq!(unknown.u64("percent"), Some(42));
        assert_eq!(serde_json::to_value(&unknown).unwrap()["phase"], "planning");
    }

    #[test]
    fn parses_sse_comments_events_and_terminal_close() {
        let frames = parse_sse_transcript(fixture!("sse-normal.txt")).unwrap();
        assert_eq!(frames.len(), 9);
        assert_eq!(
            frames.first(),
            Some(&HermesSseFrame::Comment("keepalive".into()))
        );
        assert!(matches!(
            frames.get(1),
            Some(HermesSseFrame::Event(event)) if event.event == "message.delta"
        ));
        assert_eq!(
            frames.last(),
            Some(&HermesSseFrame::Comment("stream closed".into()))
        );
    }

    #[test]
    fn incremental_decoder_handles_split_utf8_and_rejects_truncation() {
        let payload = fixture!("sse-normal.txt").as_bytes();
        let mut decoder = HermesSseDecoder::default();
        let mut frames = Vec::new();
        for chunk in payload.chunks(7) {
            frames.extend(decoder.push(chunk).unwrap());
        }
        frames.extend(decoder.finish().unwrap());
        assert_eq!(frames.len(), 9);

        let mut decoder = HermesSseDecoder::default();
        decoder.push(&payload[..80]).unwrap();
        assert!(decoder.finish().is_err());
    }

    #[test]
    fn parses_action_and_error_fixtures() {
        let approval: HermesApprovalRequest =
            serde_json::from_str(fixture!("approval-request.json")).unwrap();
        assert_eq!(approval.choice, "once");
        assert!(!approval.resolve_all);
        let _: HermesApprovalResponse =
            serde_json::from_str(fixture!("approval-response.json")).unwrap();
        let _: HermesStopResponse = serde_json::from_str(fixture!("stop-response.json")).unwrap();
        let error: HermesErrorEnvelope =
            serde_json::from_str(fixture!("error-openai.json")).unwrap();
        assert_eq!(error.error.code.as_deref(), Some("run_not_found"));
    }

    #[test]
    fn fixture_root_constant_documents_relative_layout() {
        assert!(FIXTURE_ROOT.ends_with("v2026.7.7.2"));
    }
}
