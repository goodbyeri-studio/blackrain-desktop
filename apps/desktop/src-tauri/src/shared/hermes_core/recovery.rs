use std::collections::BTreeMap;
use std::sync::Arc;

use tokio::sync::Mutex;

use super::client::HermesApiClient;
use super::tasks::{HermesTaskStore, WorkRecoveryRecord};
use super::types::WorkError;

pub(crate) async fn audit_remote_recovery(
    store: &Arc<Mutex<HermesTaskStore>>,
    client: &HermesApiClient,
) -> Result<Vec<WorkRecoveryRecord>, WorkError> {
    let (candidates, local_records) = {
        let guard = store.lock().await;
        let local_records = guard.audit_local_recovery()?;
        let candidates = guard.remote_recovery_candidates()?;
        (candidates, local_records)
    };
    let mut records = local_records
        .into_iter()
        .map(|record| (record.task_id.clone(), record))
        .collect::<BTreeMap<_, _>>();
    for task in candidates {
        let Some(run_id) = task.active_run_id.as_deref() else {
            continue;
        };
        let observation = client.run_status(run_id).await;
        let guard = store.lock().await;
        let record = match observation {
            Ok(status) => guard.reconcile_remote_status(&task.task_id, run_id, &status)?,
            Err(error) => guard.reconcile_remote_error(&task.task_id, run_id, &error)?,
        };
        records.insert(record.task_id.clone(), record);
    }
    Ok(records.into_values().collect())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::sync::Arc;

    use tokio::sync::Mutex;

    use super::audit_remote_recovery;
    use crate::shared::hermes_core::client::HermesApiClient;
    use crate::shared::hermes_core::fake_server::{FakeExchange, FakeHermesServer};
    use crate::shared::hermes_core::tasks::{HermesTaskStore, WorkRecoveryDisposition};
    use crate::shared::hermes_core::types::{WorkTask, WorkTaskStatus, WORK_SCHEMA_VERSION};

    fn temp_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "blackrain-hermes-remote-recovery-{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn task(id: &str, run_id: &str, created_at: f64) -> WorkTask {
        WorkTask {
            schema_version: WORK_SCHEMA_VERSION,
            task_id: id.into(),
            activation_id: Some("activation-office-demo".into()),
            workbench_id: "office-agent".into(),
            workbench_version: "0.1.0".into(),
            project_path: r"C:\Users\demo\BlackRain Project".into(),
            hermes_session_id: Some(format!("session-{id}")),
            active_run_id: Some(run_id.into()),
            status: WorkTaskStatus::Running,
            last_event_sequence: 0,
            created_at,
            updated_at: created_at,
            recovery: Default::default(),
            activation_migrations: Vec::new(),
        }
    }

    fn run_status(run_id: &str, session_id: &str, status: &str, updated_at: f64) -> String {
        serde_json::json!({
            "object": "hermes.run",
            "run_id": run_id,
            "status": status,
            "created_at": 1.0,
            "updated_at": updated_at,
            "session_id": session_id,
            "model": "office-fast",
            "last_event": format!("run.{status}"),
        })
        .to_string()
    }

    #[tokio::test]
    async fn remote_audit_converges_active_tasks_without_synthetic_events() {
        let root = temp_root();
        let store = Arc::new(Mutex::new(HermesTaskStore::new(&root)));
        {
            let guard = store.lock().await;
            guard.upsert_task(&task("task-a", "run-a", 1.0)).unwrap();
            guard.upsert_task(&task("task-b", "run-b", 2.0)).unwrap();
            guard.upsert_task(&task("task-c", "run-c", 3.0)).unwrap();
            guard.upsert_task(&task("task-d", "run-d", 4.0)).unwrap();
            guard.upsert_task(&task("task-e", "run-e", 5.0)).unwrap();
            guard.upsert_task(&task("task-f", "run-f", 6.0)).unwrap();
        }
        let server = FakeHermesServer::spawn(vec![
            FakeExchange::json(
                "GET",
                "/v1/runs/run-a",
                200,
                &run_status("run-a", "session-task-a", "running", 10.0),
            ),
            FakeExchange::json(
                "GET",
                "/v1/runs/run-b",
                200,
                &run_status("run-b", "session-task-b", "completed", 11.0),
            ),
            FakeExchange::json(
                "GET",
                "/v1/runs/run-c",
                404,
                r#"{"error":{"message":"Run not found","type":"invalid_request_error","code":"run_not_found"}}"#,
            ),
            FakeExchange::json(
                "GET",
                "/v1/runs/run-d",
                200,
                &run_status("run-d", "session-task-d", "failed", 12.0),
            ),
            FakeExchange::json(
                "GET",
                "/v1/runs/run-e",
                503,
                r#"{"error":{"message":"Temporarily unavailable","type":"server_error","code":"unavailable"}}"#,
            ),
            FakeExchange::json(
                "GET",
                "/v1/runs/run-f",
                200,
                &run_status("run-f", "session-task-f", "future_state", 13.0),
            ),
        ])
        .await
        .unwrap();
        let client = HermesApiClient::new(
            &server.base_url,
            "blackrain-test-bearer-remote-recovery-123456789",
        )
        .unwrap();

        let records = audit_remote_recovery(&store, &client).await.unwrap();
        let records = records
            .into_iter()
            .map(|record| (record.task_id.clone(), record.disposition))
            .collect::<std::collections::HashMap<_, _>>();
        assert_eq!(records["task-a"], WorkRecoveryDisposition::Resumable);
        assert_eq!(records["task-b"], WorkRecoveryDisposition::Completed);
        assert_eq!(records["task-c"], WorkRecoveryDisposition::Orphaned);
        assert_eq!(records["task-d"], WorkRecoveryDisposition::Failed);
        assert_eq!(records["task-e"], WorkRecoveryDisposition::Resumable);
        assert_eq!(records["task-f"], WorkRecoveryDisposition::Resumable);

        let guard = store.lock().await;
        let tasks = guard.load_tasks().unwrap();
        let by_id = tasks
            .into_iter()
            .map(|task| (task.task_id.clone(), task))
            .collect::<std::collections::HashMap<_, _>>();
        assert_eq!(by_id["task-a"].status, WorkTaskStatus::Running);
        assert_eq!(by_id["task-b"].status, WorkTaskStatus::Completed);
        assert_eq!(by_id["task-b"].active_run_id, None);
        assert_eq!(by_id["task-c"].status, WorkTaskStatus::Orphaned);
        assert_eq!(by_id["task-c"].active_run_id.as_deref(), Some("run-c"));
        assert_eq!(by_id["task-d"].status, WorkTaskStatus::Failed);
        assert_eq!(by_id["task-d"].active_run_id, None);
        assert_eq!(by_id["task-e"].status, WorkTaskStatus::Degraded);
        assert_eq!(by_id["task-e"].active_run_id.as_deref(), Some("run-e"));
        assert_eq!(by_id["task-f"].status, WorkTaskStatus::Degraded);
        assert_eq!(by_id["task-f"].active_run_id.as_deref(), Some("run-f"));
        for task_id in ["task-a", "task-b", "task-c", "task-d", "task-e", "task-f"] {
            assert!(guard.load_events(task_id).unwrap().is_empty());
        }
        drop(guard);
        assert_eq!(server.finish().await.unwrap().len(), 6);
        fs::remove_dir_all(root).unwrap();
    }
}
