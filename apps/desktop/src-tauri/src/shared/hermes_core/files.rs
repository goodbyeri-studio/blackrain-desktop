use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::Serialize;

use super::tasks::HermesTaskStore;
use super::types::{WorkError, WorkErrorKind};

const MAX_DIRECTORY_ENTRIES: usize = 1_000;
const MAX_TEXT_PREVIEW_BYTES: u64 = 1024 * 1024;
const MAX_IMAGE_PREVIEW_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum WorkProjectEntryKind {
    Directory,
    File,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkProjectEntry {
    pub(crate) name: String,
    pub(crate) relative_path: String,
    pub(crate) kind: WorkProjectEntryKind,
    pub(crate) size: Option<u64>,
    pub(crate) modified_at: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum WorkProjectPreviewKind {
    Text,
    Image,
    Unsupported,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkProjectPreview {
    pub(crate) relative_path: String,
    pub(crate) kind: WorkProjectPreviewKind,
    pub(crate) media_type: Option<String>,
    pub(crate) size: u64,
    pub(crate) content: Option<String>,
    pub(crate) data_url: Option<String>,
}

fn file_error(code: &str, message: impl Into<String>) -> WorkError {
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

fn io_error(code: &str, error: impl std::fmt::Display) -> WorkError {
    WorkError {
        kind: WorkErrorKind::Persistence,
        code: code.into(),
        message: error.to_string(),
        retryable: false,
        http_status: None,
        request_id: None,
        details: Default::default(),
    }
}

fn is_link_like(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    {
        false
    }
}

fn validate_relative_path(value: &str) -> Result<PathBuf, WorkError> {
    if value.contains('\0') {
        return Err(file_error(
            "work_project_path_invalid",
            "Project-relative path contains a NUL byte.",
        ));
    }
    let path = Path::new(value);
    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(file_error(
            "work_project_path_escape",
            "Project file path must stay relative to the WORK task project.",
        ));
    }
    Ok(path.to_path_buf())
}

pub(crate) fn resolve_task_project_root(
    store: &HermesTaskStore,
    task_id: &str,
) -> Result<PathBuf, WorkError> {
    let task = store.load_task(task_id)?;
    let root = PathBuf::from(task.project_path);
    let metadata = fs::symlink_metadata(&root)
        .map_err(|error| io_error("work_project_root_unavailable", error))?;
    if !metadata.is_dir() || is_link_like(&metadata) {
        return Err(file_error(
            "work_project_root_unsafe",
            "WORK task project root must be a real directory, not a link or reparse point.",
        ));
    }
    root.canonicalize()
        .map_err(|error| io_error("work_project_root_unavailable", error))
}

fn resolve_project_path(
    store: &HermesTaskStore,
    task_id: &str,
    relative_path: &str,
) -> Result<(PathBuf, PathBuf), WorkError> {
    let root = resolve_task_project_root(store, task_id)?;
    let relative = validate_relative_path(relative_path)?;
    let mut current = root.clone();
    for component in relative.components() {
        if matches!(component, Component::CurDir) {
            continue;
        }
        current.push(component.as_os_str());
        let metadata = fs::symlink_metadata(&current)
            .map_err(|error| io_error("work_project_path_unavailable", error))?;
        if is_link_like(&metadata) {
            return Err(file_error(
                "work_project_link_rejected",
                "WORK project browsing does not follow links or reparse points.",
            ));
        }
    }
    let canonical = current
        .canonicalize()
        .map_err(|error| io_error("work_project_path_unavailable", error))?;
    if !canonical.starts_with(&root) {
        return Err(file_error(
            "work_project_path_escape",
            "Resolved project path escaped the WORK task project.",
        ));
    }
    Ok((root, canonical))
}

fn relative_display(root: &Path, path: &Path) -> Result<String, WorkError> {
    let relative = path.strip_prefix(root).map_err(|_| {
        file_error(
            "work_project_path_escape",
            "Resolved project path escaped the WORK task project.",
        )
    })?;
    Ok(relative
        .components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/"))
}

fn modified_at(metadata: &fs::Metadata) -> Option<f64> {
    metadata
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|value| value.as_secs_f64())
}

pub(crate) fn list_project_directory(
    store: &HermesTaskStore,
    task_id: &str,
    relative_path: &str,
) -> Result<Vec<WorkProjectEntry>, WorkError> {
    let (root, directory) = resolve_project_path(store, task_id, relative_path)?;
    if !directory.is_dir() {
        return Err(file_error(
            "work_project_not_directory",
            "Requested WORK project path is not a directory.",
        ));
    }
    let mut entries = Vec::new();
    for entry in fs::read_dir(&directory)
        .map_err(|error| io_error("work_project_directory_read_failed", error))?
    {
        if entries.len() >= MAX_DIRECTORY_ENTRIES {
            break;
        }
        let entry = entry.map_err(|error| io_error("work_project_directory_read_failed", error))?;
        let metadata = fs::symlink_metadata(entry.path())
            .map_err(|error| io_error("work_project_metadata_failed", error))?;
        if is_link_like(&metadata) {
            continue;
        }
        let kind = if metadata.is_dir() {
            WorkProjectEntryKind::Directory
        } else if metadata.is_file() {
            WorkProjectEntryKind::File
        } else {
            continue;
        };
        entries.push(WorkProjectEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            relative_path: relative_display(&root, &entry.path())?,
            kind,
            size: metadata.is_file().then_some(metadata.len()),
            modified_at: modified_at(&metadata),
        });
    }
    entries.sort_by(|left, right| {
        let left_group = matches!(left.kind, WorkProjectEntryKind::File);
        let right_group = matches!(right.kind, WorkProjectEntryKind::File);
        left_group
            .cmp(&right_group)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(entries)
}

fn image_media_type(extension: &str) -> Option<&'static str> {
    match extension {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        _ => None,
    }
}

fn text_media_type(extension: &str) -> Option<&'static str> {
    match extension {
        "txt" | "md" | "log" => Some("text/plain"),
        "json" => Some("application/json"),
        "yaml" | "yml" => Some("application/yaml"),
        "toml" => Some("application/toml"),
        "csv" => Some("text/csv"),
        "xml" => Some("application/xml"),
        "html" => Some("text/html"),
        "css" => Some("text/css"),
        "js" | "jsx" => Some("text/javascript"),
        "ts" | "tsx" => Some("text/typescript"),
        "py" | "rs" | "ps1" | "sh" | "sql" | "ini" | "cfg" => Some("text/plain"),
        _ => None,
    }
}

pub(crate) fn preview_project_file(
    store: &HermesTaskStore,
    task_id: &str,
    relative_path: &str,
) -> Result<WorkProjectPreview, WorkError> {
    let (root, file) = resolve_project_path(store, task_id, relative_path)?;
    let metadata = fs::metadata(&file)
        .map_err(|error| io_error("work_project_metadata_failed", error))?;
    if !metadata.is_file() {
        return Err(file_error(
            "work_project_not_file",
            "Requested WORK project path is not a file.",
        ));
    }
    let relative_path = relative_display(&root, &file)?;
    let extension = file
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if let Some(media_type) = image_media_type(&extension) {
        if metadata.len() > MAX_IMAGE_PREVIEW_BYTES {
            return Err(file_error(
                "work_project_preview_too_large",
                "Image preview exceeds the 10 MiB limit.",
            ));
        }
        let bytes = fs::read(&file)
            .map_err(|error| io_error("work_project_preview_read_failed", error))?;
        return Ok(WorkProjectPreview {
            relative_path,
            kind: WorkProjectPreviewKind::Image,
            media_type: Some(media_type.into()),
            size: metadata.len(),
            content: None,
            data_url: Some(format!("data:{media_type};base64,{}", BASE64.encode(bytes))),
        });
    }
    if let Some(media_type) = text_media_type(&extension) {
        if metadata.len() > MAX_TEXT_PREVIEW_BYTES {
            return Err(file_error(
                "work_project_preview_too_large",
                "Text preview exceeds the 1 MiB limit.",
            ));
        }
        let bytes = fs::read(&file)
            .map_err(|error| io_error("work_project_preview_read_failed", error))?;
        let content = String::from_utf8(bytes).map_err(|_| {
            file_error(
                "work_project_preview_not_utf8",
                "Text preview is not valid UTF-8.",
            )
        })?;
        return Ok(WorkProjectPreview {
            relative_path,
            kind: WorkProjectPreviewKind::Text,
            media_type: Some(media_type.into()),
            size: metadata.len(),
            content: Some(content),
            data_url: None,
        });
    }
    Ok(WorkProjectPreview {
        relative_path,
        kind: WorkProjectPreviewKind::Unsupported,
        media_type: None,
        size: metadata.len(),
        content: None,
        data_url: None,
    })
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{list_project_directory, preview_project_file, WorkProjectPreviewKind};
    use crate::shared::hermes_core::tasks::HermesTaskStore;
    use crate::shared::hermes_core::types::{WorkTask, WorkTaskStatus, WORK_SCHEMA_VERSION};

    fn root(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "blackrain-work-files-{label}-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    fn task(project_path: &Path) -> WorkTask {
        WorkTask {
            schema_version: WORK_SCHEMA_VERSION,
            task_id: "task-files".into(),
            activation_id: Some("activation-files".into()),
            workbench_id: "com.blackrain.files".into(),
            workbench_version: "0.1.0".into(),
            project_path: project_path.to_string_lossy().to_string(),
            title: None,
            pinned: false,
            archived: false,
            model: None,
            hermes_session_id: None,
            active_run_id: None,
            status: WorkTaskStatus::Completed,
            last_event_sequence: 0,
            created_at: 1.0,
            updated_at: 1.0,
            recovery: Default::default(),
            activation_migrations: Vec::new(),
        }
    }

    #[test]
    fn lists_directories_first_and_previews_utf8_text() {
        let app = root("list");
        let project = app.join("project");
        fs::create_dir_all(project.join("reports")).unwrap();
        fs::write(project.join("notes.md"), "季度摘要").unwrap();
        let store = HermesTaskStore::new(&app);
        store.upsert_task(&task(&project)).unwrap();

        let entries = list_project_directory(&store, "task-files", "").unwrap();
        assert_eq!(entries[0].name, "reports");
        assert_eq!(entries[1].relative_path, "notes.md");
        let preview = preview_project_file(&store, "task-files", "notes.md").unwrap();
        assert_eq!(preview.kind, WorkProjectPreviewKind::Text);
        assert_eq!(preview.content.as_deref(), Some("季度摘要"));
        fs::remove_dir_all(app).unwrap();
    }

    #[test]
    fn rejects_parent_traversal_and_does_not_parse_office_files() {
        let app = root("guard");
        let project = app.join("project");
        fs::create_dir_all(&project).unwrap();
        fs::write(project.join("report.docx"), b"PK\x03\x04").unwrap();
        let store = HermesTaskStore::new(&app);
        store.upsert_task(&task(&project)).unwrap();

        let error = list_project_directory(&store, "task-files", "../").unwrap_err();
        assert_eq!(error.code, "work_project_path_escape");
        let preview = preview_project_file(&store, "task-files", "report.docx").unwrap();
        assert_eq!(preview.kind, WorkProjectPreviewKind::Unsupported);
        assert!(preview.content.is_none());
        fs::remove_dir_all(app).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinks_inside_the_project() {
        use std::os::unix::fs::symlink;

        let app = root("symlink");
        let project = app.join("project");
        fs::create_dir_all(&project).unwrap();
        fs::write(app.join("secret.txt"), "secret").unwrap();
        symlink(app.join("secret.txt"), project.join("linked.txt")).unwrap();
        let store = HermesTaskStore::new(&app);
        store.upsert_task(&task(&project)).unwrap();

        let error = preview_project_file(&store, "task-files", "linked.txt").unwrap_err();
        assert_eq!(error.code, "work_project_link_rejected");
        fs::remove_dir_all(app).unwrap();
    }
}
