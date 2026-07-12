import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Boxes from "lucide-react/dist/esm/icons/boxes";
import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import ClipboardCheck from "lucide-react/dist/esm/icons/clipboard-check";
import Eye from "lucide-react/dist/esm/icons/eye";
import FileText from "lucide-react/dist/esm/icons/file-text";
import FolderOpen from "lucide-react/dist/esm/icons/folder-open";
import PackageOpen from "lucide-react/dist/esm/icons/package-open";
import SquareTerminal from "lucide-react/dist/esm/icons/square-terminal";
import Wrench from "lucide-react/dist/esm/icons/wrench";

import type {
  ActivatedWorkbenchContext,
  WorkEvent,
  WorkProjectEntry,
  WorkProjectPreview,
  WorkTask,
} from "../types";
import { resolveProjectOutputPath } from "../state/selectors";

const WorkTerminalPanel = lazy(() =>
  import("./WorkTerminalPanel").then((module) => ({ default: module.WorkTerminalPanel })),
);

export type WorkRailTab = "files" | "preview" | "artifacts" | "review" | "tools" | "terminal";
type TerminalWorkEvent = Extract<
  WorkEvent,
  { type: "toolStarted" | "toolCompleted" }
>;

type WorkResourceRailProps = {
  activation: ActivatedWorkbenchContext | null;
  events: WorkEvent[];
  task: WorkTask | null;
  activeTab: WorkRailTab;
  onTabChange: (tab: WorkRailTab) => void;
  onOpenPath: (path: string) => void;
  onListProjectDirectory: (taskId: string, relativePath?: string) => Promise<WorkProjectEntry[]>;
  onPreviewProjectFile: (taskId: string, relativePath: string) => Promise<WorkProjectPreview>;
  onCollapse: () => void;
};

function basename(path: string) {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

function relativeProjectPath(projectPath: string, absolutePath: string) {
  const root = projectPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const candidate = absolutePath.replace(/\\/g, "/");
  if (candidate.toLowerCase() === root.toLowerCase()) {
    return "";
  }
  const prefix = `${root}/`;
  if (!candidate.toLowerCase().startsWith(prefix.toLowerCase())) {
    return null;
  }
  return candidate.slice(prefix.length);
}

function parentDirectory(path: string) {
  const segments = path.split("/").filter(Boolean);
  segments.pop();
  return segments.join("/");
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return error instanceof Error ? error.message : "无法读取项目文件。";
}

function EmptyRailState({ children }: { children: string }) {
  return (
    <div className="work-rail-empty">
      <FileText aria-hidden />
      <span>{children}</span>
    </div>
  );
}

export function WorkResourceRail({
  activation,
  events,
  task,
  activeTab,
  onTabChange,
  onOpenPath,
  onListProjectDirectory,
  onPreviewProjectFile,
  onCollapse,
}: WorkResourceRailProps) {
  const tab = activeTab;
  const taskId = task?.taskId ?? null;
  const projectPath = task?.projectPath ?? activation?.project.path ?? "";
  const files = useMemo(() => {
    const byPath = new Map<string, {
      path: string;
      kind: "input" | "output";
      mediaType: string | null;
    }>();
    for (const event of events) {
      if (event.type === "userMessageAdded") {
        for (const path of event.projectFileRefs) {
          byPath.set(path, { path, kind: "input", mediaType: null });
        }
      }
      if (event.type === "outputAvailable") {
        const resolved = resolveProjectOutputPath(projectPath, event.path);
        if (resolved) {
          byPath.set(resolved, {
            path: resolved,
            kind: "output",
            mediaType: event.mediaType,
          });
        }
      }
    }
    return Array.from(byPath.values());
  }, [events, projectPath]);
  const terminalEvents = events.filter(
    (event): event is TerminalWorkEvent =>
      (event.type === "toolStarted" || event.type === "toolCompleted") &&
      /terminal|shell|powershell|cmd/i.test(event.tool),
  );
  const artifacts = files.filter((file) => file.kind === "output");
  const completedTools = events.filter((event) => event.type === "toolCompleted");
  const warnings = events.filter(
    (event) => event.type === "warningRaised" || event.type === "taskFailed",
  );
  const [directoryPath, setDirectoryPath] = useState("");
  const [directoryEntries, setDirectoryEntries] = useState<WorkProjectEntry[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<WorkProjectPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const directoryRequestRef = useRef(0);
  const previewRequestRef = useRef(0);
  const previewAbsolutePath = previewPath
    ? resolveProjectOutputPath(projectPath, previewPath)
    : null;

  const loadDirectory = useCallback(async (path: string) => {
    if (!taskId) {
      setDirectoryEntries([]);
      return;
    }
    const request = ++directoryRequestRef.current;
    setDirectoryLoading(true);
    setDirectoryError(null);
    try {
      const entries = await onListProjectDirectory(taskId, path);
      if (directoryRequestRef.current !== request) {
        return;
      }
      setDirectoryPath(path);
      setDirectoryEntries(entries);
    } catch (error) {
      if (directoryRequestRef.current === request) {
        setDirectoryError(errorMessage(error));
      }
    } finally {
      if (directoryRequestRef.current === request) {
        setDirectoryLoading(false);
      }
    }
  }, [onListProjectDirectory, taskId]);

  useEffect(() => {
    directoryRequestRef.current += 1;
    previewRequestRef.current += 1;
    setDirectoryPath("");
    setPreviewPath(null);
    setPreview(null);
    setPreviewError(null);
    setDirectoryEntries([]);
  }, [taskId]);

  useEffect(() => {
    if (taskId && tab === "files") {
      void loadDirectory("");
    }
  }, [loadDirectory, tab, taskId]);

  const selectPreview = async (relativePath: string) => {
    if (!taskId) {
      return;
    }
    setPreviewPath(relativePath);
    const request = ++previewRequestRef.current;
    setPreview(null);
    setPreviewLoading(true);
    setPreviewError(null);
    onTabChange("preview");
    try {
      const result = await onPreviewProjectFile(taskId, relativePath);
      if (previewRequestRef.current === request) {
        setPreview(result);
      }
    } catch (error) {
      if (previewRequestRef.current === request) {
        setPreviewError(errorMessage(error));
      }
    } finally {
      if (previewRequestRef.current === request) {
        setPreviewLoading(false);
      }
    }
  };

  const selectEventFile = (path: string) => {
    const relative = relativeProjectPath(projectPath, path);
    if (relative !== null) {
      void selectPreview(relative);
    }
  };

  return (
    <aside className="work-resource-rail" aria-label="任务资源">
      <header className="work-resource-rail-header">
        <div className="work-resource-tabs" role="tablist" aria-label="任务资源视图">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "artifacts"}
            className={tab === "artifacts" ? "is-active" : ""}
            onClick={() => onTabChange("artifacts")}
            title="成果"
          >
            <PackageOpen aria-hidden />
            <span>成果</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "review"}
            className={tab === "review" ? "is-active" : ""}
            onClick={() => onTabChange("review")}
            title="审阅"
          >
            <ClipboardCheck aria-hidden />
            <span>审阅</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "preview"}
            className={tab === "preview" ? "is-active" : ""}
            onClick={() => onTabChange("preview")}
            title="预览"
          >
            <Eye aria-hidden />
            <span>预览</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "files"}
            className={tab === "files" ? "is-active" : ""}
            onClick={() => onTabChange("files")}
            title="文件"
          >
            <FolderOpen aria-hidden />
            <span>文件</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "tools"}
            className={tab === "tools" ? "is-active" : ""}
            onClick={() => onTabChange("tools")}
            title="工具"
          >
            <Boxes aria-hidden />
            <span>工具</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "terminal"}
            className={tab === "terminal" ? "is-active" : ""}
            onClick={() => onTabChange("terminal")}
            title="终端活动"
          >
            <SquareTerminal aria-hidden />
            <span>终端</span>
          </button>
        </div>
        <button
          type="button"
          className="ghost icon-button work-rail-collapse"
          onClick={onCollapse}
          aria-label="收起任务资源"
          title="收起任务资源"
        >
          <ChevronRight aria-hidden />
        </button>
      </header>

      <div className="work-resource-content">
        {tab === "files" ? (
          <div className="work-resource-section" role="tabpanel">
            <div className="work-resource-project">
              {directoryPath ? (
                <button
                  type="button"
                  className="ghost icon-button"
                  aria-label="返回上级目录"
                  onClick={() => void loadDirectory(parentDirectory(directoryPath))}
                >
                  <ChevronLeft aria-hidden />
                </button>
              ) : <FolderOpen aria-hidden />}
              <span title={projectPath}>{projectPath ? basename(projectPath) : "未选择项目"}</span>
            </div>
            {directoryPath ? <code className="work-directory-path">/{directoryPath}</code> : null}
            {directoryLoading ? <small role="status">正在读取目录...</small> : null}
            {directoryError ? <small role="alert" className="work-resource-error">{directoryError}</small> : null}
            {!task ? (
              <EmptyRailState>选择任务后浏览项目文件</EmptyRailState>
            ) : directoryEntries.length === 0 && !directoryLoading ? (
              <EmptyRailState>此目录为空</EmptyRailState>
            ) : (
              <div className="work-resource-list">
                {directoryEntries.map((entry) => (
                  <button
                    type="button"
                    key={entry.relativePath}
                    onClick={() => entry.kind === "directory"
                      ? void loadDirectory(entry.relativePath)
                      : void selectPreview(entry.relativePath)}
                    title={entry.relativePath}
                  >
                    {entry.kind === "directory" ? <FolderOpen aria-hidden /> : <FileText aria-hidden />}
                    <span>{entry.name}</span>
                    <small>{entry.kind === "directory" ? "目录" : entry.size?.toLocaleString()}</small>
                  </button>
                ))}
              </div>
            )}
            {files.length > 0 ? (
              <>
                <h3>本任务相关</h3>
                <div className="work-resource-list">
                  {files.map((file) => (
                    <button
                      type="button"
                      key={file.path}
                      onClick={() => selectEventFile(file.path)}
                      title={file.path}
                    >
                      <FileText aria-hidden />
                      <span>{basename(file.path)}</span>
                      <small>{file.kind === "output" ? "输出" : "引用"}</small>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {tab === "preview" ? (
          <div className="work-resource-section work-preview-pane" role="tabpanel">
            {previewPath ? (
              <>
                <div className="work-preview-icon"><FileText aria-hidden /></div>
                <h3>{basename(previewPath)}</h3>
                <span>{preview?.mediaType ?? "项目文件"}{preview ? ` · ${preview.size.toLocaleString()} bytes` : ""}</span>
                <code title={previewPath}>{previewPath}</code>
                {previewLoading ? <small role="status">正在读取预览...</small> : null}
                {previewError ? <small role="alert" className="work-resource-error">{previewError}</small> : null}
                {preview?.kind === "text" ? (
                  <pre className="work-file-text-preview">{preview.content}</pre>
                ) : null}
                {preview?.kind === "image" && preview.dataUrl ? (
                  <img className="work-file-image-preview" src={preview.dataUrl} alt={basename(previewPath)} />
                ) : null}
                {preview?.kind === "unsupported" ? (
                  <small>此文件类型不在 WebView 中解析，请使用已安装的桌面应用打开。</small>
                ) : null}
                <button
                  type="button"
                  className="primary"
                  disabled={!previewAbsolutePath}
                  onClick={() => previewAbsolutePath && onOpenPath(previewAbsolutePath)}
                >
                  <FolderOpen aria-hidden />
                  在文件管理器中显示
                </button>
              </>
            ) : (
              <EmptyRailState>从文件或成果列表选择一个项目文件</EmptyRailState>
            )}
          </div>
        ) : null}

        {tab === "review" ? (
          <div className="work-resource-section work-review-pane" role="tabpanel">
            <div className="work-resource-project">
              <ClipboardCheck aria-hidden />
              <span>任务结果审阅</span>
            </div>
            {!task ? (
              <EmptyRailState>选择任务后查看执行结果</EmptyRailState>
            ) : (
              <>
                <dl className="work-review-summary">
                  <div><dt>状态</dt><dd>{task.status}</dd></div>
                  <div><dt>成果</dt><dd>{artifacts.length}</dd></div>
                  <div><dt>工具完成</dt><dd>{completedTools.length}</dd></div>
                  <div><dt>告警/错误</dt><dd>{warnings.length}</dd></div>
                </dl>
                {artifacts.length > 0 ? (
                  <div className="work-resource-list">
                    {artifacts.map((artifact) => (
                      <button
                        type="button"
                        key={artifact.path}
                        onClick={() => selectEventFile(artifact.path)}
                        title={artifact.path}
                      >
                        <FileText aria-hidden />
                        <span>{basename(artifact.path)}</span>
                        <small>审阅成果</small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyRailState>当前任务还没有登记成果</EmptyRailState>
                )}
                <small className="work-review-note">这里只汇总真实事件；确认/驳回结果需要独立 controller 合同后才会启用。</small>
              </>
            )}
          </div>
        ) : null}

        {tab === "tools" ? (
          <div className="work-resource-section" role="tabpanel">
            <h3>Skills</h3>
            {activation?.skillRoots.length ? (
              <div className="work-resource-list is-static">
                {activation.skillRoots.map((root) => (
                  <div key={root} title={root}>
                    <Wrench aria-hidden />
                    <span>{basename(root)}</span>
                    <small>Skill</small>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyRailState>当前 activation 没有声明 Skills</EmptyRailState>
            )}
            <h3>Plugins & MCP</h3>
            {activation && (activation.plugins.length > 0 || activation.mcpServers.length > 0) ? (
              <div className="work-resource-list is-static">
                {activation.plugins.map((plugin) => (
                  <div key={`plugin:${plugin.id}`}>
                    <Boxes aria-hidden />
                    <span>{plugin.id}</span>
                    <small>{plugin.version}</small>
                  </div>
                ))}
                {activation.mcpServers.map((server) => (
                  <div key={`mcp:${server.id}`}>
                    <Boxes aria-hidden />
                    <span>{server.id}</span>
                    <small>MCP</small>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyRailState>当前 activation 没有声明插件或 MCP</EmptyRailState>
            )}
          </div>
        ) : null}

        {tab === "artifacts" ? (
          <div className="work-resource-section" role="tabpanel">
            <div className="work-resource-project">
              <PackageOpen aria-hidden />
              <span>Artifacts</span>
            </div>
            {artifacts.length === 0 ? (
              <EmptyRailState>当前任务还没有结构化成果</EmptyRailState>
            ) : (
              <div className="work-artifact-list">
                {artifacts.map((artifact) => (
                  <button
                    type="button"
                    key={artifact.path}
                    onClick={() => selectEventFile(artifact.path)}
                    title={artifact.path}
                  >
                    <span className="work-artifact-icon"><PackageOpen aria-hidden /></span>
                    <span><strong>{basename(artifact.path)}</strong><small>任务输出</small></span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {tab === "terminal" ? (
          <div className="work-resource-section work-terminal-activity" role="tabpanel">
            <Suspense fallback={<div className="work-terminal-empty">正在加载终端...</div>}>
              <WorkTerminalPanel task={task} />
            </Suspense>
            {terminalEvents.length > 0 ? (
              <div className="work-terminal-history">
                <h3>Agent 终端活动</h3>
                {terminalEvents.map((event) => (
                <div key={event.eventId} className="work-terminal-line">
                  <SquareTerminal aria-hidden />
                  <div>
                    <strong>{event.tool}</strong>
                    <span>
                      {event.type === "toolStarted"
                        ? event.preview ?? "正在执行"
                        : event.error
                          ? "执行失败"
                          : "执行完成"}
                    </span>
                  </div>
                </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
