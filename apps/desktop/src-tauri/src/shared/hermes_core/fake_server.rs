use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::task::JoinHandle;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RecordedRequest {
    pub(crate) method: String,
    pub(crate) path: String,
    pub(crate) headers: Vec<(String, String)>,
    pub(crate) body: Vec<u8>,
}

impl RecordedRequest {
    pub(crate) fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }
}

#[derive(Debug, Clone)]
pub(crate) struct FakeExchange {
    pub(crate) method: String,
    pub(crate) path: String,
    pub(crate) status: u16,
    pub(crate) content_type: String,
    pub(crate) body: Vec<u8>,
    /// 声明完整 Content-Length，但只写出前 N bytes，用于模拟 SSE/HTTP 断流。
    pub(crate) disconnect_after: Option<usize>,
}

impl FakeExchange {
    pub(crate) fn json(method: &str, path: &str, status: u16, body: &str) -> Self {
        Self {
            method: method.into(),
            path: path.into(),
            status,
            content_type: "application/json".into(),
            body: body.as_bytes().to_vec(),
            disconnect_after: None,
        }
    }

    pub(crate) fn sse(path: &str, body: &str) -> Self {
        Self {
            method: "GET".into(),
            path: path.into(),
            status: 200,
            content_type: "text/event-stream".into(),
            body: body.as_bytes().to_vec(),
            disconnect_after: None,
        }
    }

    pub(crate) fn disconnect_after(mut self, bytes: usize) -> Self {
        self.disconnect_after = Some(bytes);
        self
    }
}

pub(crate) struct FakeHermesServer {
    pub(crate) base_url: String,
    requests: Arc<Mutex<Vec<RecordedRequest>>>,
    task: JoinHandle<Result<(), String>>,
}

impl FakeHermesServer {
    pub(crate) async fn spawn(exchanges: Vec<FakeExchange>) -> Result<Self, String> {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|error| format!("Unable to bind fake Hermes server: {error}"))?;
        let address = listener
            .local_addr()
            .map_err(|error| format!("Unable to read fake Hermes address: {error}"))?;
        let requests = Arc::new(Mutex::new(Vec::new()));
        let task_requests = Arc::clone(&requests);
        let mut queue = VecDeque::from(exchanges);
        let task = tokio::spawn(async move {
            while let Some(exchange) = queue.pop_front() {
                let (mut stream, _) = listener
                    .accept()
                    .await
                    .map_err(|error| format!("Fake Hermes accept failed: {error}"))?;
                let request = read_request(&mut stream).await?;
                let matches = request.method == exchange.method && request.path == exchange.path;
                task_requests
                    .lock()
                    .map_err(|_| "Fake Hermes request log is poisoned".to_string())?
                    .push(request.clone());
                if !matches {
                    write_response(
                        &mut stream,
                        500,
                        "application/json",
                        br#"{"error":{"message":"unexpected fake request","code":"unexpected_request"}}"#,
                        None,
                    )
                    .await?;
                    return Err(format!(
                        "Expected {} {}, received {} {}",
                        exchange.method, exchange.path, request.method, request.path
                    ));
                }
                write_response(
                    &mut stream,
                    exchange.status,
                    &exchange.content_type,
                    &exchange.body,
                    exchange.disconnect_after,
                )
                .await?;
            }
            Ok(())
        });

        Ok(Self {
            base_url: format!("http://{address}"),
            requests,
            task,
        })
    }

    pub(crate) async fn finish(self) -> Result<Vec<RecordedRequest>, String> {
        self.task
            .await
            .map_err(|error| format!("Fake Hermes task join failed: {error}"))??;
        Ok(self
            .requests
            .lock()
            .map_err(|_| "Fake Hermes request log is poisoned".to_string())?
            .clone())
    }
}

async fn read_request(stream: &mut TcpStream) -> Result<RecordedRequest, String> {
    let mut bytes = Vec::new();
    let header_end = loop {
        if let Some(index) = find_bytes(&bytes, b"\r\n\r\n") {
            break index + 4;
        }
        if bytes.len() > 1024 * 1024 {
            return Err("Fake Hermes request headers exceeded 1 MiB".into());
        }
        let mut chunk = [0_u8; 4096];
        let read = stream
            .read(&mut chunk)
            .await
            .map_err(|error| format!("Fake Hermes request read failed: {error}"))?;
        if read == 0 {
            return Err("Fake Hermes client closed before headers completed".into());
        }
        bytes.extend_from_slice(&chunk[..read]);
    };

    let header_text = std::str::from_utf8(&bytes[..header_end - 4])
        .map_err(|error| format!("Fake Hermes headers are not UTF-8: {error}"))?;
    let mut lines = header_text.split("\r\n");
    let request_line = lines
        .next()
        .ok_or_else(|| "Fake Hermes request line is missing".to_string())?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts
        .next()
        .ok_or_else(|| "Fake Hermes request method is missing".to_string())?
        .to_string();
    let path = request_parts
        .next()
        .ok_or_else(|| "Fake Hermes request path is missing".to_string())?
        .to_string();
    let headers = lines
        .filter_map(|line| line.split_once(':'))
        .map(|(key, value)| (key.trim().to_string(), value.trim().to_string()))
        .collect::<Vec<_>>();
    let content_length = headers
        .iter()
        .find(|(key, _)| key.eq_ignore_ascii_case("content-length"))
        .and_then(|(_, value)| value.parse::<usize>().ok())
        .unwrap_or(0);
    while bytes.len() < header_end + content_length {
        let mut chunk = [0_u8; 4096];
        let read = stream
            .read(&mut chunk)
            .await
            .map_err(|error| format!("Fake Hermes body read failed: {error}"))?;
        if read == 0 {
            return Err("Fake Hermes client closed before body completed".into());
        }
        bytes.extend_from_slice(&chunk[..read]);
    }
    let body = bytes[header_end..header_end + content_length].to_vec();
    Ok(RecordedRequest {
        method,
        path,
        headers,
        body,
    })
}

async fn write_response(
    stream: &mut TcpStream,
    status: u16,
    content_type: &str,
    body: &[u8],
    disconnect_after: Option<usize>,
) -> Result<(), String> {
    let reason = match status {
        200 => "OK",
        202 => "Accepted",
        400 => "Bad Request",
        401 => "Unauthorized",
        404 => "Not Found",
        409 => "Conflict",
        500 => "Internal Server Error",
        503 => "Service Unavailable",
        _ => "Fake",
    };
    let headers = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream
        .write_all(headers.as_bytes())
        .await
        .map_err(|error| format!("Fake Hermes response headers failed: {error}"))?;
    let body_end = disconnect_after.unwrap_or(body.len()).min(body.len());
    stream
        .write_all(&body[..body_end])
        .await
        .map_err(|error| format!("Fake Hermes response body failed: {error}"))?;
    stream
        .shutdown()
        .await
        .map_err(|error| format!("Fake Hermes response shutdown failed: {error}"))
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

#[cfg(test)]
mod tests {
    use std::future::Future;

    use super::{FakeExchange, FakeHermesServer};

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

    #[test]
    fn serves_normal_run_and_records_bearer_requests() {
        run_async(async {
            let server = FakeHermesServer::spawn(vec![
                FakeExchange::json("POST", "/v1/runs", 202, fixture!("run-started.json")),
                FakeExchange::sse("/v1/runs/run_demo_001/events", fixture!("sse-normal.txt")),
                FakeExchange::json(
                    "GET",
                    "/v1/runs/run_demo_001",
                    200,
                    fixture!("run-status-completed.json"),
                ),
            ])
            .await
            .unwrap();
            let client = reqwest::Client::new();
            let started = client
                .post(format!("{}/v1/runs", server.base_url))
                .bearer_auth("fixture-secret")
                .header("content-type", "application/json")
                .body(r#"{"input":"hello"}"#)
                .send()
                .await
                .unwrap();
            assert_eq!(started.status(), reqwest::StatusCode::ACCEPTED);
            let events = client
                .get(format!("{}/v1/runs/run_demo_001/events", server.base_url))
                .bearer_auth("fixture-secret")
                .send()
                .await
                .unwrap()
                .text()
                .await
                .unwrap();
            assert!(events.contains("tool.started"));
            assert!(events.contains("tool.completed"));
            assert!(events.contains("run.completed"));
            let completed = client
                .get(format!("{}/v1/runs/run_demo_001", server.base_url))
                .bearer_auth("fixture-secret")
                .send()
                .await
                .unwrap();
            assert!(completed.status().is_success());
            let requests = server.finish().await.unwrap();
            assert_eq!(requests.len(), 3);
            assert_eq!(
                requests[0].header("authorization"),
                Some("Bearer fixture-secret")
            );
        });
    }

    #[test]
    fn records_approval_and_stop_bodies() {
        run_async(async {
            let server = FakeHermesServer::spawn(vec![
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
            let client = reqwest::Client::new();
            client
                .post(format!("{}/v1/runs/run_demo_001/approval", server.base_url))
                .header("content-type", "application/json")
                .body(r#"{"choice":"deny"}"#)
                .send()
                .await
                .unwrap();
            client
                .post(format!("{}/v1/runs/run_demo_001/stop", server.base_url))
                .send()
                .await
                .unwrap();
            let requests = server.finish().await.unwrap();
            assert_eq!(
                serde_json::from_slice::<serde_json::Value>(&requests[0].body).unwrap()["choice"],
                "deny"
            );
            assert!(requests[1].body.is_empty());
        });
    }

    #[test]
    fn can_inject_truncated_sse_disconnects() {
        run_async(async {
            let server = FakeHermesServer::spawn(vec![FakeExchange::sse(
                "/v1/runs/run_demo_001/events",
                fixture!("sse-normal.txt"),
            )
            .disconnect_after(80)])
            .await
            .unwrap();
            let response = reqwest::get(format!("{}/v1/runs/run_demo_001/events", server.base_url))
                .await
                .unwrap();
            assert!(response.bytes().await.is_err());
            let _ = server.finish().await.unwrap();
        });
    }
}
