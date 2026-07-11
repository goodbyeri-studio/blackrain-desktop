use std::collections::{BTreeMap, VecDeque};
use std::pin::Pin;
use std::time::Duration;

use futures_util::{stream, Stream, StreamExt};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE, USER_AGENT};
use reqwest::{Method, Response, StatusCode, Url};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::protocol::{
    HermesApprovalRequest, HermesApprovalResponse, HermesCapabilities, HermesErrorEnvelope,
    HermesHealth, HermesModelList, HermesRunStarted, HermesRunStatus, HermesSseDecoder,
    HermesSseFrame, HermesStopResponse,
};
use super::types::{WorkError, WorkErrorKind};

const DEFAULT_REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
const DEFAULT_CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const MAX_ERROR_BODY_BYTES: usize = 64 * 1024;
const MAX_JSON_BODY_BYTES: usize = 4 * 1024 * 1024;
const USER_AGENT_VALUE: &str = concat!("BlackRain/", env!("CARGO_PKG_VERSION"), " Hermes-WORK/1");

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct HermesConversationMessage {
    pub(crate) role: String,
    pub(crate) content: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct HermesRunCreateRequest {
    pub(crate) input: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) instructions: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) model: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(crate) conversation_history: Vec<HermesConversationMessage>,
}

impl HermesRunCreateRequest {
    pub(crate) fn validate(&self) -> Result<(), WorkError> {
        match &self.input {
            Value::String(value) if !value.trim().is_empty() => {}
            Value::Array(values) if !values.is_empty() => {}
            _ => {
                return Err(client_error(
                    WorkErrorKind::InvalidRequest,
                    "invalid_run_input",
                    "Hermes run input must be a non-empty string or message array.",
                    false,
                ));
            }
        }
        validate_optional_id("session id", self.session_id.as_deref())?;
        if self
            .model
            .as_deref()
            .is_some_and(|value| value.trim().is_empty())
        {
            return Err(client_error(
                WorkErrorKind::InvalidRequest,
                "invalid_model",
                "Hermes model must not be empty when provided.",
                false,
            ));
        }
        for message in &self.conversation_history {
            if message.role.trim().is_empty() || message.content.is_null() {
                return Err(client_error(
                    WorkErrorKind::InvalidRequest,
                    "invalid_conversation_history",
                    "Hermes conversation history requires non-empty roles and content.",
                    false,
                ));
            }
        }
        Ok(())
    }
}

#[derive(Clone)]
pub(crate) struct HermesApiClient {
    base_url: Url,
    bearer: HeaderValue,
    request_client: reqwest::Client,
    stream_client: reqwest::Client,
}

impl HermesApiClient {
    pub(crate) fn new(base_url: &str, bearer: &str) -> Result<Self, WorkError> {
        Self::with_timeouts(
            base_url,
            bearer,
            DEFAULT_REQUEST_TIMEOUT,
            DEFAULT_CONNECT_TIMEOUT,
        )
    }

    pub(crate) fn with_timeouts(
        base_url: &str,
        bearer: &str,
        request_timeout: Duration,
        connect_timeout: Duration,
    ) -> Result<Self, WorkError> {
        let base_url = validate_loopback_base_url(base_url)?;
        let bearer = validate_bearer(bearer)?;
        let request_client = reqwest::Client::builder()
            .timeout(request_timeout)
            .connect_timeout(connect_timeout)
            .build()
            .map_err(|error| request_build_error(error.to_string()))?;
        let stream_client = reqwest::Client::builder()
            .connect_timeout(connect_timeout)
            .build()
            .map_err(|error| request_build_error(error.to_string()))?;
        Ok(Self {
            base_url,
            bearer,
            request_client,
            stream_client,
        })
    }

    pub(crate) fn base_url(&self) -> &str {
        self.base_url.as_str().trim_end_matches('/')
    }

    pub(crate) async fn health(&self) -> Result<HermesHealth, WorkError> {
        self.send_json(Method::GET, "/health", None).await
    }

    pub(crate) async fn capabilities(&self) -> Result<HermesCapabilities, WorkError> {
        self.send_json(Method::GET, "/v1/capabilities", None).await
    }

    pub(crate) async fn models(&self) -> Result<HermesModelList, WorkError> {
        self.send_json(Method::GET, "/v1/models", None).await
    }

    pub(crate) async fn create_run(
        &self,
        request: &HermesRunCreateRequest,
    ) -> Result<HermesRunStarted, WorkError> {
        request.validate()?;
        let body = serde_json::to_value(request).map_err(|error| {
            client_error(
                WorkErrorKind::InvalidRequest,
                "serialize_run_request",
                &format!("Unable to serialize Hermes run request: {error}"),
                false,
            )
        })?;
        self.send_json(Method::POST, "/v1/runs", Some(body)).await
    }

    pub(crate) async fn run_status(&self, run_id: &str) -> Result<HermesRunStatus, WorkError> {
        validate_path_id("run id", run_id)?;
        self.send_json(Method::GET, &format!("/v1/runs/{run_id}"), None)
            .await
    }

    pub(crate) async fn resolve_approval(
        &self,
        run_id: &str,
        request: &HermesApprovalRequest,
    ) -> Result<HermesApprovalResponse, WorkError> {
        validate_path_id("run id", run_id)?;
        if !matches!(
            request.choice.as_str(),
            "once" | "session" | "always" | "deny"
        ) {
            return Err(client_error(
                WorkErrorKind::InvalidRequest,
                "invalid_approval_choice",
                "Hermes approval choice must be once, session, always, or deny.",
                false,
            ));
        }
        let body = serde_json::to_value(request).map_err(|error| {
            client_error(
                WorkErrorKind::InvalidRequest,
                "serialize_approval_request",
                &format!("Unable to serialize Hermes approval request: {error}"),
                false,
            )
        })?;
        self.send_json(
            Method::POST,
            &format!("/v1/runs/{run_id}/approval"),
            Some(body),
        )
        .await
    }

    pub(crate) async fn stop_run(&self, run_id: &str) -> Result<HermesStopResponse, WorkError> {
        validate_path_id("run id", run_id)?;
        self.send_json(Method::POST, &format!("/v1/runs/{run_id}/stop"), None)
            .await
    }

    pub(crate) async fn list_sessions(&self) -> Result<Value, WorkError> {
        self.send_json(Method::GET, "/api/sessions", None).await
    }

    pub(crate) async fn create_session(&self, body: Value) -> Result<Value, WorkError> {
        if !body.is_object() {
            return Err(client_error(
                WorkErrorKind::InvalidRequest,
                "invalid_session_request",
                "Hermes session request must be a JSON object.",
                false,
            ));
        }
        self.send_json(Method::POST, "/api/sessions", Some(body))
            .await
    }

    pub(crate) async fn get_session(&self, session_id: &str) -> Result<Value, WorkError> {
        validate_path_id("session id", session_id)?;
        self.send_json(Method::GET, &format!("/api/sessions/{session_id}"), None)
            .await
    }

    pub(crate) async fn session_messages(&self, session_id: &str) -> Result<Value, WorkError> {
        validate_path_id("session id", session_id)?;
        self.send_json(
            Method::GET,
            &format!("/api/sessions/{session_id}/messages"),
            None,
        )
        .await
    }

    pub(crate) async fn stream_run_events(
        &self,
        run_id: &str,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<HermesSseFrame, WorkError>> + Send>>, WorkError>
    {
        validate_path_id("run id", run_id)?;
        let request_id = request_id();
        let response = self
            .authorized_request(
                &self.stream_client,
                Method::GET,
                &format!("/v1/runs/{run_id}/events"),
                &request_id,
            )?
            .send()
            .await
            .map_err(|error| map_transport_error(error, Some(request_id.clone())))?;
        let response = ensure_success(response, request_id).await?;
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();
        if !content_type
            .to_ascii_lowercase()
            .starts_with("text/event-stream")
        {
            return Err(client_error(
                WorkErrorKind::InvalidRequest,
                "invalid_sse_content_type",
                "Hermes run events endpoint did not return text/event-stream.",
                false,
            ));
        }

        struct State<S> {
            stream: S,
            decoder: Option<HermesSseDecoder>,
            pending: VecDeque<Result<HermesSseFrame, WorkError>>,
            finished: bool,
        }

        let state = State {
            stream: Box::pin(response.bytes_stream()),
            decoder: Some(HermesSseDecoder::default()),
            pending: VecDeque::new(),
            finished: false,
        };
        let output = stream::unfold(state, |mut state| async move {
            loop {
                if let Some(item) = state.pending.pop_front() {
                    return Some((item, state));
                }
                if state.finished {
                    return None;
                }
                match state.stream.next().await {
                    Some(Ok(chunk)) => {
                        let result = state
                            .decoder
                            .as_mut()
                            .expect("decoder exists until stream completion")
                            .push(&chunk);
                        match result {
                            Ok(frames) => state.pending.extend(frames.into_iter().map(Ok)),
                            Err(message) => {
                                state.finished = true;
                                state.pending.push_back(Err(client_error(
                                    WorkErrorKind::Connection,
                                    "invalid_sse_frame",
                                    &message,
                                    true,
                                )));
                            }
                        }
                    }
                    Some(Err(error)) => {
                        state.finished = true;
                        state
                            .pending
                            .push_back(Err(map_transport_error(error, None)));
                    }
                    None => {
                        state.finished = true;
                        let decoder = state.decoder.take().expect("decoder is consumed once");
                        match decoder.finish() {
                            Ok(frames) => state.pending.extend(frames.into_iter().map(Ok)),
                            Err(message) => state.pending.push_back(Err(client_error(
                                WorkErrorKind::Connection,
                                "truncated_sse_stream",
                                &message,
                                true,
                            ))),
                        }
                    }
                }
            }
        });
        Ok(Box::pin(output))
    }

    pub(crate) fn validate_required_capabilities(
        capabilities: &HermesCapabilities,
    ) -> Result<(), WorkError> {
        if !capabilities.auth.required || capabilities.auth.kind != "bearer" {
            return Err(client_error(
                WorkErrorKind::Authentication,
                "hermes_bearer_not_required",
                "Hermes must advertise required bearer authentication.",
                false,
            ));
        }
        let required = [
            ("runs", "POST", "/v1/runs"),
            ("run_status", "GET", "/v1/runs/{run_id}"),
            ("run_events", "GET", "/v1/runs/{run_id}/events"),
            ("run_approval", "POST", "/v1/runs/{run_id}/approval"),
            ("run_stop", "POST", "/v1/runs/{run_id}/stop"),
        ];
        let missing = required
            .iter()
            .filter_map(
                |(key, method, path)| match capabilities.endpoints.get(*key) {
                    Some(endpoint)
                        if endpoint.method.eq_ignore_ascii_case(method)
                            && endpoint.path == *path =>
                    {
                        None
                    }
                    _ => Some((*key).to_string()),
                },
            )
            .collect::<Vec<_>>();
        if missing.is_empty() {
            Ok(())
        } else {
            let mut details = BTreeMap::new();
            details.insert("missingEndpoints".into(), serde_json::json!(missing));
            Err(WorkError {
                kind: WorkErrorKind::CapabilityMissing,
                code: "required_hermes_capabilities_missing".into(),
                message: "Hermes is missing required WORK run capabilities.".into(),
                retryable: false,
                http_status: None,
                request_id: None,
                details,
            })
        }
    }

    async fn send_json<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        body: Option<Value>,
    ) -> Result<T, WorkError> {
        let request_id = request_id();
        let mut request =
            self.authorized_request(&self.request_client, method, path, &request_id)?;
        if let Some(body) = body {
            request = request.json(&body);
        }
        let response = request
            .send()
            .await
            .map_err(|error| map_transport_error(error, Some(request_id.clone())))?;
        let response = ensure_success(response, request_id.clone()).await?;
        let (body, truncated) =
            read_limited_body(response, MAX_JSON_BODY_BYTES, &request_id).await?;
        if truncated {
            return Err(WorkError {
                kind: WorkErrorKind::InvalidRequest,
                code: "hermes_json_body_too_large".into(),
                message: "Hermes JSON response exceeded 4 MiB.".into(),
                retryable: false,
                http_status: None,
                request_id: Some(request_id),
                details: BTreeMap::new(),
            });
        }
        serde_json::from_slice::<T>(&body).map_err(|error| WorkError {
            kind: WorkErrorKind::InvalidRequest,
            code: "invalid_hermes_json".into(),
            message: format!("Hermes returned invalid JSON: {error}"),
            retryable: false,
            http_status: None,
            request_id: Some(request_id),
            details: BTreeMap::new(),
        })
    }

    fn authorized_request(
        &self,
        client: &reqwest::Client,
        method: Method,
        path: &str,
        request_id: &str,
    ) -> Result<reqwest::RequestBuilder, WorkError> {
        if !path.starts_with('/') || path.starts_with("//") {
            return Err(client_error(
                WorkErrorKind::InvalidRequest,
                "invalid_hermes_path",
                "Hermes request path must be an absolute local path.",
                false,
            ));
        }
        let url = self
            .base_url
            .join(path.trim_start_matches('/'))
            .map_err(|error| {
                client_error(
                    WorkErrorKind::InvalidRequest,
                    "invalid_hermes_url",
                    &format!("Unable to build Hermes URL: {error}"),
                    false,
                )
            })?;
        let mut headers = HeaderMap::new();
        let bearer = self.bearer.to_str().map_err(|_| {
            client_error(
                WorkErrorKind::Authentication,
                "invalid_hermes_bearer",
                "Hermes bearer cannot be encoded as an HTTP header.",
                false,
            )
        })?;
        let mut authorization =
            HeaderValue::from_str(&format!("Bearer {bearer}")).map_err(|_| {
                client_error(
                    WorkErrorKind::Authentication,
                    "invalid_hermes_bearer",
                    "Hermes bearer cannot be encoded as an HTTP header.",
                    false,
                )
            })?;
        authorization.set_sensitive(true);
        headers.insert(AUTHORIZATION, authorization);
        headers.insert(USER_AGENT, HeaderValue::from_static(USER_AGENT_VALUE));
        headers.insert(
            "x-request-id",
            HeaderValue::from_str(request_id).expect("UUID request id is a valid header"),
        );
        Ok(client.request(method, url).headers(headers))
    }
}

fn validate_loopback_base_url(value: &str) -> Result<Url, WorkError> {
    let mut url = Url::parse(value.trim()).map_err(|_| {
        client_error(
            WorkErrorKind::InvalidRequest,
            "invalid_hermes_base_url",
            "Hermes base URL must be a valid loopback HTTP URL.",
            false,
        )
    })?;
    let valid = url.scheme() == "http"
        && url.host_str() == Some("127.0.0.1")
        && url.port().is_some()
        && (url.path().is_empty() || url.path() == "/")
        && url.query().is_none()
        && url.fragment().is_none()
        && url.username().is_empty()
        && url.password().is_none();
    if !valid {
        return Err(client_error(
            WorkErrorKind::InvalidRequest,
            "non_loopback_hermes_base_url",
            "Hermes client only accepts http://127.0.0.1:<managed-port>.",
            false,
        ));
    }
    url.set_path("/");
    Ok(url)
}

fn validate_bearer(value: &str) -> Result<HeaderValue, WorkError> {
    if value.len() < 32 || value.chars().any(char::is_control) || value.trim() != value {
        return Err(client_error(
            WorkErrorKind::Authentication,
            "invalid_hermes_bearer",
            "Hermes bearer must be a non-empty high-entropy header value.",
            false,
        ));
    }
    let mut header = HeaderValue::from_str(value).map_err(|_| {
        client_error(
            WorkErrorKind::Authentication,
            "invalid_hermes_bearer",
            "Hermes bearer cannot be encoded as an HTTP header.",
            false,
        )
    })?;
    header.set_sensitive(true);
    Ok(header)
}

fn validate_optional_id(label: &str, value: Option<&str>) -> Result<(), WorkError> {
    if let Some(value) = value {
        validate_path_id(label, value)?;
    }
    Ok(())
}

fn validate_path_id(label: &str, value: &str) -> Result<(), WorkError> {
    let valid = !value.is_empty()
        && value.len() <= 200
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'));
    if valid {
        Ok(())
    } else {
        Err(client_error(
            WorkErrorKind::InvalidRequest,
            "invalid_hermes_resource_id",
            &format!("Hermes {label} contains unsupported characters."),
            false,
        ))
    }
}

async fn ensure_success(response: Response, request_id: String) -> Result<Response, WorkError> {
    if response.status().is_success() {
        return Ok(response);
    }
    let status = response.status();
    let response_request_id = response
        .headers()
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .map(ToString::to_string)
        .unwrap_or(request_id);
    let (body, _) = read_limited_body(response, MAX_ERROR_BODY_BYTES, &response_request_id).await?;
    let envelope = serde_json::from_slice::<HermesErrorEnvelope>(&body).ok();
    let upstream_code = envelope
        .as_ref()
        .and_then(|value| value.error.code.clone())
        .unwrap_or_else(|| format!("hermes_http_{}", status.as_u16()));
    let message = envelope
        .as_ref()
        .map(|value| value.error.message.clone())
        .unwrap_or_else(|| format!("Hermes returned HTTP {}.", status.as_u16()));
    let kind = match status {
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => WorkErrorKind::Authentication,
        StatusCode::BAD_REQUEST | StatusCode::NOT_FOUND | StatusCode::CONFLICT => {
            WorkErrorKind::InvalidRequest
        }
        StatusCode::REQUEST_TIMEOUT | StatusCode::GATEWAY_TIMEOUT => WorkErrorKind::Timeout,
        status if status.is_server_error() => WorkErrorKind::Connection,
        _ => WorkErrorKind::Unknown,
    };
    Err(WorkError {
        kind,
        code: upstream_code,
        message,
        retryable: status.is_server_error()
            || matches!(
                status,
                StatusCode::REQUEST_TIMEOUT | StatusCode::GATEWAY_TIMEOUT
            ),
        http_status: Some(status.as_u16()),
        request_id: Some(response_request_id),
        details: BTreeMap::new(),
    })
}

async fn read_limited_body(
    response: Response,
    limit: usize,
    request_id: &str,
) -> Result<(Vec<u8>, bool), WorkError> {
    let mut stream = response.bytes_stream();
    let mut body = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| map_transport_error(error, Some(request_id.into())))?;
        let remaining = limit.saturating_sub(body.len());
        if chunk.len() > remaining {
            body.extend_from_slice(&chunk[..remaining]);
            return Ok((body, true));
        }
        body.extend_from_slice(&chunk);
    }
    Ok((body, false))
}

fn request_id() -> String {
    format!("br-{}", Uuid::new_v4().simple())
}

fn request_build_error(message: String) -> WorkError {
    client_error(
        WorkErrorKind::Runtime,
        "hermes_http_client_build_failed",
        &message,
        false,
    )
}

fn map_transport_error(error: reqwest::Error, request_id: Option<String>) -> WorkError {
    let timeout = error.is_timeout();
    WorkError {
        kind: if timeout {
            WorkErrorKind::Timeout
        } else {
            WorkErrorKind::Connection
        },
        code: if timeout {
            "hermes_request_timeout".into()
        } else {
            "hermes_connection_failed".into()
        },
        message: if timeout {
            "Hermes request timed out.".into()
        } else {
            format!("Unable to reach the managed Hermes runtime: {error}")
        },
        retryable: true,
        http_status: None,
        request_id,
        details: BTreeMap::new(),
    }
}

fn client_error(kind: WorkErrorKind, code: &str, message: &str, retryable: bool) -> WorkError {
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
    use std::future::Future;
    use std::time::Duration;

    use futures_util::StreamExt;
    use serde_json::json;

    use super::{HermesApiClient, HermesRunCreateRequest};
    use crate::shared::hermes_core::fake_server::{FakeExchange, FakeHermesServer};
    use crate::shared::hermes_core::protocol::{HermesApprovalRequest, HermesSseFrame};
    use crate::shared::hermes_core::types::WorkErrorKind;

    macro_rules! fixture {
        ($name:literal) => {
            include_str!(concat!("../../../test-fixtures/hermes/v2026.7.7.2/", $name))
        };
    }

    fn run_async(future: impl Future<Output = ()>) {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(future);
    }

    fn bearer() -> &'static str {
        "br_fixture_0123456789abcdef0123456789abcdef"
    }

    #[test]
    fn rejects_non_loopback_urls_and_weak_bearers() {
        assert!(HermesApiClient::new("https://example.com:443", bearer()).is_err());
        assert!(HermesApiClient::new("http://localhost:8642", bearer()).is_err());
        assert!(HermesApiClient::new("http://127.0.0.1:8642/v1", bearer()).is_err());
        assert!(HermesApiClient::new("http://127.0.0.1:8642", "short").is_err());
    }

    #[test]
    fn exercises_health_capabilities_models_and_run_actions() {
        run_async(async {
            let server = FakeHermesServer::spawn(vec![
                FakeExchange::json("GET", "/health", 200, fixture!("health.json")),
                FakeExchange::json(
                    "GET",
                    "/v1/capabilities",
                    200,
                    fixture!("capabilities.json"),
                ),
                FakeExchange::json("GET", "/v1/models", 200, fixture!("models.json")),
                FakeExchange::json("POST", "/v1/runs", 202, fixture!("run-started.json")),
                FakeExchange::json(
                    "GET",
                    "/v1/runs/run_demo_001",
                    200,
                    fixture!("run-status-running.json"),
                ),
                FakeExchange::json(
                    "POST",
                    "/v1/runs/run_demo_001/approval",
                    200,
                    fixture!("approval-response.json"),
                ),
                FakeExchange::json(
                    "POST",
                    "/v1/runs/run_demo_001/stop",
                    200,
                    fixture!("stop-response.json"),
                ),
            ])
            .await
            .unwrap();
            let client = HermesApiClient::new(&server.base_url, bearer()).unwrap();
            assert_eq!(client.health().await.unwrap().version, "0.18.2");
            let capabilities = client.capabilities().await.unwrap();
            HermesApiClient::validate_required_capabilities(&capabilities).unwrap();
            assert_eq!(client.models().await.unwrap().data.len(), 2);
            let started = client
                .create_run(&HermesRunCreateRequest {
                    input: json!("hello"),
                    instructions: Some("stay in project".into()),
                    session_id: Some("session_demo_001".into()),
                    model: Some("hermes-agent".into()),
                    conversation_history: Vec::new(),
                })
                .await
                .unwrap();
            assert_eq!(started.run_id, "run_demo_001");
            assert_eq!(
                client.run_status("run_demo_001").await.unwrap().status,
                "running"
            );
            client
                .resolve_approval(
                    "run_demo_001",
                    &HermesApprovalRequest {
                        choice: "once".into(),
                        resolve_all: false,
                    },
                )
                .await
                .unwrap();
            client.stop_run("run_demo_001").await.unwrap();
            let requests = server.finish().await.unwrap();
            let expected_bearer = format!("Bearer {}", bearer());
            assert!(requests.iter().all(|request| {
                request.header("authorization") == Some(expected_bearer.as_str())
            }));
            assert!(requests
                .iter()
                .all(|request| request.header("x-request-id").is_some()));
        });
    }

    #[test]
    fn streams_incremental_sse_and_reports_truncation() {
        run_async(async {
            let server = FakeHermesServer::spawn(vec![FakeExchange::sse(
                "/v1/runs/run_demo_001/events",
                fixture!("sse-normal.txt"),
            )])
            .await
            .unwrap();
            let client = HermesApiClient::new(&server.base_url, bearer()).unwrap();
            let frames = client
                .stream_run_events("run_demo_001")
                .await
                .unwrap()
                .collect::<Vec<_>>()
                .await;
            assert_eq!(frames.len(), 9);
            assert!(matches!(
                frames[1],
                Ok(HermesSseFrame::Event(ref event)) if event.event == "message.delta"
            ));
            server.finish().await.unwrap();

            let server = FakeHermesServer::spawn(vec![FakeExchange::sse(
                "/v1/runs/run_demo_001/events",
                fixture!("sse-normal.txt"),
            )
            .disconnect_after(80)])
            .await
            .unwrap();
            let client = HermesApiClient::with_timeouts(
                &server.base_url,
                bearer(),
                Duration::from_secs(2),
                Duration::from_secs(2),
            )
            .unwrap();
            let frames = client
                .stream_run_events("run_demo_001")
                .await
                .unwrap()
                .collect::<Vec<_>>()
                .await;
            assert!(frames.iter().any(|item| item.is_err()));
            server.finish().await.unwrap();
        });
    }

    #[test]
    fn maps_openai_error_envelopes_without_leaking_body() {
        run_async(async {
            let server = FakeHermesServer::spawn(vec![FakeExchange::json(
                "GET",
                "/v1/runs/run_missing",
                404,
                fixture!("error-openai.json"),
            )])
            .await
            .unwrap();
            let client = HermesApiClient::new(&server.base_url, bearer()).unwrap();
            let error = client.run_status("run_missing").await.unwrap_err();
            assert_eq!(error.kind, WorkErrorKind::InvalidRequest);
            assert_eq!(error.code, "run_not_found");
            assert_eq!(error.http_status, Some(404));
            assert!(error.request_id.is_some());
            server.finish().await.unwrap();
        });
    }

    #[test]
    fn exercises_session_resource_seams_for_resume() {
        run_async(async {
            let server = FakeHermesServer::spawn(vec![
                FakeExchange::json(
                    "GET",
                    "/api/sessions",
                    200,
                    r#"{"sessions":[{"id":"session_demo_001"}]}"#,
                ),
                FakeExchange::json("POST", "/api/sessions", 200, r#"{"id":"session_demo_001"}"#),
                FakeExchange::json(
                    "GET",
                    "/api/sessions/session_demo_001",
                    200,
                    r#"{"id":"session_demo_001"}"#,
                ),
                FakeExchange::json(
                    "GET",
                    "/api/sessions/session_demo_001/messages",
                    200,
                    r#"{"messages":[]}"#,
                ),
            ])
            .await
            .unwrap();
            let client = HermesApiClient::new(&server.base_url, bearer()).unwrap();
            assert_eq!(
                client.list_sessions().await.unwrap()["sessions"][0]["id"],
                "session_demo_001"
            );
            assert_eq!(
                client
                    .create_session(json!({"title": "Demo"}))
                    .await
                    .unwrap()["id"],
                "session_demo_001"
            );
            assert_eq!(
                client.get_session("session_demo_001").await.unwrap()["id"],
                "session_demo_001"
            );
            assert_eq!(
                client.session_messages("session_demo_001").await.unwrap()["messages"],
                json!([])
            );
            server.finish().await.unwrap();
        });
    }
}
