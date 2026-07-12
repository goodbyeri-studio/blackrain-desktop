use std::collections::{BTreeMap, HashMap};
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::config::{atomic_write, tighten_file_permissions};
use super::protocol::HermesRunStatus;
use super::types::{
    WorkActivationMigration, WorkActivationMigrationStatus, WorkError, WorkErrorKind, WorkEvent,
    WorkEventKind, WorkFollowUp, WorkFollowUpStatus, WorkTask, WorkTaskStatus, WORK_SCHEMA_VERSION,
};

const TASK_SNAPSHOT_SCHEMA_VERSION: u32 = 1;
const FOLLOW_UP_QUEUE_SCHEMA_VERSION: u32 = 1;
const MAX_JOURNAL_EVENT_BYTES: usize = 4 * 1024 * 1024;
const MAX_APPEND_EVENTS: usize = 1024;
const MAX_FOLLOW_UPS_PER_TASK: usize = 32;
const MAX_ACTIVATION_MIGRATIONS_PER_TASK: usize = 128;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct HermesTaskStorePaths {
    pub(crate) root: PathBuf,
    pub(crate) snapshot: PathBuf,
    pub(crate) events: PathBuf,
    pub(crate) follow_ups: PathBuf,
}

impl HermesTaskStorePaths {
    pub(crate) fn from_app_data_dir(app_data_dir: &Path) -> Self {
        let root = app_data_dir.join("work");
        Self {
            snapshot: root.join("tasks.v1.json"),
            events: root.join("events"),
            follow_ups: root.join("follow-ups"),
            root,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskSnapshot {
    schema_version: u32,
    tasks: Vec<WorkTask>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FollowUpQueueEnvelope {
    schema_version: u32,
    task_id: String,
    items: Vec<WorkFollowUp>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum WorkRecoveryDisposition {
    Resumable,
    Completed,
    Failed,
    Cancelled,
    Orphaned,
    Unchanged,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkRecoveryRecord {
    pub(crate) task_id: String,
    pub(crate) disposition: WorkRecoveryDisposition,
    pub(crate) last_event_sequence: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesTaskRecoveryState {
    pub(crate) records: Vec<WorkRecoveryRecord>,
    pub(crate) error: Option<WorkError>,
}

impl HermesTaskRecoveryState {
    pub(crate) fn from_result(result: Result<Vec<WorkRecoveryRecord>, WorkError>) -> Self {
        match result {
            Ok(records) => Self {
                records,
                error: None,
            },
            Err(error) => Self {
                records: Vec::new(),
                error: Some(error),
            },
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkEventAppendResult {
    pub(crate) task: WorkTask,
    pub(crate) appended: usize,
    pub(crate) skipped_duplicates: usize,
    pub(crate) appended_events: Vec<WorkEvent>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct WorkRunAttachResult {
    pub(crate) task: WorkTask,
    pub(crate) user_event: WorkEvent,
}

#[derive(Debug, Clone)]
pub(crate) struct HermesTaskStore {
    pub(crate) paths: HermesTaskStorePaths,
}

impl HermesTaskStore {
    pub(crate) fn new(app_data_dir: &Path) -> Self {
        Self {
            paths: HermesTaskStorePaths::from_app_data_dir(app_data_dir),
        }
    }

    pub(crate) fn load_tasks(&self) -> Result<Vec<WorkTask>, WorkError> {
        self.ensure_root()?;
        if !self.paths.snapshot.exists() {
            return Ok(Vec::new());
        }
        reject_symlink(&self.paths.snapshot)?;
        let bytes = fs::read(&self.paths.snapshot).map_err(|error| {
            persistence_error(
                "work_task_snapshot_read_failed",
                &format!("Unable to read WORK task snapshot: {error}"),
            )
        })?;
        let value = serde_json::from_slice::<Value>(&bytes).map_err(|error| {
            persistence_error(
                "work_task_snapshot_invalid",
                &format!("WORK task snapshot is invalid JSON: {error}"),
            )
        })?;
        let (snapshot, migrated) = parse_snapshot(value)?;
        validate_tasks(&snapshot.tasks)?;
        if migrated {
            self.write_snapshot(&snapshot.tasks)?;
        }
        Ok(snapshot.tasks)
    }

    pub(crate) fn upsert_task(&self, task: &WorkTask) -> Result<WorkTask, WorkError> {
        validate_task(task)?;
        let mut tasks = self.load_tasks()?;
        if let Some(existing) = tasks.iter_mut().find(|entry| entry.task_id == task.task_id) {
            *existing = task.clone();
        } else {
            tasks.push(task.clone());
        }
        sort_tasks(&mut tasks);
        self.write_snapshot(&tasks)?;
        Ok(task.clone())
    }

    pub(crate) fn load_task(&self, task_id: &str) -> Result<WorkTask, WorkError> {
        validate_store_id("task id", task_id)?;
        self.load_tasks()?
            .into_iter()
            .find(|task| task.task_id == task_id)
            .ok_or_else(|| persistence_error("work_task_not_found", "WORK task was not found."))
    }

    pub(crate) fn update_task_metadata(
        &self,
        task_id: &str,
        title: Option<&str>,
        pinned: Option<bool>,
        archived: Option<bool>,
    ) -> Result<WorkTask, WorkError> {
        validate_store_id("task id", task_id)?;
        if title.is_none() && pinned.is_none() && archived.is_none() {
            return Err(persistence_error(
                "work_task_metadata_empty",
                "WORK task metadata update did not contain a change.",
            ));
        }
        let normalized_title = title
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);
        if title.is_some() && normalized_title.is_none() {
            return Err(persistence_error(
                "work_task_title_invalid",
                "WORK task title must not be empty.",
            ));
        }
        if normalized_title
            .as_ref()
            .is_some_and(|value| value.chars().count() > 120 || value.chars().any(char::is_control))
        {
            return Err(persistence_error(
                "work_task_title_invalid",
                "WORK task title must be at most 120 characters and contain no control characters.",
            ));
        }
        let mut tasks = self.load_tasks()?;
        let task = tasks
            .iter_mut()
            .find(|task| task.task_id == task_id)
            .ok_or_else(|| persistence_error("work_task_not_found", "WORK task was not found."))?;
        if archived == Some(true) && task.active_run_id.is_some() {
            return Err(persistence_error(
                "work_task_archive_active",
                "Stop or finish the Hermes run before archiving the WORK task.",
            ));
        }
        if let Some(title) = normalized_title {
            task.title = Some(title);
        }
        if let Some(pinned) = pinned {
            task.pinned = pinned;
        }
        if let Some(archived) = archived {
            task.archived = archived;
            if archived {
                task.pinned = false;
            }
        }
        task.updated_at = now_unix_seconds().max(task.updated_at);
        let result = task.clone();
        sort_tasks(&mut tasks);
        self.write_snapshot(&tasks)?;
        Ok(result)
    }

    pub(crate) fn commit_activation_migration(
        &self,
        task_id: &str,
        target_workbench_version: &str,
        migration: WorkActivationMigration,
    ) -> Result<WorkTask, WorkError> {
        validate_store_id("task id", task_id)?;
        validate_non_empty("target workbench version", target_workbench_version)?;
        validate_activation_migration(&migration)?;
        if migration.status != WorkActivationMigrationStatus::Completed
            || migration.failure_code.is_some()
        {
            return Err(persistence_error(
                "work_activation_migration_commit_invalid",
                "A completed activation migration must not contain a failure code.",
            ));
        }
        let mut tasks = self.load_tasks()?;
        let task = tasks
            .iter_mut()
            .find(|task| task.task_id == task_id)
            .ok_or_else(|| persistence_error("work_task_not_found", "WORK task was not found."))?;
        ensure_task_can_migrate(task, &migration.source_activation_id)?;
        append_activation_migration(task, migration.clone())?;
        task.activation_id = Some(migration.target_activation_id);
        task.workbench_version = target_workbench_version.into();
        task.updated_at = task.updated_at.max(migration.timestamp);
        let result = task.clone();
        sort_tasks(&mut tasks);
        self.write_snapshot(&tasks)?;
        Ok(result)
    }

    pub(crate) fn record_activation_migration_failure(
        &self,
        task_id: &str,
        migration: WorkActivationMigration,
    ) -> Result<WorkTask, WorkError> {
        validate_store_id("task id", task_id)?;
        validate_activation_migration(&migration)?;
        if migration.status != WorkActivationMigrationStatus::Failed
            || migration.failure_code.is_none()
        {
            return Err(persistence_error(
                "work_activation_migration_failure_invalid",
                "A failed activation migration must contain a bounded failure code.",
            ));
        }
        let mut tasks = self.load_tasks()?;
        let task = tasks
            .iter_mut()
            .find(|task| task.task_id == task_id)
            .ok_or_else(|| persistence_error("work_task_not_found", "WORK task was not found."))?;
        if task.activation_id.as_deref() != Some(&migration.source_activation_id) {
            return Err(persistence_error(
                "work_activation_migration_source_changed",
                "WORK task activation changed before the migration failure could be recorded.",
            ));
        }
        append_activation_migration(task, migration.clone())?;
        task.updated_at = task.updated_at.max(migration.timestamp);
        let result = task.clone();
        sort_tasks(&mut tasks);
        self.write_snapshot(&tasks)?;
        Ok(result)
    }

    pub(crate) fn attach_run(
        &self,
        task_id: &str,
        run_id: &str,
        session_id: &str,
    ) -> Result<WorkTask, WorkError> {
        validate_store_id("task id", task_id)?;
        validate_store_id("run id", run_id)?;
        validate_store_id("Hermes session id", session_id)?;
        let mut tasks = self.load_tasks()?;
        let task = tasks
            .iter_mut()
            .find(|task| task.task_id == task_id)
            .ok_or_else(|| persistence_error("work_task_not_found", "WORK task was not found."))?;
        if task
            .active_run_id
            .as_deref()
            .is_some_and(|active| active != run_id)
        {
            return Err(persistence_error(
                "work_task_run_already_active",
                "WORK task already has a different active Hermes run.",
            ));
        }
        task.hermes_session_id = Some(session_id.into());
        task.active_run_id = Some(run_id.into());
        task.status = WorkTaskStatus::Running;
        task.updated_at = now_unix_seconds().max(task.updated_at);
        task.recovery.clear();
        let result = task.clone();
        sort_tasks(&mut tasks);
        self.write_snapshot(&tasks)?;
        Ok(result)
    }

    pub(crate) fn attach_run_with_user_message(
        &self,
        task_id: &str,
        run_id: &str,
        session_id: &str,
        text: &str,
        project_file_refs: &[String],
        source_follow_up_id: Option<&str>,
        model: Option<&str>,
    ) -> Result<WorkRunAttachResult, WorkError> {
        validate_store_id("task id", task_id)?;
        validate_store_id("run id", run_id)?;
        validate_store_id("Hermes session id", session_id)?;
        validate_user_message(text, project_file_refs)?;
        if let Some(follow_up_id) = source_follow_up_id {
            validate_store_id("source follow-up id", follow_up_id)?;
        }

        let mut tasks = self.load_tasks()?;
        let task = tasks
            .iter_mut()
            .find(|task| task.task_id == task_id)
            .ok_or_else(|| persistence_error("work_task_not_found", "WORK task was not found."))?;
        if task
            .active_run_id
            .as_deref()
            .is_some_and(|active| active != run_id)
        {
            return Err(persistence_error(
                "work_task_run_already_active",
                "WORK task already has a different active Hermes run.",
            ));
        }

        let existing = self.load_events(task_id)?;
        let last_sequence = existing
            .last()
            .map(|event| event.sequence)
            .unwrap_or(0)
            .max(task.last_event_sequence);
        let timestamp = now_unix_seconds().max(task.updated_at);
        let user_event = WorkEvent {
            schema_version: WORK_SCHEMA_VERSION,
            event_id: local_user_message_event_id(run_id),
            sequence: last_sequence.saturating_add(1),
            task_id: task_id.into(),
            run_id: run_id.into(),
            timestamp,
            item_id: Some(format!("user-message:{run_id}")),
            kind: WorkEventKind::UserMessageAdded {
                text: text.into(),
                project_file_refs: project_file_refs.to_vec(),
                source_follow_up_id: source_follow_up_id.map(str::to_string),
            },
        };
        validate_event(task_id, &user_event)?;
        if existing
            .iter()
            .any(|event| event.event_id == user_event.event_id)
        {
            return Err(persistence_error(
                "work_run_user_message_already_attached",
                "WORK run already has a persisted local user message.",
            ));
        }

        task.hermes_session_id = Some(session_id.into());
        task.model = model.map(str::to_string).or_else(|| task.model.clone());
        task.active_run_id = Some(run_id.into());
        task.status = WorkTaskStatus::Running;
        task.updated_at = timestamp;
        task.last_event_sequence = user_event.sequence;
        task.recovery.clear();
        let result = task.clone();
        sort_tasks(&mut tasks);

        let journal = self.event_journal_path(task_id)?;
        if journal.exists() {
            reject_symlink(&journal)?;
            repair_journal_tail(&journal, task_id)?;
        }
        let previous_journal_len = fs::metadata(&journal).map(|value| value.len()).unwrap_or(0);
        self.append_journal_lines(task_id, std::slice::from_ref(&user_event))?;
        if let Err(snapshot_error) = self.write_snapshot(&tasks) {
            if let Err(rollback_error) = rollback_journal_append(&journal, previous_journal_len) {
                return Err(persistence_error(
                    "work_run_attach_rollback_failed",
                    &format!(
                        "Unable to persist WORK run metadata and failed to roll back its user message: {}; {}",
                        snapshot_error.message, rollback_error.message
                    ),
                ));
            }
            return Err(snapshot_error);
        }

        Ok(WorkRunAttachResult {
            task: result,
            user_event,
        })
    }

    pub(crate) fn load_follow_ups(&self, task_id: &str) -> Result<Vec<WorkFollowUp>, WorkError> {
        validate_store_id("task id", task_id)?;
        let path = self.follow_up_queue_path(task_id)?;
        if !path.exists() {
            return Ok(Vec::new());
        }
        reject_symlink(&path)?;
        let bytes = fs::read(&path).map_err(|error| {
            persistence_error(
                "work_follow_up_queue_read_failed",
                &format!("Unable to read WORK follow-up queue: {error}"),
            )
        })?;
        let envelope =
            serde_json::from_slice::<FollowUpQueueEnvelope>(&bytes).map_err(|error| {
                persistence_error(
                    "work_follow_up_queue_invalid",
                    &format!("WORK follow-up queue is invalid JSON: {error}"),
                )
            })?;
        if envelope.schema_version != FOLLOW_UP_QUEUE_SCHEMA_VERSION || envelope.task_id != task_id
        {
            return Err(persistence_error(
                "work_follow_up_queue_invalid",
                "WORK follow-up queue schema or task identity is invalid.",
            ));
        }
        validate_follow_ups(task_id, &envelope.items)?;
        Ok(envelope.items)
    }

    pub(crate) fn enqueue_follow_up(
        &self,
        task_id: &str,
        prompt: &str,
        project_file_refs: &[String],
        instructions: Option<&str>,
        model: Option<&str>,
    ) -> Result<Vec<WorkFollowUp>, WorkError> {
        let task = self.load_task(task_id)?;
        if task.active_run_id.is_none() || is_terminal_task_status(&task.status) {
            return Err(persistence_error(
                "work_follow_up_requires_active_run",
                "WORK follow-ups may only be queued while the task has an active run.",
            ));
        }
        validate_follow_up_content(prompt, project_file_refs, instructions, model)?;
        let mut items = self.load_follow_ups(task_id)?;
        if items.len() >= MAX_FOLLOW_UPS_PER_TASK {
            return Err(persistence_error(
                "work_follow_up_queue_full",
                "WORK follow-up queue may contain at most 32 items.",
            ));
        }
        let now = now_unix_seconds();
        items.push(WorkFollowUp {
            schema_version: WORK_SCHEMA_VERSION,
            follow_up_id: format!("follow-up-{}", uuid::Uuid::new_v4().simple()),
            task_id: task_id.into(),
            prompt: prompt.into(),
            project_file_refs: project_file_refs.to_vec(),
            instructions: instructions.map(str::to_string),
            model: model.map(str::to_string),
            status: WorkFollowUpStatus::Queued,
            attempt_id: None,
            created_at: now,
            updated_at: now,
            last_error: None,
        });
        self.write_follow_ups(task_id, &items)?;
        Ok(items)
    }

    pub(crate) fn edit_follow_up(
        &self,
        task_id: &str,
        follow_up_id: &str,
        prompt: &str,
        project_file_refs: &[String],
        instructions: Option<&str>,
        model: Option<&str>,
    ) -> Result<Vec<WorkFollowUp>, WorkError> {
        validate_store_id("follow-up id", follow_up_id)?;
        validate_follow_up_content(prompt, project_file_refs, instructions, model)?;
        let mut items = self.load_follow_ups(task_id)?;
        let item = items
            .iter_mut()
            .find(|item| item.follow_up_id == follow_up_id)
            .ok_or_else(|| {
                persistence_error(
                    "work_follow_up_not_found",
                    "WORK follow-up queue item was not found.",
                )
            })?;
        if item.status == WorkFollowUpStatus::Starting {
            return Err(persistence_error(
                "work_follow_up_already_starting",
                "WORK follow-up cannot be edited after run creation has started.",
            ));
        }
        item.prompt = prompt.into();
        item.project_file_refs = project_file_refs.to_vec();
        item.instructions = instructions.map(str::to_string);
        item.model = model.map(str::to_string);
        item.status = WorkFollowUpStatus::Queued;
        item.attempt_id = None;
        item.updated_at = now_unix_seconds().max(item.updated_at);
        item.last_error = None;
        self.write_follow_ups(task_id, &items)?;
        Ok(items)
    }

    pub(crate) fn cancel_follow_up(
        &self,
        task_id: &str,
        follow_up_id: &str,
    ) -> Result<Vec<WorkFollowUp>, WorkError> {
        validate_store_id("follow-up id", follow_up_id)?;
        let mut items = self.load_follow_ups(task_id)?;
        let item = items
            .iter()
            .find(|item| item.follow_up_id == follow_up_id)
            .ok_or_else(|| {
                persistence_error(
                    "work_follow_up_not_found",
                    "WORK follow-up queue item was not found.",
                )
            })?;
        if item.status == WorkFollowUpStatus::Starting {
            return Err(persistence_error(
                "work_follow_up_already_starting",
                "WORK follow-up cannot be cancelled after run creation has started.",
            ));
        }
        items.retain(|item| item.follow_up_id != follow_up_id);
        self.write_follow_ups(task_id, &items)?;
        Ok(items)
    }

    pub(crate) fn retry_follow_up(
        &self,
        task_id: &str,
        follow_up_id: &str,
    ) -> Result<Vec<WorkFollowUp>, WorkError> {
        validate_store_id("follow-up id", follow_up_id)?;
        let mut items = self.load_follow_ups(task_id)?;
        let item = items
            .iter_mut()
            .find(|item| item.follow_up_id == follow_up_id)
            .ok_or_else(|| {
                persistence_error(
                    "work_follow_up_not_found",
                    "WORK follow-up queue item was not found.",
                )
            })?;
        if item.status != WorkFollowUpStatus::Failed {
            return Err(persistence_error(
                "work_follow_up_not_failed",
                "Only a failed WORK follow-up may be retried.",
            ));
        }
        if item
            .last_error
            .as_ref()
            .is_some_and(|error| !error.retryable)
        {
            return Err(persistence_error(
                "work_follow_up_not_retryable",
                "This WORK follow-up failure is not retryable.",
            ));
        }
        item.status = WorkFollowUpStatus::Queued;
        item.attempt_id = None;
        item.updated_at = now_unix_seconds().max(item.updated_at);
        item.last_error = None;
        self.write_follow_ups(task_id, &items)?;
        Ok(items)
    }

    pub(crate) fn claim_next_follow_up(
        &self,
        task_id: &str,
    ) -> Result<Option<WorkFollowUp>, WorkError> {
        let task = self.load_task(task_id)?;
        if task.active_run_id.is_some() || !is_terminal_task_status(&task.status) {
            return Ok(None);
        }
        let mut items = self.load_follow_ups(task_id)?;
        let Some(item) = items.first_mut() else {
            return Ok(None);
        };
        match item.status {
            WorkFollowUpStatus::Failed => return Ok(None),
            WorkFollowUpStatus::Starting => {
                return Err(persistence_error(
                    "work_follow_up_start_already_in_progress",
                    "A WORK follow-up run creation is already in progress.",
                ));
            }
            WorkFollowUpStatus::Queued => {}
        }
        item.status = WorkFollowUpStatus::Starting;
        item.attempt_id = Some(format!("attempt-{}", uuid::Uuid::new_v4().simple()));
        item.updated_at = now_unix_seconds().max(item.updated_at);
        let claimed = item.clone();
        self.write_follow_ups(task_id, &items)?;
        Ok(Some(claimed))
    }

    pub(crate) fn complete_follow_up_claim(
        &self,
        task_id: &str,
        follow_up_id: &str,
        attempt_id: &str,
    ) -> Result<Vec<WorkFollowUp>, WorkError> {
        validate_store_id("follow-up id", follow_up_id)?;
        validate_store_id("follow-up attempt id", attempt_id)?;
        let mut items = self.load_follow_ups(task_id)?;
        let item = matching_starting_follow_up(&items, follow_up_id, attempt_id)?;
        let completed_id = item.follow_up_id.clone();
        items.retain(|item| item.follow_up_id != completed_id);
        self.write_follow_ups(task_id, &items)?;
        Ok(items)
    }

    pub(crate) fn fail_follow_up_claim(
        &self,
        task_id: &str,
        follow_up_id: &str,
        attempt_id: &str,
        error: &WorkError,
    ) -> Result<Vec<WorkFollowUp>, WorkError> {
        validate_store_id("follow-up id", follow_up_id)?;
        validate_store_id("follow-up attempt id", attempt_id)?;
        let mut items = self.load_follow_ups(task_id)?;
        let item = items
            .iter_mut()
            .find(|item| {
                item.follow_up_id == follow_up_id
                    && item.attempt_id.as_deref() == Some(attempt_id)
                    && item.status == WorkFollowUpStatus::Starting
            })
            .ok_or_else(|| {
                persistence_error(
                    "work_follow_up_claim_mismatch",
                    "WORK follow-up claim identity no longer matches.",
                )
            })?;
        item.status = WorkFollowUpStatus::Failed;
        item.attempt_id = None;
        item.updated_at = now_unix_seconds().max(item.updated_at);
        item.last_error = Some(sanitize_follow_up_error(error));
        self.write_follow_ups(task_id, &items)?;
        Ok(items)
    }

    pub(crate) fn audit_interrupted_follow_ups(&self) -> Result<usize, WorkError> {
        let tasks = self.load_tasks()?;
        let mut interrupted = 0;
        for task in tasks {
            let mut items = self.load_follow_ups(&task.task_id)?;
            let dispatched = self
                .load_events(&task.task_id)?
                .into_iter()
                .filter_map(|event| match event.kind {
                    WorkEventKind::UserMessageAdded {
                        source_follow_up_id: Some(follow_up_id),
                        ..
                    } => Some(follow_up_id),
                    _ => None,
                })
                .collect::<std::collections::HashSet<_>>();
            let previous_len = items.len();
            items.retain(|item| {
                !(item.status == WorkFollowUpStatus::Starting
                    && dispatched.contains(&item.follow_up_id))
            });
            let mut changed = items.len() != previous_len;
            for item in &mut items {
                if item.status == WorkFollowUpStatus::Starting {
                    item.status = WorkFollowUpStatus::Failed;
                    item.attempt_id = None;
                    item.updated_at = now_unix_seconds().max(item.updated_at);
                    item.last_error = Some(interrupted_follow_up_error());
                    interrupted += 1;
                    changed = true;
                }
            }
            if changed {
                self.write_follow_ups(&task.task_id, &items)?;
            }
        }
        Ok(interrupted)
    }

    pub(crate) fn fail_follow_ups_for_deactivation(
        &self,
        task_id: &str,
    ) -> Result<Vec<WorkFollowUp>, WorkError> {
        let mut items = self.load_follow_ups(task_id)?;
        let mut changed = false;
        for item in &mut items {
            if item.status != WorkFollowUpStatus::Failed {
                item.status = WorkFollowUpStatus::Failed;
                item.attempt_id = None;
                item.updated_at = now_unix_seconds().max(item.updated_at);
                item.last_error = Some(WorkError {
                    kind: WorkErrorKind::Cancelled,
                    code: "workbench_deactivated".into(),
                    message: "WORK follow-up was cancelled because the workbench was deactivated."
                        .into(),
                    retryable: false,
                    http_status: None,
                    request_id: None,
                    details: BTreeMap::new(),
                });
                changed = true;
            }
        }
        if changed {
            self.write_follow_ups(task_id, &items)?;
        }
        Ok(items)
    }

    pub(crate) fn set_run_status(
        &self,
        task_id: &str,
        run_id: &str,
        status: WorkTaskStatus,
    ) -> Result<WorkTask, WorkError> {
        validate_store_id("task id", task_id)?;
        validate_store_id("run id", run_id)?;
        let mut tasks = self.load_tasks()?;
        let task = tasks
            .iter_mut()
            .find(|task| task.task_id == task_id)
            .ok_or_else(|| persistence_error("work_task_not_found", "WORK task was not found."))?;
        if task.active_run_id.as_deref() != Some(run_id) {
            return Err(persistence_error(
                "work_task_run_mismatch",
                "WORK task active run changed before the status update.",
            ));
        }
        task.status = status;
        task.updated_at = now_unix_seconds().max(task.updated_at);
        let result = task.clone();
        sort_tasks(&mut tasks);
        self.write_snapshot(&tasks)?;
        Ok(result)
    }

    pub(crate) fn cancel_run_for_deactivation(
        &self,
        task_id: &str,
        activation_id: &str,
        run_id: &str,
    ) -> Result<WorkTask, WorkError> {
        validate_store_id("task id", task_id)?;
        validate_store_id("activation id", activation_id)?;
        validate_store_id("run id", run_id)?;
        let mut tasks = self.load_tasks()?;
        let task = tasks
            .iter_mut()
            .find(|task| task.task_id == task_id)
            .ok_or_else(|| persistence_error("work_task_not_found", "WORK task was not found."))?;
        if task.activation_id.as_deref() != Some(activation_id)
            || task.active_run_id.as_deref() != Some(run_id)
        {
            return Err(persistence_error(
                "work_task_deactivation_identity_mismatch",
                "WORK task activation or active run changed during deactivation.",
            ));
        }
        task.active_run_id = None;
        task.status = WorkTaskStatus::Cancelled;
        task.updated_at = now_unix_seconds().max(task.updated_at);
        task.recovery.insert(
            "source".into(),
            Value::String("workbenchDeactivation".into()),
        );
        task.recovery.insert(
            "upstreamStatus".into(),
            Value::String("runtimeStopped".into()),
        );
        task.recovery
            .insert("auditedAt".into(), Value::from(now_unix_seconds()));
        task.recovery.remove("lastError");
        let result = task.clone();
        sort_tasks(&mut tasks);
        self.write_snapshot(&tasks)?;
        Ok(result)
    }

    pub(crate) fn remove_task_metadata(&self, task_id: &str) -> Result<bool, WorkError> {
        validate_store_id("task id", task_id)?;
        let mut tasks = self.load_tasks()?;
        let previous_len = tasks.len();
        tasks.retain(|task| task.task_id != task_id);
        let removed_snapshot = tasks.len() != previous_len;
        if removed_snapshot {
            self.write_snapshot(&tasks)?;
        }
        let journal = self.event_journal_path(task_id)?;
        let mut removed_journal = false;
        if journal.exists() {
            reject_symlink(&journal)?;
            fs::remove_file(journal).map_err(|error| {
                persistence_error(
                    "work_event_journal_remove_failed",
                    &format!("Unable to remove WORK event journal: {error}"),
                )
            })?;
            removed_journal = true;
        }
        let follow_ups = self.follow_up_queue_path(task_id)?;
        let mut removed_follow_ups = false;
        if follow_ups.exists() {
            reject_symlink(&follow_ups)?;
            fs::remove_file(follow_ups).map_err(|error| {
                persistence_error(
                    "work_follow_up_queue_remove_failed",
                    &format!("Unable to remove WORK follow-up queue: {error}"),
                )
            })?;
            removed_follow_ups = true;
        }
        Ok(removed_snapshot || removed_journal || removed_follow_ups)
    }

    pub(crate) fn load_events(&self, task_id: &str) -> Result<Vec<WorkEvent>, WorkError> {
        let path = self.event_journal_path(task_id)?;
        if !path.exists() {
            return Ok(Vec::new());
        }
        reject_symlink(&path)?;
        let file = File::open(&path).map_err(|error| {
            persistence_error(
                "work_event_journal_read_failed",
                &format!("Unable to open WORK event journal: {error}"),
            )
        })?;
        let mut reader = BufReader::new(file);
        let mut line = Vec::new();
        let mut events = Vec::new();
        let mut by_id = HashMap::<String, WorkEvent>::new();
        let mut last_sequence = 0;
        loop {
            line.clear();
            let read = reader.read_until(b'\n', &mut line).map_err(|error| {
                persistence_error(
                    "work_event_journal_read_failed",
                    &format!("Unable to read WORK event journal: {error}"),
                )
            })?;
            if read == 0 {
                break;
            }
            if line.len() > MAX_JOURNAL_EVENT_BYTES {
                return Err(persistence_error(
                    "work_event_journal_line_too_large",
                    "WORK event journal line exceeded 4 MiB.",
                ));
            }
            let terminated = line.last() == Some(&b'\n');
            while line
                .last()
                .is_some_and(|byte| matches!(byte, b'\n' | b'\r'))
            {
                line.pop();
            }
            if line.is_empty() {
                continue;
            }
            let event = match serde_json::from_slice::<WorkEvent>(&line) {
                Ok(event) => event,
                Err(_) if !terminated => break,
                Err(error) => {
                    return Err(persistence_error(
                        "work_event_journal_invalid",
                        &format!("WORK event journal contains invalid JSON: {error}"),
                    ));
                }
            };
            validate_event(task_id, &event)?;
            if let Some(existing) = by_id.get(&event.event_id) {
                if events_semantically_equal(existing, &event) {
                    continue;
                }
                return Err(persistence_error(
                    "work_event_id_conflict",
                    "WORK event journal contains conflicting events with the same event id.",
                ));
            }
            if event.sequence <= last_sequence {
                return Err(persistence_error(
                    "work_event_sequence_conflict",
                    "WORK event journal contains duplicate or decreasing sequence numbers.",
                ));
            }
            last_sequence = event.sequence;
            by_id.insert(event.event_id.clone(), event.clone());
            events.push(event);
        }
        Ok(events)
    }

    pub(crate) fn append_events(
        &self,
        task_id: &str,
        incoming: &[WorkEvent],
    ) -> Result<WorkEventAppendResult, WorkError> {
        if incoming.len() > MAX_APPEND_EVENTS {
            return Err(persistence_error(
                "work_event_batch_too_large",
                "WORK event append batch exceeded 1024 events.",
            ));
        }
        let mut tasks = self.load_tasks()?;
        let task_index = tasks
            .iter()
            .position(|task| task.task_id == task_id)
            .ok_or_else(|| {
                persistence_error(
                    "work_task_not_found",
                    "WORK task metadata must exist before appending events.",
                )
            })?;
        let existing = self.load_events(task_id)?;
        let mut by_id = existing
            .iter()
            .cloned()
            .map(|event| (event.event_id.clone(), event))
            .collect::<HashMap<_, _>>();
        let mut last_sequence = existing.last().map(|event| event.sequence).unwrap_or(0);
        let mut appended = Vec::new();
        let mut skipped_duplicates = 0;
        for event in incoming {
            validate_event(task_id, event)?;
            if let Some(existing) = by_id.get(&event.event_id) {
                if events_semantically_equal(existing, event) {
                    skipped_duplicates += 1;
                    continue;
                }
                return Err(persistence_error(
                    "work_event_id_conflict",
                    "WORK event id already exists with different content.",
                ));
            }
            if event.sequence <= last_sequence {
                return Err(persistence_error(
                    "work_event_sequence_out_of_order",
                    "New WORK events must have strictly increasing sequence numbers.",
                ));
            }
            last_sequence = event.sequence;
            by_id.insert(event.event_id.clone(), event.clone());
            appended.push(event.clone());
        }

        if !appended.is_empty() {
            self.append_journal_lines(task_id, &appended)?;
            let task = &mut tasks[task_index];
            for event in &appended {
                apply_event_to_task(task, event);
            }
            sort_tasks(&mut tasks);
            self.write_snapshot(&tasks)?;
        }
        let task = tasks
            .into_iter()
            .find(|task| task.task_id == task_id)
            .expect("task exists after append");
        Ok(WorkEventAppendResult {
            task,
            appended: appended.len(),
            skipped_duplicates,
            appended_events: appended,
        })
    }

    pub(crate) fn audit_local_recovery(&self) -> Result<Vec<WorkRecoveryRecord>, WorkError> {
        let mut tasks = self.load_tasks()?;
        let mut records = Vec::with_capacity(tasks.len());
        let mut changed = false;
        for task in &mut tasks {
            let audited_at = now_unix_seconds();
            let events = self.load_events(&task.task_id)?;
            let previous = task.clone();
            for event in &events {
                apply_event_to_task(task, event);
            }
            let disposition = recovery_disposition(task, &events);
            let previous_disposition = task.recovery.insert(
                "disposition".into(),
                serde_json::to_value(&disposition).unwrap_or(Value::String("unchanged".into())),
            );
            let disposition_changed =
                previous_disposition.as_ref() != task.recovery.get("disposition");
            if disposition_changed
                || task.status != previous.status
                || task.last_event_sequence != previous.last_event_sequence
            {
                task.recovery
                    .insert("auditedAt".into(), Value::from(audited_at));
            }
            if *task != previous {
                changed = true;
            }
            records.push(WorkRecoveryRecord {
                task_id: task.task_id.clone(),
                disposition,
                last_event_sequence: task.last_event_sequence,
            });
        }
        if changed {
            self.write_snapshot(&tasks)?;
        }
        Ok(records)
    }

    pub(crate) fn remote_recovery_candidates(&self) -> Result<Vec<WorkTask>, WorkError> {
        Ok(self
            .load_tasks()?
            .into_iter()
            .filter(|task| {
                task.active_run_id.is_some()
                    && !matches!(
                        task.status,
                        WorkTaskStatus::Completed
                            | WorkTaskStatus::Failed
                            | WorkTaskStatus::Cancelled
                    )
            })
            .collect())
    }

    pub(crate) fn reconcile_remote_status(
        &self,
        task_id: &str,
        expected_run_id: &str,
        status: &HermesRunStatus,
    ) -> Result<WorkRecoveryRecord, WorkError> {
        validate_store_id("task id", task_id)?;
        validate_store_id("run id", expected_run_id)?;
        let mut tasks = self.load_tasks()?;
        let task = tasks
            .iter_mut()
            .find(|task| task.task_id == task_id)
            .ok_or_else(|| persistence_error("work_task_not_found", "WORK task was not found."))?;
        if task.active_run_id.as_deref() != Some(expected_run_id) {
            return Ok(recovery_record(task, WorkRecoveryDisposition::Unchanged));
        }
        if status.run_id != expected_run_id {
            return self.persist_remote_identity_failure(
                tasks,
                task_id,
                "hermes_recovery_run_mismatch",
                "Hermes returned a different run id during recovery.",
            );
        }
        if let (Some(expected), Some(actual)) = (
            task.hermes_session_id.as_deref(),
            status.session_id.as_deref(),
        ) {
            if expected != actual {
                return self.persist_remote_identity_failure(
                    tasks,
                    task_id,
                    "hermes_recovery_session_mismatch",
                    "Hermes returned a different session id during recovery.",
                );
            }
        }
        if task.hermes_session_id.is_none() {
            task.hermes_session_id = status.session_id.clone();
        }
        let (task_status, disposition, terminal) = map_remote_run_status(&status.status);
        task.status = task_status;
        if terminal {
            task.active_run_id = None;
        }
        if status.updated_at.is_finite() && status.updated_at >= 0.0 {
            task.updated_at = task.updated_at.max(status.updated_at);
        }
        task.recovery
            .insert("source".into(), Value::String("remoteRunStatus".into()));
        task.recovery.insert(
            "upstreamStatus".into(),
            Value::String(bounded_recovery_value(&status.status)),
        );
        task.recovery
            .insert("auditedAt".into(), Value::from(now_unix_seconds()));
        task.recovery.remove("lastError");
        let record = recovery_record(task, disposition);
        sort_tasks(&mut tasks);
        self.write_snapshot(&tasks)?;
        Ok(record)
    }

    pub(crate) fn reconcile_remote_error(
        &self,
        task_id: &str,
        expected_run_id: &str,
        error: &WorkError,
    ) -> Result<WorkRecoveryRecord, WorkError> {
        validate_store_id("task id", task_id)?;
        validate_store_id("run id", expected_run_id)?;
        let mut tasks = self.load_tasks()?;
        let task = tasks
            .iter_mut()
            .find(|task| task.task_id == task_id)
            .ok_or_else(|| persistence_error("work_task_not_found", "WORK task was not found."))?;
        if task.active_run_id.as_deref() != Some(expected_run_id) {
            return Ok(recovery_record(task, WorkRecoveryDisposition::Unchanged));
        }
        let missing = error.http_status == Some(404);
        task.status = if missing {
            WorkTaskStatus::Orphaned
        } else {
            WorkTaskStatus::Degraded
        };
        task.recovery
            .insert("source".into(), Value::String("remoteRunStatus".into()));
        task.recovery.insert(
            "upstreamStatus".into(),
            Value::String(if missing { "missing" } else { "unavailable" }.into()),
        );
        task.recovery.insert(
            "lastError".into(),
            serde_json::json!({
                "kind": error.kind,
                "code": bounded_recovery_value(&error.code),
                "retryable": error.retryable,
                "httpStatus": error.http_status,
            }),
        );
        task.recovery
            .insert("auditedAt".into(), Value::from(now_unix_seconds()));
        let disposition = if missing {
            WorkRecoveryDisposition::Orphaned
        } else {
            WorkRecoveryDisposition::Resumable
        };
        let record = recovery_record(task, disposition);
        sort_tasks(&mut tasks);
        self.write_snapshot(&tasks)?;
        Ok(record)
    }

    fn persist_remote_identity_failure(
        &self,
        mut tasks: Vec<WorkTask>,
        task_id: &str,
        code: &str,
        message: &str,
    ) -> Result<WorkRecoveryRecord, WorkError> {
        let task = tasks
            .iter_mut()
            .find(|task| task.task_id == task_id)
            .expect("task exists during recovery identity failure");
        task.status = WorkTaskStatus::Orphaned;
        task.recovery
            .insert("source".into(), Value::String("remoteRunStatus".into()));
        task.recovery.insert(
            "lastError".into(),
            serde_json::json!({
                "kind": WorkErrorKind::Persistence,
                "code": code,
                "retryable": false,
            }),
        );
        task.recovery
            .insert("auditedAt".into(), Value::from(now_unix_seconds()));
        let record = recovery_record(task, WorkRecoveryDisposition::Orphaned);
        sort_tasks(&mut tasks);
        self.write_snapshot(&tasks).map_err(|mut error| {
            error.message = format!("{message} Snapshot update also failed: {}", error.message);
            error
        })?;
        Ok(record)
    }

    fn event_journal_path(&self, task_id: &str) -> Result<PathBuf, WorkError> {
        validate_store_id("task id", task_id)?;
        Ok(self.paths.events.join(format!("{task_id}.ndjson")))
    }

    fn follow_up_queue_path(&self, task_id: &str) -> Result<PathBuf, WorkError> {
        validate_store_id("task id", task_id)?;
        Ok(self.paths.follow_ups.join(format!("{task_id}.v1.json")))
    }

    fn write_follow_ups(&self, task_id: &str, items: &[WorkFollowUp]) -> Result<(), WorkError> {
        self.ensure_root()?;
        validate_follow_ups(task_id, items)?;
        let envelope = FollowUpQueueEnvelope {
            schema_version: FOLLOW_UP_QUEUE_SCHEMA_VERSION,
            task_id: task_id.into(),
            items: items.to_vec(),
        };
        let bytes = serde_json::to_vec_pretty(&envelope).map_err(|error| {
            persistence_error(
                "work_follow_up_queue_serialize_failed",
                &format!("Unable to serialize WORK follow-up queue: {error}"),
            )
        })?;
        atomic_write(&self.follow_up_queue_path(task_id)?, &bytes)
            .map_err(|message| persistence_error("work_follow_up_queue_write_failed", &message))
    }

    fn append_journal_lines(&self, task_id: &str, events: &[WorkEvent]) -> Result<(), WorkError> {
        self.ensure_root()?;
        let path = self.event_journal_path(task_id)?;
        if path.exists() {
            reject_symlink(&path)?;
            repair_journal_tail(&path, task_id)?;
        }
        let mut body = Vec::new();
        for event in events {
            let line = serde_json::to_vec(event).map_err(|error| {
                persistence_error(
                    "work_event_serialize_failed",
                    &format!("Unable to serialize WORK event: {error}"),
                )
            })?;
            if line.len() > MAX_JOURNAL_EVENT_BYTES {
                return Err(persistence_error(
                    "work_event_journal_line_too_large",
                    "WORK event exceeded the 4 MiB journal line limit.",
                ));
            }
            body.extend_from_slice(&line);
            body.push(b'\n');
        }
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|error| {
                persistence_error(
                    "work_event_journal_append_failed",
                    &format!("Unable to append WORK event journal: {error}"),
                )
            })?;
        tighten_file_permissions(&path).map_err(|message| {
            persistence_error("work_event_journal_permissions_failed", &message)
        })?;
        file.write_all(&body).map_err(|error| {
            persistence_error(
                "work_event_journal_append_failed",
                &format!("Unable to append WORK event journal: {error}"),
            )
        })?;
        file.flush().map_err(|error| {
            persistence_error(
                "work_event_journal_flush_failed",
                &format!("Unable to flush WORK event journal: {error}"),
            )
        })?;
        file.sync_data().map_err(|error| {
            persistence_error(
                "work_event_journal_sync_failed",
                &format!("Unable to sync WORK event journal: {error}"),
            )
        })
    }

    fn write_snapshot(&self, tasks: &[WorkTask]) -> Result<(), WorkError> {
        self.ensure_root()?;
        validate_tasks(tasks)?;
        let snapshot = TaskSnapshot {
            schema_version: TASK_SNAPSHOT_SCHEMA_VERSION,
            tasks: tasks.to_vec(),
        };
        let bytes = serde_json::to_vec_pretty(&snapshot).map_err(|error| {
            persistence_error(
                "work_task_snapshot_serialize_failed",
                &format!("Unable to serialize WORK task snapshot: {error}"),
            )
        })?;
        atomic_write(&self.paths.snapshot, &bytes)
            .map_err(|message| persistence_error("work_task_snapshot_write_failed", &message))
    }

    fn ensure_root(&self) -> Result<(), WorkError> {
        if self.paths.root.exists() {
            reject_symlink(&self.paths.root)?;
        }
        fs::create_dir_all(&self.paths.events).map_err(|error| {
            persistence_error(
                "work_task_store_create_failed",
                &format!("Unable to create WORK task store: {error}"),
            )
        })?;
        fs::create_dir_all(&self.paths.follow_ups).map_err(|error| {
            persistence_error(
                "work_task_store_create_failed",
                &format!("Unable to create WORK follow-up store: {error}"),
            )
        })?;
        reject_symlink(&self.paths.events)?;
        reject_symlink(&self.paths.follow_ups)
    }
}

fn parse_snapshot(value: Value) -> Result<(TaskSnapshot, bool), WorkError> {
    if value.is_array() {
        let tasks = serde_json::from_value::<Vec<WorkTask>>(value).map_err(|error| {
            persistence_error(
                "work_task_snapshot_invalid",
                &format!("Legacy WORK task snapshot is invalid: {error}"),
            )
        })?;
        return Ok((
            TaskSnapshot {
                schema_version: 1,
                tasks,
            },
            true,
        ));
    }
    let schema = value
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .or_else(|| value.get("schema_version").and_then(Value::as_u64));
    if schema.is_none() && value.get("tasks").is_some() {
        let tasks =
            serde_json::from_value::<Vec<WorkTask>>(value["tasks"].clone()).map_err(|error| {
                persistence_error(
                    "work_task_snapshot_invalid",
                    &format!("Legacy WORK task snapshot is invalid: {error}"),
                )
            })?;
        return Ok((
            TaskSnapshot {
                schema_version: 1,
                tasks,
            },
            true,
        ));
    }
    let snapshot = serde_json::from_value::<TaskSnapshot>(value).map_err(|error| {
        persistence_error(
            "work_task_snapshot_invalid",
            &format!("WORK task snapshot has an invalid schema: {error}"),
        )
    })?;
    if snapshot.schema_version != TASK_SNAPSHOT_SCHEMA_VERSION {
        return Err(persistence_error(
            "work_task_snapshot_version_unsupported",
            "WORK task snapshot schema version is unsupported.",
        ));
    }
    Ok((snapshot, false))
}

fn repair_journal_tail(path: &Path, task_id: &str) -> Result<(), WorkError> {
    let mut file = OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .map_err(|error| {
            persistence_error(
                "work_event_journal_repair_failed",
                &format!("Unable to inspect WORK event journal tail: {error}"),
            )
        })?;
    let length = file
        .metadata()
        .map_err(|error| {
            persistence_error(
                "work_event_journal_repair_failed",
                &format!("Unable to inspect WORK event journal metadata: {error}"),
            )
        })?
        .len();
    if length == 0 {
        return Ok(());
    }
    file.seek(SeekFrom::End(-1)).map_err(|error| {
        persistence_error(
            "work_event_journal_repair_failed",
            &format!("Unable to inspect WORK event journal tail: {error}"),
        )
    })?;
    let mut last = [0_u8; 1];
    file.read_exact(&mut last).map_err(|error| {
        persistence_error(
            "work_event_journal_repair_failed",
            &format!("Unable to inspect WORK event journal tail: {error}"),
        )
    })?;
    if last[0] == b'\n' {
        return Ok(());
    }

    let window = length.min((MAX_JOURNAL_EVENT_BYTES + 1) as u64) as usize;
    file.seek(SeekFrom::Start(length - window as u64))
        .map_err(|error| {
            persistence_error(
                "work_event_journal_repair_failed",
                &format!("Unable to seek WORK event journal tail: {error}"),
            )
        })?;
    let mut bytes = vec![0_u8; window];
    file.read_exact(&mut bytes).map_err(|error| {
        persistence_error(
            "work_event_journal_repair_failed",
            &format!("Unable to read WORK event journal tail: {error}"),
        )
    })?;
    let tail_start = bytes
        .iter()
        .rposition(|byte| *byte == b'\n')
        .map(|index| index + 1)
        .unwrap_or(0);
    if tail_start == 0 && length > window as u64 {
        return Err(persistence_error(
            "work_event_journal_line_too_large",
            "WORK event journal tail exceeded 4 MiB.",
        ));
    }
    let absolute_tail_start = length - window as u64 + tail_start as u64;
    let tail = &bytes[tail_start..];
    let complete = serde_json::from_slice::<WorkEvent>(tail)
        .ok()
        .and_then(|event| validate_event(task_id, &event).ok())
        .is_some();
    if complete {
        file.seek(SeekFrom::End(0)).map_err(|error| {
            persistence_error(
                "work_event_journal_repair_failed",
                &format!("Unable to seek WORK event journal tail: {error}"),
            )
        })?;
        file.write_all(b"\n").map_err(|error| {
            persistence_error(
                "work_event_journal_repair_failed",
                &format!("Unable to terminate WORK event journal line: {error}"),
            )
        })?;
    } else {
        file.set_len(absolute_tail_start).map_err(|error| {
            persistence_error(
                "work_event_journal_repair_failed",
                &format!("Unable to truncate incomplete WORK event journal tail: {error}"),
            )
        })?;
    }
    file.sync_data().map_err(|error| {
        persistence_error(
            "work_event_journal_repair_failed",
            &format!("Unable to sync repaired WORK event journal: {error}"),
        )
    })
}

fn validate_tasks(tasks: &[WorkTask]) -> Result<(), WorkError> {
    let mut ids = HashMap::<&str, ()>::new();
    for task in tasks {
        validate_task(task)?;
        if ids.insert(task.task_id.as_str(), ()).is_some() {
            return Err(persistence_error(
                "duplicate_work_task_id",
                "WORK task snapshot contains duplicate task ids.",
            ));
        }
    }
    Ok(())
}

fn validate_follow_ups(task_id: &str, items: &[WorkFollowUp]) -> Result<(), WorkError> {
    if items.len() > MAX_FOLLOW_UPS_PER_TASK {
        return Err(persistence_error(
            "work_follow_up_queue_full",
            "WORK follow-up queue may contain at most 32 items.",
        ));
    }
    let mut ids = HashMap::<&str, ()>::new();
    let mut starting = 0;
    for item in items {
        if item.schema_version != WORK_SCHEMA_VERSION || item.task_id != task_id {
            return Err(persistence_error(
                "work_follow_up_invalid",
                "WORK follow-up schema or task identity is invalid.",
            ));
        }
        validate_store_id("follow-up id", &item.follow_up_id)?;
        if ids.insert(item.follow_up_id.as_str(), ()).is_some() {
            return Err(persistence_error(
                "work_follow_up_duplicate_id",
                "WORK follow-up queue contains duplicate ids.",
            ));
        }
        validate_follow_up_content(
            &item.prompt,
            &item.project_file_refs,
            item.instructions.as_deref(),
            item.model.as_deref(),
        )?;
        if !item.created_at.is_finite()
            || !item.updated_at.is_finite()
            || item.created_at < 0.0
            || item.updated_at < item.created_at
        {
            return Err(persistence_error(
                "work_follow_up_timestamp_invalid",
                "WORK follow-up timestamps are invalid.",
            ));
        }
        match item.status {
            WorkFollowUpStatus::Starting => {
                starting += 1;
                let attempt_id = item.attempt_id.as_deref().ok_or_else(|| {
                    persistence_error(
                        "work_follow_up_attempt_missing",
                        "Starting WORK follow-up has no attempt identity.",
                    )
                })?;
                validate_store_id("follow-up attempt id", attempt_id)?;
                if item.last_error.is_some() {
                    return Err(persistence_error(
                        "work_follow_up_state_invalid",
                        "Starting WORK follow-up cannot retain an error.",
                    ));
                }
            }
            WorkFollowUpStatus::Queued => {
                if item.attempt_id.is_some() || item.last_error.is_some() {
                    return Err(persistence_error(
                        "work_follow_up_state_invalid",
                        "Queued WORK follow-up cannot retain attempt or error state.",
                    ));
                }
            }
            WorkFollowUpStatus::Failed => {
                if item.attempt_id.is_some() || item.last_error.is_none() {
                    return Err(persistence_error(
                        "work_follow_up_state_invalid",
                        "Failed WORK follow-up must retain one sanitized error and no attempt id.",
                    ));
                }
            }
        }
    }
    if starting > 1 {
        return Err(persistence_error(
            "work_follow_up_multiple_starting",
            "WORK follow-up queue may have at most one starting item.",
        ));
    }
    Ok(())
}

fn validate_follow_up_content(
    prompt: &str,
    project_file_refs: &[String],
    instructions: Option<&str>,
    model: Option<&str>,
) -> Result<(), WorkError> {
    validate_user_message(prompt, project_file_refs)?;
    if instructions.is_some_and(|value| {
        value.trim().is_empty() || value.chars().count() > 65_536 || value.contains('\0')
    }) {
        return Err(persistence_error(
            "work_follow_up_instructions_invalid",
            "WORK follow-up instructions must be non-empty and at most 65,536 characters.",
        ));
    }
    if model.is_some_and(|value| {
        value.trim().is_empty() || value.chars().count() > 256 || value.contains('\0')
    }) {
        return Err(persistence_error(
            "work_follow_up_model_invalid",
            "WORK follow-up model must be non-empty and at most 256 characters.",
        ));
    }
    Ok(())
}

fn matching_starting_follow_up<'a>(
    items: &'a [WorkFollowUp],
    follow_up_id: &str,
    attempt_id: &str,
) -> Result<&'a WorkFollowUp, WorkError> {
    items
        .iter()
        .find(|item| {
            item.follow_up_id == follow_up_id
                && item.attempt_id.as_deref() == Some(attempt_id)
                && item.status == WorkFollowUpStatus::Starting
        })
        .ok_or_else(|| {
            persistence_error(
                "work_follow_up_claim_mismatch",
                "WORK follow-up claim identity no longer matches.",
            )
        })
}

fn sanitize_follow_up_error(error: &WorkError) -> WorkError {
    WorkError {
        kind: error.kind.clone(),
        code: bounded_recovery_value(&error.code),
        message: "WORK follow-up run creation failed.".into(),
        retryable: error.retryable,
        http_status: error.http_status,
        request_id: error.request_id.clone(),
        details: BTreeMap::new(),
    }
}

fn interrupted_follow_up_error() -> WorkError {
    WorkError {
        kind: WorkErrorKind::Persistence,
        code: "work_follow_up_start_interrupted".into(),
        message: "WORK follow-up run creation was interrupted and was not replayed.".into(),
        retryable: true,
        http_status: None,
        request_id: None,
        details: BTreeMap::new(),
    }
}

fn is_terminal_task_status(status: &WorkTaskStatus) -> bool {
    matches!(
        status,
        WorkTaskStatus::Completed | WorkTaskStatus::Failed | WorkTaskStatus::Cancelled
    )
}

fn ensure_task_can_migrate(task: &WorkTask, source_activation_id: &str) -> Result<(), WorkError> {
    if task.activation_id.as_deref() != Some(source_activation_id) {
        return Err(persistence_error(
            "work_activation_migration_source_changed",
            "WORK task activation changed before migration commit.",
        ));
    }
    if task.active_run_id.is_some() || !is_terminal_task_status(&task.status) {
        return Err(persistence_error(
            "work_activation_migration_task_active",
            "WORK task must be terminal with no active run before activation migration.",
        ));
    }
    Ok(())
}

fn append_activation_migration(
    task: &mut WorkTask,
    migration: WorkActivationMigration,
) -> Result<(), WorkError> {
    if task.activation_migrations.len() >= MAX_ACTIVATION_MIGRATIONS_PER_TASK {
        return Err(persistence_error(
            "work_activation_migration_history_full",
            "WORK task activation migration history reached its bounded capacity.",
        ));
    }
    if task
        .activation_migrations
        .iter()
        .any(|entry| entry.migration_id == migration.migration_id)
    {
        return Err(persistence_error(
            "work_activation_migration_duplicate",
            "WORK task activation migration id already exists.",
        ));
    }
    task.activation_migrations.push(migration);
    Ok(())
}

fn validate_activation_migration(migration: &WorkActivationMigration) -> Result<(), WorkError> {
    validate_store_id("activation migration id", &migration.migration_id)?;
    validate_store_id("source activation id", &migration.source_activation_id)?;
    validate_store_id("target activation id", &migration.target_activation_id)?;
    if migration.source_activation_id == migration.target_activation_id {
        return Err(persistence_error(
            "work_activation_migration_same_generation",
            "WORK activation migration requires a different target generation.",
        ));
    }
    if !migration.timestamp.is_finite() || migration.timestamp <= 0.0 {
        return Err(persistence_error(
            "work_activation_migration_timestamp_invalid",
            "WORK activation migration timestamp is invalid.",
        ));
    }
    if let Some(code) = &migration.failure_code {
        validate_store_id("activation migration failure code", code)?;
    }
    match (&migration.status, &migration.failure_code) {
        (WorkActivationMigrationStatus::Completed, None)
        | (WorkActivationMigrationStatus::Failed, Some(_)) => Ok(()),
        _ => Err(persistence_error(
            "work_activation_migration_status_invalid",
            "WORK activation migration status and failure code are inconsistent.",
        )),
    }
}

fn validate_task(task: &WorkTask) -> Result<(), WorkError> {
    if task.schema_version != WORK_SCHEMA_VERSION {
        return Err(persistence_error(
            "work_task_schema_unsupported",
            "WORK task schema version is unsupported.",
        ));
    }
    validate_store_id("task id", &task.task_id)?;
    if let Some(activation_id) = &task.activation_id {
        validate_store_id("activation id", activation_id)?;
    }
    validate_non_empty("workbench id", &task.workbench_id)?;
    validate_non_empty("workbench version", &task.workbench_version)?;
    if !is_absolute_project_path(&task.project_path) {
        return Err(persistence_error(
            "work_task_project_path_invalid",
            "WORK task project path must be absolute.",
        ));
    }
    if !task.created_at.is_finite()
        || !task.updated_at.is_finite()
        || task.created_at < 0.0
        || task.updated_at < task.created_at
    {
        return Err(persistence_error(
            "work_task_timestamp_invalid",
            "WORK task timestamps are invalid.",
        ));
    }
    if let Some(session_id) = &task.hermes_session_id {
        validate_store_id("Hermes session id", session_id)?;
    }
    if let Some(run_id) = &task.active_run_id {
        validate_store_id("Hermes run id", run_id)?;
    }
    if task.activation_migrations.len() > MAX_ACTIVATION_MIGRATIONS_PER_TASK {
        return Err(persistence_error(
            "work_activation_migration_history_invalid",
            "WORK task activation migration history exceeds its bounded capacity.",
        ));
    }
    let mut migration_ids = std::collections::HashSet::new();
    let mut migration_generation: Option<&str> = None;
    let mut previous_migration_timestamp = 0.0_f64;
    for migration in &task.activation_migrations {
        validate_activation_migration(migration)?;
        if !migration_ids.insert(migration.migration_id.as_str()) {
            return Err(persistence_error(
                "work_activation_migration_duplicate",
                "WORK task activation migration ids must be unique.",
            ));
        }
        let expected_source =
            migration_generation.get_or_insert(migration.source_activation_id.as_str());
        if *expected_source != migration.source_activation_id {
            return Err(persistence_error(
                "work_activation_migration_chain_invalid",
                "WORK task activation migration history does not form a continuous generation chain.",
            ));
        }
        if migration.timestamp < previous_migration_timestamp {
            return Err(persistence_error(
                "work_activation_migration_order_invalid",
                "WORK task activation migration timestamps are out of order.",
            ));
        }
        previous_migration_timestamp = migration.timestamp;
        if migration.status == WorkActivationMigrationStatus::Completed {
            migration_generation = Some(migration.target_activation_id.as_str());
        }
    }
    if let Some(expected_activation_id) = migration_generation {
        if task.activation_id.as_deref() != Some(expected_activation_id)
            || task.updated_at < previous_migration_timestamp
        {
            return Err(persistence_error(
                "work_activation_migration_chain_invalid",
                "WORK task identity does not match its activation migration history.",
            ));
        }
    }
    Ok(())
}

fn validate_event(task_id: &str, event: &WorkEvent) -> Result<(), WorkError> {
    if event.schema_version != WORK_SCHEMA_VERSION {
        return Err(persistence_error(
            "work_event_schema_unsupported",
            "WORK event schema version is unsupported.",
        ));
    }
    if event.task_id != task_id {
        return Err(persistence_error(
            "work_event_task_mismatch",
            "WORK event belongs to a different task.",
        ));
    }
    validate_store_id("event id", &event.event_id)?;
    validate_store_id("run id", &event.run_id)?;
    if event.sequence == 0 || !event.timestamp.is_finite() || event.timestamp < 0.0 {
        return Err(persistence_error(
            "work_event_metadata_invalid",
            "WORK event sequence or timestamp is invalid.",
        ));
    }
    if let WorkEventKind::UserMessageAdded {
        text,
        project_file_refs,
        source_follow_up_id,
    } = &event.kind
    {
        validate_user_message(text, project_file_refs)?;
        if let Some(follow_up_id) = source_follow_up_id {
            validate_store_id("source follow-up id", follow_up_id)?;
        }
    }
    Ok(())
}

pub(crate) fn local_user_message_event_id(run_id: &str) -> String {
    format!("{run_id}:local-user-message")
}

fn validate_user_message(text: &str, project_file_refs: &[String]) -> Result<(), WorkError> {
    if text.trim().is_empty() || text.chars().count() > 1_048_576 || text.contains('\0') {
        return Err(persistence_error(
            "work_user_message_invalid",
            "WORK user message must be non-empty and at most 1,048,576 characters.",
        ));
    }
    if project_file_refs.len() > 16 {
        return Err(persistence_error(
            "work_user_message_file_refs_invalid",
            "WORK user message may reference at most 16 project files.",
        ));
    }
    let mut seen = HashMap::<&str, ()>::new();
    for path in project_file_refs {
        if !is_absolute_project_path(path) || seen.insert(path, ()).is_some() {
            return Err(persistence_error(
                "work_user_message_file_refs_invalid",
                "WORK user message file references must be unique absolute paths.",
            ));
        }
    }
    Ok(())
}

fn rollback_journal_append(path: &Path, previous_len: u64) -> Result<(), WorkError> {
    if !path.exists() {
        return Ok(());
    }
    reject_symlink(path)?;
    let file = OpenOptions::new().write(true).open(path).map_err(|error| {
        persistence_error(
            "work_event_journal_rollback_failed",
            &format!("Unable to open WORK event journal for rollback: {error}"),
        )
    })?;
    file.set_len(previous_len).map_err(|error| {
        persistence_error(
            "work_event_journal_rollback_failed",
            &format!("Unable to truncate WORK event journal during rollback: {error}"),
        )
    })?;
    file.sync_data().map_err(|error| {
        persistence_error(
            "work_event_journal_rollback_failed",
            &format!("Unable to sync WORK event journal rollback: {error}"),
        )
    })
}

fn events_semantically_equal(left: &WorkEvent, right: &WorkEvent) -> bool {
    let mut left = left.clone();
    let mut right = right.clone();
    left.sequence = 0;
    right.sequence = 0;
    left == right
}

fn apply_event_to_task(task: &mut WorkTask, event: &WorkEvent) {
    task.last_event_sequence = task.last_event_sequence.max(event.sequence);
    task.updated_at = task.updated_at.max(event.timestamp);
    match &event.kind {
        WorkEventKind::UserMessageAdded { .. } => {
            if task.hermes_session_id.is_none() {
                task.hermes_session_id = Some(event.run_id.clone());
            }
            task.active_run_id = Some(event.run_id.clone());
            task.status = WorkTaskStatus::Running;
            task.recovery.clear();
        }
        WorkEventKind::TaskStatusChanged { status } => {
            task.status = status.clone();
            if matches!(
                status,
                WorkTaskStatus::Completed | WorkTaskStatus::Failed | WorkTaskStatus::Cancelled
            ) {
                task.active_run_id = None;
            }
        }
        WorkEventKind::TaskFailed { .. } => {
            task.status = WorkTaskStatus::Failed;
            task.active_run_id = None;
        }
        _ => {}
    }
}

fn recovery_disposition(task: &mut WorkTask, events: &[WorkEvent]) -> WorkRecoveryDisposition {
    let terminal = events.iter().rev().find_map(|event| match &event.kind {
        WorkEventKind::TaskStatusChanged { status }
            if matches!(
                status,
                WorkTaskStatus::Completed | WorkTaskStatus::Failed | WorkTaskStatus::Cancelled
            ) =>
        {
            Some(status.clone())
        }
        WorkEventKind::TaskFailed { .. } => Some(WorkTaskStatus::Failed),
        _ => None,
    });
    match terminal.unwrap_or_else(|| task.status.clone()) {
        WorkTaskStatus::Completed => {
            task.status = WorkTaskStatus::Completed;
            task.active_run_id = None;
            WorkRecoveryDisposition::Completed
        }
        WorkTaskStatus::Failed => {
            task.status = WorkTaskStatus::Failed;
            task.active_run_id = None;
            WorkRecoveryDisposition::Failed
        }
        WorkTaskStatus::Cancelled => {
            task.status = WorkTaskStatus::Cancelled;
            task.active_run_id = None;
            WorkRecoveryDisposition::Cancelled
        }
        WorkTaskStatus::Running
        | WorkTaskStatus::WaitingForApproval
        | WorkTaskStatus::Stopping
        | WorkTaskStatus::Degraded => {
            if task.active_run_id.is_some() {
                task.status = WorkTaskStatus::Degraded;
                WorkRecoveryDisposition::Resumable
            } else {
                task.status = WorkTaskStatus::Orphaned;
                WorkRecoveryDisposition::Orphaned
            }
        }
        WorkTaskStatus::Orphaned => WorkRecoveryDisposition::Orphaned,
        WorkTaskStatus::Draft | WorkTaskStatus::Queued => WorkRecoveryDisposition::Unchanged,
    }
}

fn map_remote_run_status(status: &str) -> (WorkTaskStatus, WorkRecoveryDisposition, bool) {
    match status.trim().to_ascii_lowercase().as_str() {
        "completed" => (
            WorkTaskStatus::Completed,
            WorkRecoveryDisposition::Completed,
            true,
        ),
        "failed" => (
            WorkTaskStatus::Failed,
            WorkRecoveryDisposition::Failed,
            true,
        ),
        "cancelled" | "canceled" => (
            WorkTaskStatus::Cancelled,
            WorkRecoveryDisposition::Cancelled,
            true,
        ),
        "waiting_for_approval" | "requires_action" => (
            WorkTaskStatus::WaitingForApproval,
            WorkRecoveryDisposition::Resumable,
            false,
        ),
        "stopping" => (
            WorkTaskStatus::Stopping,
            WorkRecoveryDisposition::Resumable,
            false,
        ),
        "started" | "queued" | "pending" | "running" => (
            WorkTaskStatus::Running,
            WorkRecoveryDisposition::Resumable,
            false,
        ),
        _ => (
            WorkTaskStatus::Degraded,
            WorkRecoveryDisposition::Resumable,
            false,
        ),
    }
}

fn recovery_record(task: &WorkTask, disposition: WorkRecoveryDisposition) -> WorkRecoveryRecord {
    WorkRecoveryRecord {
        task_id: task.task_id.clone(),
        disposition,
        last_event_sequence: task.last_event_sequence,
    }
}

fn bounded_recovery_value(value: &str) -> String {
    value
        .chars()
        .filter(|character| !character.is_control())
        .take(240)
        .collect()
}

fn sort_tasks(tasks: &mut [WorkTask]) {
    tasks.sort_by(|left, right| {
        left.created_at
            .total_cmp(&right.created_at)
            .then_with(|| left.task_id.cmp(&right.task_id))
    });
}

fn validate_store_id(label: &str, value: &str) -> Result<(), WorkError> {
    let valid = !value.is_empty()
        && value.len() <= 240
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'));
    if valid {
        Ok(())
    } else {
        Err(persistence_error(
            "work_store_id_invalid",
            &format!("WORK {label} contains unsupported characters."),
        ))
    }
}

fn validate_non_empty(label: &str, value: &str) -> Result<(), WorkError> {
    if value.trim().is_empty() || value.len() > 512 || value.chars().any(char::is_control) {
        return Err(persistence_error(
            "work_task_field_invalid",
            &format!("WORK {label} is invalid."),
        ));
    }
    Ok(())
}

fn is_absolute_project_path(value: &str) -> bool {
    if value.is_empty() || value.len() > 4096 || value.chars().any(char::is_control) {
        return false;
    }
    if Path::new(value).is_absolute() || value.starts_with("\\\\") || value.starts_with("//") {
        return true;
    }
    let bytes = value.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'\\' | b'/')
}

fn reject_symlink(path: &Path) -> Result<(), WorkError> {
    if fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false)
    {
        return Err(persistence_error(
            "work_task_store_symlink_rejected",
            "WORK task store refuses symbolic links.",
        ));
    }
    Ok(())
}

fn now_unix_seconds() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
}

fn persistence_error(code: &str, message: &str) -> WorkError {
    WorkError {
        kind: WorkErrorKind::Persistence,
        code: code.into(),
        message: message.into(),
        retryable: false,
        http_status: None,
        request_id: None,
        details: BTreeMap::new(),
    }
}

#[cfg(test)]
mod tests {
    use std::fs::{self, OpenOptions};
    use std::io::Write;
    use std::path::PathBuf;

    use super::{
        HermesTaskStore, HermesTaskStorePaths, WorkRecoveryDisposition,
        TASK_SNAPSHOT_SCHEMA_VERSION,
    };
    use crate::shared::hermes_core::events::HermesEventNormalizer;
    use crate::shared::hermes_core::protocol::{parse_sse_transcript, HermesSseFrame};
    use crate::shared::hermes_core::types::{
        WorkError, WorkErrorKind, WorkEventKind, WorkFollowUpStatus, WorkTask, WorkTaskStatus,
        WORK_SCHEMA_VERSION,
    };

    fn temp_root(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "blackrain-hermes-tasks-{label}-{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn task(id: &str, status: WorkTaskStatus, run_id: Option<&str>) -> WorkTask {
        WorkTask {
            schema_version: WORK_SCHEMA_VERSION,
            task_id: id.into(),
            activation_id: Some("activation-office-demo".into()),
            workbench_id: "office-agent".into(),
            workbench_version: "0.1.0".into(),
            project_path: r"C:\Users\demo\BlackRain Project".into(),
            title: None,
            pinned: false,
            archived: false,
            model: Some("deepseek-v4-flash".into()),
            hermes_session_id: Some(format!("session-{id}")),
            active_run_id: run_id.map(str::to_string),
            status,
            last_event_sequence: 0,
            created_at: 1.0,
            updated_at: 1.0,
            recovery: Default::default(),
            activation_migrations: Vec::new(),
        }
    }

    fn normalized_events(
        task_id: &str,
        run_id: &str,
        fixture: &str,
    ) -> Vec<crate::shared::hermes_core::types::WorkEvent> {
        let input = match fixture {
            "normal" => include_str!("../../../test-fixtures/hermes/v2026.7.7.2/sse-normal.txt"),
            "failed" => include_str!("../../../test-fixtures/hermes/v2026.7.7.2/sse-failures.txt"),
            _ => panic!("unknown fixture"),
        };
        let mut normalizer = HermesEventNormalizer::new(task_id, run_id, 0).unwrap();
        parse_sse_transcript(input)
            .unwrap()
            .into_iter()
            .filter_map(|frame| match frame {
                HermesSseFrame::Event(raw) => Some(normalizer.normalize(&raw).unwrap()),
                HermesSseFrame::Comment(_) => None,
            })
            .flatten()
            .collect()
    }

    #[test]
    fn paths_are_isolated_under_app_data() {
        let paths = HermesTaskStorePaths::from_app_data_dir(PathBuf::from("/app-data").as_path());
        assert_eq!(
            paths.snapshot,
            PathBuf::from("/app-data/work/tasks.v1.json")
        );
        assert_eq!(paths.events, PathBuf::from("/app-data/work/events"));
        assert_eq!(paths.follow_ups, PathBuf::from("/app-data/work/follow-ups"));
    }

    #[test]
    fn upserts_and_loads_versioned_task_snapshot() {
        let root = temp_root("snapshot");
        let store = HermesTaskStore::new(&root);
        store
            .upsert_task(&task("task-1", WorkTaskStatus::Queued, None))
            .unwrap();
        let tasks = store.load_tasks().unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].task_id, "task-1");
        let value: serde_json::Value =
            serde_json::from_slice(&fs::read(&store.paths.snapshot).unwrap()).unwrap();
        assert_eq!(value["schemaVersion"], TASK_SNAPSHOT_SCHEMA_VERSION);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn updates_title_pin_and_archive_metadata_durably() {
        let root = temp_root("metadata");
        let store = HermesTaskStore::new(&root);
        store
            .upsert_task(&task("task-metadata", WorkTaskStatus::Completed, None))
            .unwrap();

        let renamed = store
            .update_task_metadata("task-metadata", Some("  季度报告  "), Some(true), None)
            .unwrap();
        assert_eq!(renamed.title.as_deref(), Some("季度报告"));
        assert!(renamed.pinned);
        let archived = store
            .update_task_metadata("task-metadata", None, None, Some(true))
            .unwrap();
        assert!(archived.archived);
        assert!(!archived.pinned);

        let restarted = HermesTaskStore::new(&root).load_task("task-metadata").unwrap();
        assert_eq!(restarted.title.as_deref(), Some("季度报告"));
        assert!(restarted.archived);
        assert!(!restarted.pinned);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_archiving_active_tasks_and_invalid_titles() {
        let root = temp_root("metadata-guards");
        let store = HermesTaskStore::new(&root);
        store
            .upsert_task(&task(
                "task-active-metadata",
                WorkTaskStatus::Running,
                Some("run-active"),
            ))
            .unwrap();

        let archive_error = store
            .update_task_metadata("task-active-metadata", None, None, Some(true))
            .unwrap_err();
        assert_eq!(archive_error.code, "work_task_archive_active");
        let title_error = store
            .update_task_metadata("task-active-metadata", Some("bad\ntitle"), None, None)
            .unwrap_err();
        assert_eq!(title_error.code, "work_task_title_invalid");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn deactivation_cancels_only_the_matching_active_run_and_preserves_session() {
        let root = temp_root("deactivation");
        let store = HermesTaskStore::new(&root);
        let active = task("task-office", WorkTaskStatus::Running, Some("run-office"));
        store.upsert_task(&active).unwrap();

        let cancelled = store
            .cancel_run_for_deactivation("task-office", "activation-office-demo", "run-office")
            .unwrap();
        assert_eq!(cancelled.status, WorkTaskStatus::Cancelled);
        assert_eq!(cancelled.active_run_id, None);
        assert_eq!(cancelled.hermes_session_id, active.hermes_session_id);
        assert_eq!(
            cancelled.recovery["source"],
            serde_json::Value::String("workbenchDeactivation".into())
        );
        assert!(store
            .cancel_run_for_deactivation("task-office", "activation-other", "run-office",)
            .unwrap_err()
            .code
            .contains("identity_mismatch"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn durable_follow_up_queue_supports_edit_cancel_retry_and_claim_completion() {
        let root = temp_root("follow-ups");
        let store = HermesTaskStore::new(&root);
        store
            .upsert_task(&task(
                "task-follow-ups",
                WorkTaskStatus::Running,
                Some("run-active"),
            ))
            .unwrap();
        let first = store
            .enqueue_follow_up(
                "task-follow-ups",
                "先整理表格",
                &[r"C:\Users\demo\BlackRain Project\quarterly.xlsx".into()],
                None,
                None,
            )
            .unwrap();
        let first_id = first[0].follow_up_id.clone();
        let second = store
            .enqueue_follow_up(
                "task-follow-ups",
                "再生成摘要",
                &[],
                Some("只生成项目内文件"),
                Some("office-fast"),
            )
            .unwrap();
        let second_id = second[1].follow_up_id.clone();
        assert_eq!(
            HermesTaskStore::new(&root)
                .load_follow_ups("task-follow-ups")
                .unwrap()
                .len(),
            2
        );

        let edited = store
            .edit_follow_up(
                "task-follow-ups",
                &second_id,
                "再生成管理层摘要",
                &[],
                None,
                None,
            )
            .unwrap();
        assert_eq!(edited[1].prompt, "再生成管理层摘要");

        let mut terminal = store.load_task("task-follow-ups").unwrap();
        terminal.status = WorkTaskStatus::Completed;
        terminal.active_run_id = None;
        store.upsert_task(&terminal).unwrap();
        let claimed = store
            .claim_next_follow_up("task-follow-ups")
            .unwrap()
            .unwrap();
        assert_eq!(claimed.follow_up_id, first_id);
        assert_eq!(claimed.status, WorkFollowUpStatus::Starting);
        let attempt_id = claimed.attempt_id.clone().unwrap();
        let failed = store
            .fail_follow_up_claim(
                "task-follow-ups",
                &first_id,
                &attempt_id,
                &WorkError {
                    kind: WorkErrorKind::Connection,
                    code: "upstream_secret_message".into(),
                    message: "must not persist this upstream body".into(),
                    retryable: true,
                    http_status: Some(503),
                    request_id: Some("request-safe".into()),
                    details: [("secret".into(), serde_json::json!("hidden"))]
                        .into_iter()
                        .collect(),
                },
            )
            .unwrap();
        assert_eq!(failed[0].status, WorkFollowUpStatus::Failed);
        assert_eq!(
            failed[0].last_error.as_ref().unwrap().message,
            "WORK follow-up run creation failed."
        );
        assert!(failed[0].last_error.as_ref().unwrap().details.is_empty());
        assert!(store
            .claim_next_follow_up("task-follow-ups")
            .unwrap()
            .is_none());

        store.retry_follow_up("task-follow-ups", &first_id).unwrap();
        let retried = store
            .claim_next_follow_up("task-follow-ups")
            .unwrap()
            .unwrap();
        store
            .complete_follow_up_claim(
                "task-follow-ups",
                &first_id,
                retried.attempt_id.as_deref().unwrap(),
            )
            .unwrap();
        let remaining = store.load_follow_ups("task-follow-ups").unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].follow_up_id, second_id);
        assert!(store
            .cancel_follow_up("task-follow-ups", &second_id)
            .unwrap()
            .is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn interrupted_follow_up_claim_is_failed_without_automatic_replay() {
        let root = temp_root("follow-up-interrupted");
        let store = HermesTaskStore::new(&root);
        store
            .upsert_task(&task(
                "task-interrupted",
                WorkTaskStatus::Running,
                Some("run-active"),
            ))
            .unwrap();
        store
            .enqueue_follow_up("task-interrupted", "继续整理", &[], None, None)
            .unwrap();
        let mut terminal = store.load_task("task-interrupted").unwrap();
        terminal.status = WorkTaskStatus::Completed;
        terminal.active_run_id = None;
        store.upsert_task(&terminal).unwrap();
        store
            .claim_next_follow_up("task-interrupted")
            .unwrap()
            .unwrap();

        let restarted = HermesTaskStore::new(&root);
        assert_eq!(restarted.audit_interrupted_follow_ups().unwrap(), 1);
        let items = restarted.load_follow_ups("task-interrupted").unwrap();
        assert_eq!(items[0].status, WorkFollowUpStatus::Failed);
        assert_eq!(
            items[0].last_error.as_ref().unwrap().code,
            "work_follow_up_start_interrupted"
        );
        assert!(restarted
            .claim_next_follow_up("task-interrupted")
            .unwrap()
            .is_none());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn dispatched_follow_up_evidence_removes_a_stale_starting_queue_item() {
        let root = temp_root("follow-up-dispatched-recovery");
        let store = HermesTaskStore::new(&root);
        store
            .upsert_task(&task(
                "task-dispatched",
                WorkTaskStatus::Running,
                Some("run-active"),
            ))
            .unwrap();
        let queued = store
            .enqueue_follow_up("task-dispatched", "继续整理", &[], None, None)
            .unwrap();
        let follow_up_id = queued[0].follow_up_id.clone();
        let mut terminal = store.load_task("task-dispatched").unwrap();
        terminal.status = WorkTaskStatus::Completed;
        terminal.active_run_id = None;
        store.upsert_task(&terminal).unwrap();
        store
            .claim_next_follow_up("task-dispatched")
            .unwrap()
            .unwrap();
        store
            .attach_run_with_user_message(
                "task-dispatched",
                "run-follow-up",
                "session-task-dispatched",
                "继续整理",
                &[],
                Some(&follow_up_id),
                None,
            )
            .unwrap();

        let restarted = HermesTaskStore::new(&root);
        assert_eq!(restarted.audit_interrupted_follow_ups().unwrap(), 0);
        assert!(restarted
            .load_follow_ups("task-dispatched")
            .unwrap()
            .is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn follow_up_queue_requires_an_active_run_and_is_removed_with_task_metadata() {
        let root = temp_root("follow-up-removal");
        let store = HermesTaskStore::new(&root);
        store
            .upsert_task(&task("task-no-run", WorkTaskStatus::Completed, None))
            .unwrap();
        assert_eq!(
            store
                .enqueue_follow_up("task-no-run", "不应排队", &[], None, None)
                .unwrap_err()
                .code,
            "work_follow_up_requires_active_run"
        );
        let mut active = store.load_task("task-no-run").unwrap();
        active.status = WorkTaskStatus::Running;
        active.active_run_id = Some("run-active".into());
        store.upsert_task(&active).unwrap();
        store
            .enqueue_follow_up("task-no-run", "允许排队", &[], None, None)
            .unwrap();
        assert!(store.remove_task_metadata("task-no-run").unwrap());
        assert!(store.load_follow_ups("task-no-run").unwrap().is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn workbench_deactivation_fails_queued_follow_ups_without_losing_their_content() {
        let root = temp_root("follow-up-deactivation");
        let store = HermesTaskStore::new(&root);
        store
            .upsert_task(&task(
                "task-deactivation-queue",
                WorkTaskStatus::Running,
                Some("run-active"),
            ))
            .unwrap();
        store
            .enqueue_follow_up(
                "task-deactivation-queue",
                "保留这条后续任务",
                &[],
                None,
                None,
            )
            .unwrap();

        let items = store
            .fail_follow_ups_for_deactivation("task-deactivation-queue")
            .unwrap();
        assert_eq!(items[0].prompt, "保留这条后续任务");
        assert_eq!(items[0].status, WorkFollowUpStatus::Failed);
        assert_eq!(
            items[0].last_error.as_ref().unwrap().code,
            "workbench_deactivated"
        );
        assert!(!items[0].last_error.as_ref().unwrap().retryable);
        assert_eq!(
            store
                .retry_follow_up("task-deactivation-queue", &items[0].follow_up_id)
                .unwrap_err()
                .code,
            "work_follow_up_not_retryable"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn migrates_legacy_bare_task_array_to_v1_envelope() {
        let root = temp_root("migration");
        let store = HermesTaskStore::new(&root);
        fs::create_dir_all(&store.paths.root).unwrap();
        fs::write(
            &store.paths.snapshot,
            serde_json::to_vec(&vec![task("task-legacy", WorkTaskStatus::Draft, None)]).unwrap(),
        )
        .unwrap();
        assert_eq!(store.load_tasks().unwrap().len(), 1);
        let value: serde_json::Value =
            serde_json::from_slice(&fs::read(&store.paths.snapshot).unwrap()).unwrap();
        assert_eq!(value["schemaVersion"], 1);
        assert!(value["tasks"].is_array());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn appends_journal_before_snapshot_and_deduplicates_stable_event_ids() {
        let root = temp_root("journal");
        let store = HermesTaskStore::new(&root);
        store
            .upsert_task(&task(
                "task-normal",
                WorkTaskStatus::Running,
                Some("run_demo_001"),
            ))
            .unwrap();
        let events = normalized_events("task-normal", "run_demo_001", "normal");
        let first = store.append_events("task-normal", &events).unwrap();
        assert_eq!(first.appended, events.len());
        assert_eq!(first.task.status, WorkTaskStatus::Completed);
        assert_eq!(first.task.active_run_id, None);
        assert_eq!(first.task.last_event_sequence, events.len() as u64);

        let mut replay = events.clone();
        for event in &mut replay {
            event.sequence += 100;
        }
        let second = store.append_events("task-normal", &replay).unwrap();
        assert_eq!(second.appended, 0);
        assert_eq!(second.skipped_duplicates, events.len());
        assert_eq!(
            store.load_events("task-normal").unwrap().len(),
            events.len()
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn local_recovery_repairs_stale_sequence_and_classifies_tasks() {
        let root = temp_root("recovery");
        let store = HermesTaskStore::new(&root);

        store
            .upsert_task(&task(
                "task-completed",
                WorkTaskStatus::Running,
                Some("run_demo_001"),
            ))
            .unwrap();
        let completed = normalized_events("task-completed", "run_demo_001", "normal");
        store.append_events("task-completed", &completed).unwrap();
        let mut stale = store
            .load_tasks()
            .unwrap()
            .into_iter()
            .find(|task| task.task_id == "task-completed")
            .unwrap();
        stale.status = WorkTaskStatus::Running;
        stale.active_run_id = Some("run_demo_001".into());
        stale.last_event_sequence = 0;
        store.upsert_task(&stale).unwrap();

        store
            .upsert_task(&task(
                "task-resumable",
                WorkTaskStatus::Running,
                Some("run-live"),
            ))
            .unwrap();
        store
            .upsert_task(&task("task-orphaned", WorkTaskStatus::Running, None))
            .unwrap();

        let records = store.audit_local_recovery().unwrap();
        let by_id = records
            .into_iter()
            .map(|record| (record.task_id.clone(), record))
            .collect::<std::collections::HashMap<_, _>>();
        assert_eq!(
            by_id["task-completed"].disposition,
            WorkRecoveryDisposition::Completed
        );
        assert_eq!(
            by_id["task-resumable"].disposition,
            WorkRecoveryDisposition::Resumable
        );
        assert_eq!(
            by_id["task-orphaned"].disposition,
            WorkRecoveryDisposition::Orphaned
        );
        let tasks = store.load_tasks().unwrap();
        assert_eq!(
            tasks
                .iter()
                .find(|task| task.task_id == "task-completed")
                .unwrap()
                .last_event_sequence,
            completed.len() as u64
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn local_user_event_recovers_a_run_when_snapshot_attach_was_not_persisted() {
        let root = temp_root("user-event-recovery");
        let store = HermesTaskStore::new(&root);
        let mut draft = task("task-user-event", WorkTaskStatus::Draft, None);
        draft.hermes_session_id = None;
        store.upsert_task(&draft).unwrap();
        store
            .attach_run_with_user_message(
                "task-user-event",
                "run-user-event",
                "run-user-event",
                "整理季度报告",
                &[r"C:\Users\demo\BlackRain Project\quarterly.xlsx".into()],
                None,
                None,
            )
            .unwrap();

        store.upsert_task(&draft).unwrap();
        let records = store.audit_local_recovery().unwrap();
        assert_eq!(records[0].disposition, WorkRecoveryDisposition::Resumable);
        let recovered = store.load_task("task-user-event").unwrap();
        assert_eq!(recovered.status, WorkTaskStatus::Degraded);
        assert_eq!(recovered.active_run_id.as_deref(), Some("run-user-event"));
        assert_eq!(
            recovered.hermes_session_id.as_deref(),
            Some("run-user-event")
        );
        assert_eq!(recovered.last_event_sequence, 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_path_traversal_and_conflicting_duplicate_event_ids() {
        let root = temp_root("security");
        let store = HermesTaskStore::new(&root);
        assert_eq!(
            store.load_events("../escape").unwrap_err().code,
            "work_store_id_invalid"
        );
        store
            .upsert_task(&task(
                "task-failed",
                WorkTaskStatus::Running,
                Some("run_demo_failed"),
            ))
            .unwrap();
        let events = normalized_events("task-failed", "run_demo_failed", "failed");
        store.append_events("task-failed", &events).unwrap();
        let path = store.event_journal_path("task-failed").unwrap();
        let mut conflict = events[0].clone();
        conflict.kind = WorkEventKind::WarningRaised {
            message: "conflict".into(),
        };
        let mut file = OpenOptions::new().append(true).open(path).unwrap();
        writeln!(file, "{}", serde_json::to_string(&conflict).unwrap()).unwrap();
        assert_eq!(
            store.load_events("task-failed").unwrap_err().code,
            "work_event_id_conflict"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_decreasing_journal_sequence_without_sorting_it_away() {
        let root = temp_root("sequence-conflict");
        let store = HermesTaskStore::new(&root);
        store
            .upsert_task(&task(
                "task-sequence",
                WorkTaskStatus::Running,
                Some("run_demo_001"),
            ))
            .unwrap();
        let mut events = normalized_events("task-sequence", "run_demo_001", "normal");
        let first = events.remove(0);
        let mut second = events.remove(0);
        second.sequence = first.sequence;
        let path = store.event_journal_path("task-sequence").unwrap();
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(
            &path,
            format!(
                "{}\n{}\n",
                serde_json::to_string(&first).unwrap(),
                serde_json::to_string(&second).unwrap()
            ),
        )
        .unwrap();

        assert_eq!(
            store.load_events("task-sequence").unwrap_err().code,
            "work_event_sequence_conflict"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn recovery_ignores_only_a_truncated_final_journal_line() {
        let root = temp_root("truncated-tail");
        let store = HermesTaskStore::new(&root);
        store
            .upsert_task(&task(
                "task-tail",
                WorkTaskStatus::Running,
                Some("run_demo_failed"),
            ))
            .unwrap();
        let events = normalized_events("task-tail", "run_demo_failed", "failed");
        store.append_events("task-tail", &events).unwrap();
        let path = store.event_journal_path("task-tail").unwrap();
        let mut file = OpenOptions::new().append(true).open(&path).unwrap();
        file.write_all(br#"{"schemaVersion":1,"eventId":"truncated""#)
            .unwrap();
        file.flush().unwrap();
        assert_eq!(store.load_events("task-tail").unwrap().len(), events.len());

        let mut recovered = events.last().unwrap().clone();
        recovered.event_id = "tail-recovered".into();
        recovered.sequence += 1;
        recovered.kind = WorkEventKind::WarningRaised {
            message: "tail recovered".into(),
        };
        assert_eq!(
            store
                .append_events("task-tail", &[recovered])
                .unwrap()
                .appended,
            1
        );
        assert_eq!(
            store.load_events("task-tail").unwrap().len(),
            events.len() + 1
        );

        let mut file = OpenOptions::new().append(true).open(&path).unwrap();
        file.write_all(b"not-json\n").unwrap();
        file.flush().unwrap();
        assert_eq!(
            store.load_events("task-tail").unwrap_err().code,
            "work_event_journal_invalid"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn removing_local_metadata_never_deletes_the_user_project() {
        let root = temp_root("remove-metadata");
        let project = root.join("user-project");
        fs::create_dir_all(&project).unwrap();
        fs::write(project.join("report.docx"), b"user-content").unwrap();
        let store = HermesTaskStore::new(&root.join("app-data"));
        let mut metadata = task(
            "task-remove",
            WorkTaskStatus::Running,
            Some("run_demo_failed"),
        );
        metadata.project_path = project.to_string_lossy().to_string();
        store.upsert_task(&metadata).unwrap();
        let events = normalized_events("task-remove", "run_demo_failed", "failed");
        store.append_events("task-remove", &events).unwrap();

        assert!(store.remove_task_metadata("task-remove").unwrap());
        assert!(store.load_tasks().unwrap().is_empty());
        assert!(store.load_events("task-remove").unwrap().is_empty());
        assert_eq!(
            fs::read(project.join("report.docx")).unwrap(),
            b"user-content"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn metadata_removal_retry_cleans_an_orphaned_journal() {
        let root = temp_root("remove-retry");
        let store = HermesTaskStore::new(&root);
        let journal = store.event_journal_path("task-orphan-journal").unwrap();
        fs::create_dir_all(journal.parent().unwrap()).unwrap();
        fs::write(&journal, b"stale journal").unwrap();

        assert!(store.remove_task_metadata("task-orphan-journal").unwrap());
        assert!(!journal.exists());
        assert!(!store.remove_task_metadata("task-orphan-journal").unwrap());
        fs::remove_dir_all(root).unwrap();
    }
}
