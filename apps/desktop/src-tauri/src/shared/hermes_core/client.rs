use std::collections::{BTreeMap, VecDeque};
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use futures_util::{stream, Stream, StreamExt};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE, USER_AGENT};
use reqwest::{Method, Response, StatusCode, Url};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::watch;
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
const MAX_SSE_PENDING_FRAMES: usize = 1024;
const MAX_HTTP_TRACE_ENTRIES: usize = 200;
const USER_AGENT_VALUE: &str = concat!("BlackRain/", env!("CARGO_PKG_VERSION"), " Hermes-WORK/1");

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesHttpTrace {
    pub(crate) request_id: String,
    pub(crate) method: String,
    pub(crate) path: String,
    pub(crate) status: Option<u16>,
    pub(crate) outcome: String,
    pub(crate) elapsed_ms: u64,
}

#[derive(Clone, Default)]
pub(crate) struct HermesHttpTraceSink {
    traces: Arc<Mutex<VecDeque<HermesHttpTrace>>>,
}

impl HermesHttpTraceSink {
    pub(crate) fn recent(&self) -> Vec<HermesHttpTrace> {
        self.traces
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .iter()
            .cloned()
            .collect()
    }

    fn record(&self, trace: HermesHttpTrace) {
        let mut traces = self
            .traces
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        traces.push_back(trace);
        while traces.len() > MAX_HTTP_TRACE_ENTRIES {
            traces.pop_front();
        }
    }
}

#[derive(Clone)]
pub(crate) struct HermesStreamCancellation {
    sender: watch::Sender<bool>,
}

impl HermesStreamCancellation {
    pub(crate) fn new() -> Self {
        let (sender, _) = watch::channel(false);
        Self { sender }
    }

    pub(crate) fn cancel(&self) {
        self.sender.send_replace(true);
    }

    #[cfg(test)]
    pub(crate) fn is_cancelled(&self) -> bool {
        *self.sender.borrow()
    }

    fn subscribe(&self) -> watch::Receiver<bool> {
        self.sender.subscribe()
    }
}

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
    trace_sink: HermesHttpTraceSink,
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
        Self::with_timeouts_and_trace_sink(
            base_url,
            bearer,
            request_timeout,
            connect_timeout,
            HermesHttpTraceSink::default(),
        )
    }

    pub(crate) fn with_trace_sink(
        base_url: &str,
        bearer: &str,
        trace_sink: HermesHttpTraceSink,
    ) -> Result<Self, WorkError> {
        Self::with_timeouts_and_trace_sink(
            base_url,
            bearer,
            DEFAULT_REQUEST_TIMEOUT,
            DEFAULT_CONNECT_TIMEOUT,
            trace_sink,
        )
    }

    pub(crate) fn with_timeouts_and_trace_sink(
        base_url: &str,
        bearer: &str,
        request_timeout: Duration,
        connect_timeout: Duration,
        trace_sink: HermesHttpTraceSink,
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
            trace_sink,
        })
    }

    pub(crate) fn base_url(&self) -> &str {
        self.base_url.as_str().trim_end_matches('/')
    }

    pub(crate) fn recent_http_traces(&self) -> Vec<HermesHttpTrace> {
        self.trace_sink.recent()
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
        self.stream_run_events_inner(run_id, None).await
    }

    pub(crate) async fn stream_run_events_with_cancel(
        &self,
        run_id: &str,
        cancellation: &HermesStreamCancellation,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<HermesSseFrame, WorkError>> + Send>>, WorkError>
    {
        self.stream_run_events_inner(run_id, Some(cancellation))
            .await
    }

    async fn stream_run_events_inner(
        &self,
        run_id: &str,
        cancellation: Option<&HermesStreamCancellation>,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<HermesSseFrame, WorkError>> + Send>>, WorkError>
    {
        validate_path_id("run id", run_id)?;
        let request_id = request_id();
        let path = format!("/v1/runs/{run_id}/events");
        let started = Instant::now();
        let request =
            self.authorized_request(&self.stream_client, Method::GET, &path, &request_id)?;
        let response = if let Some(cancellation) = cancellation {
            let mut receiver = cancellation.subscribe();
            tokio::select! {
                response = request.send() => response
                    .map_err(|error| map_transport_error(error, Some(request_id.clone()))),
                _ = wait_for_cancellation(&mut receiver) => Err(cancelled_error(Some(request_id.clone()))),
            }
        } else {
            request
                .send()
                .await
                .map_err(|error| map_transport_error(error, Some(request_id.clone())))
        };
        let response = match response {
            Ok(response) => response,
            Err(error) => {
                self.record_http_trace(
                    &request_id,
                    "GET",
                    &path,
                    error.http_status,
                    &error.code,
                    started,
                );
                return Err(error);
            }
        };
        let status = response.status().as_u16();
        let response = match ensure_success(response, request_id.clone()).await {
            Ok(response) => response,
            Err(error) => {
                self.record_http_trace(
                    &request_id,
                    "GET",
                    &path,
                    Some(status),
                    &error.code,
                    started,
                );
                return Err(error);
            }
        };
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();
        if !content_type
            .to_ascii_lowercase()
            .starts_with("text/event-stream")
        {
            let mut error = client_error(
                WorkErrorKind::InvalidRequest,
                "invalid_sse_content_type",
                "Hermes run events endpoint did not return text/event-stream.",
                false,
            );
            error.request_id = Some(request_id.clone());
            self.record_http_trace(
                &request_id,
                "GET",
                &path,
                Some(status),
                &error.code,
                started,
            );
            return Err(error);
        }
        self.record_http_trace(
            &request_id,
            "GET",
            &path,
            Some(status),
            "stream_ready",
            started,
        );

        struct State<S> {
            stream: S,
            decoder: Option<HermesSseDecoder>,
            pending: VecDeque<Result<HermesSseFrame, WorkError>>,
            finished: bool,
            cancellation: Option<watch::Receiver<bool>>,
            request_id: String,
        }

        let state = State {
            stream: Box::pin(response.bytes_stream()),
            decoder: Some(HermesSseDecoder::default()),
            pending: VecDeque::new(),
            finished: false,
            cancellation: cancellation.map(HermesStreamCancellation::subscribe),
            request_id,
        };
        let output = stream::unfold(state, |mut state| async move {
            loop {
                if state
                    .cancellation
                    .as_ref()
                    .is_some_and(|receiver| *receiver.borrow())
                {
                    state.finished = true;
                    state.cancellation = None;
                    return Some((Err(cancelled_error(Some(state.request_id.clone()))), state));
                }
                if let Some(item) = state.pending.pop_front() {
                    return Some((item, state));
                }
                if state.finished {
                    return None;
                }
                let next = if let Some(receiver) = state.cancellation.as_mut() {
                    tokio::select! {
                        item = state.stream.next() => Some(item),
                        _ = wait_for_cancellation(receiver) => None,
                    }
                } else {
                    Some(state.stream.next().await)
                };
                match next {
                    None => {
                        state.finished = true;
                        state.cancellation = None;
                        state
                            .pending
                            .push_back(Err(cancelled_error(Some(state.request_id.clone()))));
                    }
                    Some(Some(Ok(chunk))) => {
                        let result = state
                            .decoder
                            .as_mut()
                            .expect("decoder exists until stream completion")
                            .push(&chunk);
                        match result {
                            Ok(frames) => {
                                if let Err(error) = queue_sse_frames(&mut state.pending, frames) {
                                    state.finished = true;
                                    state.pending.push_back(Err(error));
                                }
                            }
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
                    Some(Some(Err(error))) => {
                        state.finished = true;
                        state.pending.push_back(Err(map_transport_error(
                            error,
                            Some(state.request_id.clone()),
                        )));
                    }
                    Some(None) => {
                        state.finished = true;
                        let decoder = state.decoder.take().expect("decoder is consumed once");
                        match decoder.finish() {
                            Ok(frames) => {
                                if let Err(error) = queue_sse_frames(&mut state.pending, frames) {
                                    state.pending.push_back(Err(error));
                                }
                            }
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
        let method_name = method.as_str().to_string();
        let started = Instant::now();
        let mut request =
            self.authorized_request(&self.request_client, method, path, &request_id)?;
        if let Some(body) = body {
            request = request.json(&body);
        }
        let mut response_status = None;
        let result = async {
            let response = request
                .send()
                .await
                .map_err(|error| map_transport_error(error, Some(request_id.clone())))?;
            response_status = Some(response.status().as_u16());
            let response = ensure_success(response, request_id.clone()).await?;
            let (body, truncated) =
                read_limited_body(response, MAX_JSON_BODY_BYTES, &request_id).await?;
            if truncated {
                return Err(WorkError {
                    kind: WorkErrorKind::InvalidRequest,
                    code: "hermes_json_body_too_large".into(),
                    message: "Hermes JSON response exceeded 4 MiB.".into(),
                    retryable: false,
                    http_status: response_status,
                    request_id: Some(request_id.clone()),
                    details: BTreeMap::new(),
                });
            }
            serde_json::from_slice::<T>(&body).map_err(|error| WorkError {
                kind: WorkErrorKind::InvalidRequest,
                code: "invalid_hermes_json".into(),
                message: format!("Hermes returned invalid JSON: {error}"),
                retryable: false,
                http_status: response_status,
                request_id: Some(request_id.clone()),
                details: BTreeMap::new(),
            })
        }
        .await;
        let (status, outcome) = match &result {
            Ok(_) => (response_status, "ok"),
            Err(error) => (error.http_status.or(response_status), error.code.as_str()),
        };
        self.record_http_trace(&request_id, &method_name, path, status, outcome, started);
        result
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

    fn record_http_trace(
        &self,
        request_id: &str,
        method: &str,
        path: &str,
        status: Option<u16>,
        outcome: &str,
        started: Instant,
    ) {
        let trace = HermesHttpTrace {
            request_id: request_id.into(),
            method: method.into(),
            path: path.into(),
            status,
            outcome: sanitize_trace_outcome(outcome),
            elapsed_ms: started.elapsed().as_millis().min(u128::from(u64::MAX)) as u64,
        };
        self.trace_sink.record(trace);
    }
}

fn sanitize_trace_outcome(value: &str) -> String {
    let valid = !value.is_empty()
        && value.len() <= 80
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'));
    if valid {
        value.into()
    } else {
        "error".into()
    }
}

fn queue_sse_frames(
    pending: &mut VecDeque<Result<HermesSseFrame, WorkError>>,
    frames: Vec<HermesSseFrame>,
) -> Result<(), WorkError> {
    if pending.len().saturating_add(frames.len()) > MAX_SSE_PENDING_FRAMES {
        return Err(client_error(
            WorkErrorKind::Connection,
            "hermes_sse_backpressure_overflow",
            "Hermes emitted more SSE frames than the bounded client queue can safely buffer.",
            true,
        ));
    }
    pending.extend(frames.into_iter().map(Ok));
    Ok(())
}

async fn wait_for_cancellation(receiver: &mut watch::Receiver<bool>) {
    loop {
        if *receiver.borrow() {
            return;
        }
        if receiver.changed().await.is_err() {
            std::future::pending::<()>().await;
        }
    }
}

fn cancelled_error(request_id: Option<String>) -> WorkError {
    WorkError {
        kind: WorkErrorKind::Cancelled,
        code: "hermes_stream_cancelled".into(),
        message: "Hermes event streaming was cancelled by BlackRain.".into(),
        retryable: false,
        http_status: None,
        request_id,
        details: BTreeMap::new(),
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
        .filter(|value| is_safe_diagnostic_token(value, 128))
        .map(ToString::to_string)
        .unwrap_or(request_id);
    let (body, _) = read_limited_body(response, MAX_ERROR_BODY_BYTES, &response_request_id).await?;
    let envelope = serde_json::from_slice::<HermesErrorEnvelope>(&body).ok();
    let upstream_code = envelope
        .as_ref()
        .and_then(|value| value.error.code.clone())
        .filter(|value| is_safe_diagnostic_token(value, 80))
        .unwrap_or_else(|| format!("hermes_http_{}", status.as_u16()));
    let message = match status {
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
            "Hermes rejected the managed API authentication."
        }
        StatusCode::NOT_FOUND => "The requested Hermes resource was not found.",
        StatusCode::CONFLICT => "Hermes rejected the request because its state changed.",
        StatusCode::BAD_REQUEST => "Hermes rejected the managed request.",
        StatusCode::REQUEST_TIMEOUT | StatusCode::GATEWAY_TIMEOUT => {
            "Hermes timed out while processing the request."
        }
        status if status.is_server_error() => "Hermes upstream service is unavailable.",
        _ => "Hermes returned an unexpected HTTP error.",
    }
    .to_string();
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

fn is_safe_diagnostic_token(value: &str, max_len: usize) -> bool {
    !value.is_empty()
        && value.len() <= max_len
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
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

    use super::{
        queue_sse_frames, sanitize_trace_outcome, HermesApiClient, HermesRunCreateRequest,
        HermesStreamCancellation, MAX_SSE_PENDING_FRAMES,
    };
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
    fn trace_outcomes_reject_free_form_or_sensitive_text() {
        assert_eq!(sanitize_trace_outcome("upstream_busy"), "upstream_busy");
        assert_eq!(
            sanitize_trace_outcome("private detail with spaces"),
            "error"
        );
        assert_eq!(sanitize_trace_outcome(&"x".repeat(81)), "error");
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
            let traces = client.recent_http_traces();
            assert_eq!(traces.len(), 7);
            let serialized = serde_json::to_string(&traces).unwrap();
            assert!(!serialized.contains(bearer()));
            assert!(!serialized.contains("stay in project"));
            assert!(traces.iter().all(|trace| trace.outcome == "ok"));
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
    fn stream_cancellation_interrupts_a_blocked_body_read() {
        run_async(async {
            let server = FakeHermesServer::spawn(vec![FakeExchange::sse(
                "/v1/runs/run_demo_001/events",
                fixture!("sse-normal.txt"),
            )
            .delay_body(Duration::from_millis(200))])
            .await
            .unwrap();
            let client = HermesApiClient::new(&server.base_url, bearer()).unwrap();
            let cancellation = HermesStreamCancellation::new();
            let mut stream = client
                .stream_run_events_with_cancel("run_demo_001", &cancellation)
                .await
                .unwrap();
            cancellation.cancel();
            let error = stream.next().await.unwrap().unwrap_err();
            assert_eq!(error.kind, WorkErrorKind::Cancelled);
            assert_eq!(error.code, "hermes_stream_cancelled");
            assert!(!error.retryable);
            assert!(stream.next().await.is_none());
            server.finish().await.unwrap();
        });
    }

    #[test]
    fn timeout_is_retryable_but_requests_are_never_replayed_implicitly() {
        run_async(async {
            let timeout_server = FakeHermesServer::spawn(vec![FakeExchange::json(
                "GET",
                "/health",
                200,
                fixture!("health.json"),
            )
            .delay_body(Duration::from_millis(150))])
            .await
            .unwrap();
            let client = HermesApiClient::with_timeouts(
                &timeout_server.base_url,
                bearer(),
                Duration::from_millis(30),
                Duration::from_secs(1),
            )
            .unwrap();
            let error = client.health().await.unwrap_err();
            assert_eq!(error.kind, WorkErrorKind::Timeout);
            assert!(error.retryable);
            assert_eq!(timeout_server.finish().await.unwrap().len(), 1);

            let failure_server = FakeHermesServer::spawn(vec![FakeExchange::json(
                "POST",
                "/v1/runs",
                503,
                r#"{"error":{"message":"temporarily unavailable","code":"upstream_busy"}}"#,
            )])
            .await
            .unwrap();
            let client = HermesApiClient::new(&failure_server.base_url, bearer()).unwrap();
            let error = client
                .create_run(&HermesRunCreateRequest {
                    input: json!("single attempt"),
                    instructions: None,
                    session_id: None,
                    model: None,
                    conversation_history: Vec::new(),
                })
                .await
                .unwrap_err();
            assert_eq!(error.code, "upstream_busy");
            assert!(error.retryable);
            assert_eq!(failure_server.finish().await.unwrap().len(), 1);
        });
    }

    #[test]
    fn sse_pending_queue_is_bounded_for_backpressure() {
        let frames = (0..=MAX_SSE_PENDING_FRAMES)
            .map(|index| HermesSseFrame::Comment(format!("frame-{index}")))
            .collect();
        let mut pending = std::collections::VecDeque::new();
        let error = queue_sse_frames(&mut pending, frames).unwrap_err();
        assert_eq!(error.code, "hermes_sse_backpressure_overflow");
        assert!(pending.is_empty());
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
            assert_eq!(
                error.message,
                "The requested Hermes resource was not found."
            );
            assert!(!error.message.contains("run_missing"));
            assert_eq!(error.http_status, Some(404));
            assert!(error.request_id.is_some());
            server.finish().await.unwrap();

            let server = FakeHermesServer::spawn(vec![FakeExchange::json(
                "POST",
                "/v1/runs",
                503,
                r#"{"error":{"message":"prompt=private-board-data","code":"private code with spaces"}}"#,
            )])
            .await
            .unwrap();
            let client = HermesApiClient::new(&server.base_url, bearer()).unwrap();
            let error = client
                .create_run(&HermesRunCreateRequest {
                    input: json!("private-board-data"),
                    instructions: None,
                    session_id: None,
                    model: None,
                    conversation_history: Vec::new(),
                })
                .await
                .unwrap_err();
            assert_eq!(error.code, "hermes_http_503");
            assert_eq!(error.message, "Hermes upstream service is unavailable.");
            let serialized = serde_json::to_string(&error).unwrap();
            assert!(!serialized.contains("private-board-data"));
            assert!(!serialized.contains("private code with spaces"));
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
