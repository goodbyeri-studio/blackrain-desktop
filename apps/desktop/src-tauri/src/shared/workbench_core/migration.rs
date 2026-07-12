use crate::shared::hermes_core::tasks::HermesTaskStore;
use crate::shared::hermes_core::types::{
    WorkActivationMigration, WorkActivationMigrationReason, WorkActivationMigrationStatus,
    WorkError, WorkErrorKind, WorkTask, WorkTaskStatus,
};

use super::{ActivatedWorkbenchContext, ActivatedWorkbenchStore};

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct PreparedActivationMigration {
    migration_id: String,
    task_id: String,
    source_activation_id: String,
    target_activation: ActivatedWorkbenchContext,
    reason: WorkActivationMigrationReason,
    prepared_at: f64,
}

pub(crate) fn prepare_activation_migration(
    activation_store: &ActivatedWorkbenchStore,
    task_store: &HermesTaskStore,
    task_id: &str,
    target_activation_id: &str,
    reason: WorkActivationMigrationReason,
    prepared_at: f64,
) -> Result<PreparedActivationMigration, WorkError> {
    if !prepared_at.is_finite() || prepared_at <= 0.0 {
        return Err(migration_error(
            "work_activation_migration_timestamp_invalid",
            "WORK activation migration timestamp is invalid.",
        ));
    }
    let task = task_store.load_task(task_id)?;
    if task.active_run_id.is_some() || !is_terminal(&task.status) {
        return Err(migration_error(
            "work_activation_migration_task_active",
            "WORK task must be terminal with no active run before activation migration.",
        ));
    }
    let source_activation_id = task.activation_id.as_deref().ok_or_else(|| {
        migration_error(
            "work_activation_migration_source_missing",
            "Legacy WORK task has no verified activation generation to migrate.",
        )
    })?;
    if source_activation_id == target_activation_id {
        return Err(migration_error(
            "work_activation_migration_same_generation",
            "WORK task already uses the requested activation generation.",
        ));
    }
    let source = activation_store.read(source_activation_id).map_err(|_| {
        migration_error(
            "work_activation_migration_source_unverified",
            "WORK task source activation is no longer verified.",
        )
    })?;
    let target = activation_store.read(target_activation_id).map_err(|_| {
        migration_error(
            "work_activation_migration_target_unverified",
            "Target WORK activation is not installed and verified.",
        )
    })?;
    validate_task_source_identity(&task, &source)?;
    if source.workbench_id != target.workbench_id
        || source.project.project_id != target.project.project_id
        || source.project.path != target.project.path
    {
        return Err(migration_error(
            "work_activation_migration_identity_mismatch",
            "WORK activation migration cannot change the workbench or user project.",
        ));
    }
    Ok(PreparedActivationMigration {
        migration_id: format!("migration-{}", uuid::Uuid::new_v4().simple()),
        task_id: task.task_id,
        source_activation_id: source.activation_id,
        target_activation: target,
        reason,
        prepared_at,
    })
}

pub(crate) fn commit_activation_migration(
    activation_store: &ActivatedWorkbenchStore,
    task_store: &HermesTaskStore,
    prepared: &PreparedActivationMigration,
) -> Result<WorkTask, WorkError> {
    activation_store
        .read(&prepared.source_activation_id)
        .map_err(|_| {
            migration_error(
                "work_activation_migration_source_unverified",
                "WORK task source activation is no longer verified.",
            )
        })?;
    let current_target = activation_store
        .read(&prepared.target_activation.activation_id)
        .map_err(|_| {
            migration_error(
                "work_activation_migration_target_unverified",
                "Target WORK activation is no longer installed and verified.",
            )
        })?;
    if current_target != prepared.target_activation {
        return Err(migration_error(
            "work_activation_migration_target_changed",
            "Target WORK activation changed after migration preparation.",
        ));
    }
    task_store.commit_activation_migration(
        &prepared.task_id,
        &prepared.target_activation.workbench_version,
        prepared.record(WorkActivationMigrationStatus::Completed, None),
    )
}

pub(crate) fn record_activation_migration_failure(
    task_store: &HermesTaskStore,
    prepared: &PreparedActivationMigration,
    failure_code: &str,
) -> Result<WorkTask, WorkError> {
    task_store.record_activation_migration_failure(
        &prepared.task_id,
        prepared.record(
            WorkActivationMigrationStatus::Failed,
            Some(failure_code.into()),
        ),
    )
}

impl PreparedActivationMigration {
    pub(crate) fn target_activation(&self) -> &ActivatedWorkbenchContext {
        &self.target_activation
    }

    fn record(
        &self,
        status: WorkActivationMigrationStatus,
        failure_code: Option<String>,
    ) -> WorkActivationMigration {
        WorkActivationMigration {
            migration_id: self.migration_id.clone(),
            source_activation_id: self.source_activation_id.clone(),
            target_activation_id: self.target_activation.activation_id.clone(),
            reason: self.reason.clone(),
            status,
            timestamp: self.prepared_at,
            failure_code,
        }
    }
}

fn validate_task_source_identity(
    task: &WorkTask,
    source: &ActivatedWorkbenchContext,
) -> Result<(), WorkError> {
    if task.workbench_id != source.workbench_id
        || task.workbench_version != source.workbench_version
        || task.project_path != source.project.path
    {
        return Err(migration_error(
            "work_activation_migration_source_mismatch",
            "WORK task identity no longer matches its verified source activation.",
        ));
    }
    Ok(())
}

fn is_terminal(status: &WorkTaskStatus) -> bool {
    matches!(
        status,
        WorkTaskStatus::Completed | WorkTaskStatus::Failed | WorkTaskStatus::Cancelled
    )
}

fn migration_error(code: &str, message: &str) -> WorkError {
    WorkError {
        kind: WorkErrorKind::InvalidRequest,
        code: code.into(),
        message: message.into(),
        retryable: false,
        http_status: None,
        request_id: None,
        details: Default::default(),
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use super::{
        commit_activation_migration, prepare_activation_migration,
        record_activation_migration_failure,
    };
    use crate::shared::hermes_core::tasks::HermesTaskStore;
    use crate::shared::hermes_core::types::{
        WorkActivationMigrationReason, WorkActivationMigrationStatus, WorkTask, WorkTaskStatus,
        WORK_SCHEMA_VERSION,
    };
    use crate::shared::workbench_core::{
        ActivatedFileAccess, ActivatedFilePermission, ActivatedPermissionGrant,
        ActivatedProjectContext, ActivatedWorkbenchContext, ActivatedWorkbenchStore,
        WorkbenchEngine, ACTIVATED_WORKBENCH_SCHEMA_VERSION,
    };

    fn temp_root(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "blackrain-activation-migration-{label}-{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn activation(root: &PathBuf, id: &str, version: &str) -> ActivatedWorkbenchContext {
        let project = root.join("project").to_string_lossy().to_string();
        ActivatedWorkbenchContext {
            schema_version: ACTIVATED_WORKBENCH_SCHEMA_VERSION,
            activation_id: id.into(),
            workbench_id: "com.blackrain.office".into(),
            workbench_version: version.into(),
            engine: WorkbenchEngine::Work,
            project: ActivatedProjectContext {
                project_id: "project-office".into(),
                path: project.clone(),
            },
            task: None,
            skill_roots: vec![root.join("skills").to_string_lossy().to_string()],
            plugins: Vec::new(),
            mcp_servers: Vec::new(),
            environment_refs: Vec::new(),
            permissions: ActivatedPermissionGrant {
                grant_id: format!("grant-{id}"),
                files: vec![ActivatedFilePermission {
                    path: project,
                    access: ActivatedFileAccess::ReadWrite,
                }],
                network_domains: Vec::new(),
                process_ids: Vec::new(),
            },
            verified_at: 1.0,
        }
    }

    fn task(source: &ActivatedWorkbenchContext) -> WorkTask {
        WorkTask {
            schema_version: WORK_SCHEMA_VERSION,
            task_id: "task-office".into(),
            activation_id: Some(source.activation_id.clone()),
            workbench_id: source.workbench_id.clone(),
            workbench_version: source.workbench_version.clone(),
            project_path: source.project.path.clone(),
            hermes_session_id: Some("session-office".into()),
            active_run_id: None,
            status: WorkTaskStatus::Completed,
            last_event_sequence: 4,
            created_at: 1.0,
            updated_at: 1.0,
            recovery: Default::default(),
            activation_migrations: Vec::new(),
        }
    }

    fn stores(
        label: &str,
    ) -> (
        PathBuf,
        ActivatedWorkbenchStore,
        HermesTaskStore,
        ActivatedWorkbenchContext,
        ActivatedWorkbenchContext,
    ) {
        let root = temp_root(label);
        fs::create_dir_all(root.join("project")).unwrap();
        let source = activation(&root, "activation-office-v1", "0.1.0");
        let target = activation(&root, "activation-office-v2", "0.2.0");
        let activations = ActivatedWorkbenchStore::new(&root);
        activations.persist_verified(source.clone()).unwrap();
        activations.persist_verified(target.clone()).unwrap();
        let tasks = HermesTaskStore::new(&root);
        tasks.upsert_task(&task(&source)).unwrap();
        (root, activations, tasks, source, target)
    }

    #[test]
    fn commits_verified_generation_and_preserves_session_with_atomic_audit() {
        let (root, activations, tasks, source, target) = stores("commit");
        let prepared = prepare_activation_migration(
            &activations,
            &tasks,
            "task-office",
            &target.activation_id,
            WorkActivationMigrationReason::WorkbenchUpgrade,
            2.0,
        )
        .unwrap();
        let migrated = commit_activation_migration(&activations, &tasks, &prepared).unwrap();
        assert_eq!(
            migrated.activation_id.as_deref(),
            Some(target.activation_id.as_str())
        );
        assert_eq!(migrated.workbench_version, "0.2.0");
        assert_eq!(
            migrated.hermes_session_id.as_deref(),
            Some("session-office")
        );
        assert_eq!(migrated.activation_migrations.len(), 1);
        assert_eq!(
            migrated.activation_migrations[0].status,
            WorkActivationMigrationStatus::Completed
        );
        let serialized = serde_json::to_value(&migrated).unwrap();
        assert_eq!(
            serialized["activationMigrations"][0]["sourceActivationId"],
            "activation-office-v1"
        );
        assert_eq!(
            serialized["activationMigrations"][0]["targetActivationId"],
            "activation-office-v2"
        );
        assert_eq!(
            serialized["activationMigrations"][0]["reason"],
            "workbenchUpgrade"
        );
        assert_eq!(
            HermesTaskStore::new(&root)
                .load_task("task-office")
                .unwrap(),
            migrated
        );
        assert_eq!(prepared.source_activation_id, source.activation_id);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_active_or_cross_project_tasks_and_unverified_targets() {
        let (root, activations, tasks, _, target) = stores("reject");
        let mut active = tasks.load_task("task-office").unwrap();
        active.status = WorkTaskStatus::Running;
        active.active_run_id = Some("run-office".into());
        tasks.upsert_task(&active).unwrap();
        assert_eq!(
            prepare_activation_migration(
                &activations,
                &tasks,
                "task-office",
                &target.activation_id,
                WorkActivationMigrationReason::PluginChange,
                2.0,
            )
            .unwrap_err()
            .code,
            "work_activation_migration_task_active"
        );

        active.status = WorkTaskStatus::Completed;
        active.active_run_id = None;
        tasks.upsert_task(&active).unwrap();
        let mut other_project = activation(&root, "activation-other-project", "0.2.0");
        other_project.project.project_id = "project-other".into();
        other_project.project.path = root.join("other-project").to_string_lossy().to_string();
        other_project.permissions.files[0].path = other_project.project.path.clone();
        activations.persist_verified(other_project.clone()).unwrap();
        assert_eq!(
            prepare_activation_migration(
                &activations,
                &tasks,
                "task-office",
                &other_project.activation_id,
                WorkActivationMigrationReason::PluginChange,
                2.0,
            )
            .unwrap_err()
            .code,
            "work_activation_migration_identity_mismatch"
        );
        let mut other_workbench = activation(&root, "activation-other-workbench", "0.2.0");
        other_workbench.workbench_id = "com.blackrain.finance".into();
        activations
            .persist_verified(other_workbench.clone())
            .unwrap();
        assert_eq!(
            prepare_activation_migration(
                &activations,
                &tasks,
                "task-office",
                &other_workbench.activation_id,
                WorkActivationMigrationReason::PluginChange,
                2.0,
            )
            .unwrap_err()
            .code,
            "work_activation_migration_identity_mismatch"
        );
        assert_eq!(
            prepare_activation_migration(
                &activations,
                &tasks,
                "task-office",
                "activation-not-installed",
                WorkActivationMigrationReason::PluginChange,
                2.0,
            )
            .unwrap_err()
            .code,
            "work_activation_migration_target_unverified"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn commit_rechecks_task_state_and_failed_transition_keeps_source_generation() {
        let (root, activations, tasks, source, target) = stores("rollback");
        let prepared = prepare_activation_migration(
            &activations,
            &tasks,
            "task-office",
            &target.activation_id,
            WorkActivationMigrationReason::Repair,
            2.0,
        )
        .unwrap();
        let mut raced = tasks.load_task("task-office").unwrap();
        raced.status = WorkTaskStatus::Running;
        raced.active_run_id = Some("run-raced".into());
        tasks.upsert_task(&raced).unwrap();
        assert_eq!(
            commit_activation_migration(&activations, &tasks, &prepared)
                .unwrap_err()
                .code,
            "work_activation_migration_task_active"
        );
        let unchanged = tasks.load_task("task-office").unwrap();
        assert_eq!(
            unchanged.activation_id.as_deref(),
            Some(source.activation_id.as_str())
        );
        assert!(unchanged.activation_migrations.is_empty());

        raced.status = WorkTaskStatus::Completed;
        raced.active_run_id = None;
        tasks.upsert_task(&raced).unwrap();
        let failed =
            record_activation_migration_failure(&tasks, &prepared, "router_readiness_failed")
                .unwrap();
        assert_eq!(
            failed.activation_id.as_deref(),
            Some(source.activation_id.as_str())
        );
        assert_eq!(failed.activation_migrations.len(), 1);
        assert_eq!(
            failed.activation_migrations[0].status,
            WorkActivationMigrationStatus::Failed
        );
        assert_eq!(
            failed.activation_migrations[0].failure_code.as_deref(),
            Some("router_readiness_failed")
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_tampered_migration_history_that_does_not_match_task_identity() {
        let (root, activations, tasks, source, target) = stores("tampered-audit");
        let prepared = prepare_activation_migration(
            &activations,
            &tasks,
            "task-office",
            &target.activation_id,
            WorkActivationMigrationReason::WorkbenchUpgrade,
            2.0,
        )
        .unwrap();
        let mut migrated = commit_activation_migration(&activations, &tasks, &prepared).unwrap();
        migrated.activation_id = Some(source.activation_id);
        assert_eq!(
            tasks.upsert_task(&migrated).unwrap_err().code,
            "work_activation_migration_chain_invalid"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn snapshot_write_failure_keeps_source_generation_and_empty_audit() {
        use std::os::unix::fs::PermissionsExt;

        let (root, activations, tasks, source, target) = stores("snapshot-failure");
        let prepared = prepare_activation_migration(
            &activations,
            &tasks,
            "task-office",
            &target.activation_id,
            WorkActivationMigrationReason::WorkbenchUpgrade,
            2.0,
        )
        .unwrap();
        fs::set_permissions(&tasks.paths.root, fs::Permissions::from_mode(0o500)).unwrap();
        assert_eq!(
            commit_activation_migration(&activations, &tasks, &prepared)
                .unwrap_err()
                .code,
            "work_task_snapshot_write_failed"
        );
        fs::set_permissions(&tasks.paths.root, fs::Permissions::from_mode(0o700)).unwrap();
        let unchanged = tasks.load_task("task-office").unwrap();
        assert_eq!(
            unchanged.activation_id.as_deref(),
            Some(source.activation_id.as_str())
        );
        assert!(unchanged.activation_migrations.is_empty());
        fs::remove_dir_all(root).unwrap();
    }
}
