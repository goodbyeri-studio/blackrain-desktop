import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2";
import Copy from "lucide-react/dist/esm/icons/copy";
import FileOutput from "lucide-react/dist/esm/icons/file-output";
import LoaderCircle from "lucide-react/dist/esm/icons/loader-circle";
import Paperclip from "lucide-react/dist/esm/icons/paperclip";
import TerminalSquare from "lucide-react/dist/esm/icons/square-terminal";

import { Markdown } from "@/features/messages/components/Markdown";
import {
  resolveProjectOutputPath,
  resolveWorkMessageFilePath,
} from "../state/selectors";
import type { WorkEvent } from "../types";

type WorkEventRowProps = {
  event: WorkEvent;
  projectPath: string;
  onOpenOutput: (path: string) => void;
};

function CopyMessageButton({ text }: { text: string }) {
  return (
    <button
      type="button"
      className="ghost icon-button work-message-copy"
      aria-label="复制消息"
      title="复制消息"
      onClick={() => void navigator.clipboard.writeText(text)}
    >
      <Copy aria-hidden />
    </button>
  );
}

function ToolEvent({ event }: { event: Extract<WorkEvent, { type: "toolStarted" | "toolProgress" | "toolCompleted" }> }) {
  const completed = event.type === "toolCompleted";
  const failed = completed && event.error;
  return (
    <div className={`work-tool-card${failed ? " is-error" : ""}`}>
      <span className="work-tool-icon" aria-hidden>
        {completed ? <CheckCircle2 /> : <LoaderCircle className="is-spinning" />}
      </span>
      <div className="work-tool-copy">
        <strong>{event.tool}</strong>
        {event.type === "toolStarted" && event.preview ? <code>{event.preview}</code> : null}
        {event.type === "toolProgress" ? <span>{event.text}</span> : null}
        {completed ? (
          <span>
            {failed ? "工具执行失败" : "工具执行完成"}
            {event.duration !== null ? ` · ${Math.round(event.duration)} ms` : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function WorkEventRow({ event, projectPath, onOpenOutput }: WorkEventRowProps) {
  switch (event.type) {
    case "userMessageAdded":
      return (
        <article className="work-message-row is-user">
          <div className="work-message-bubble">
            <span>{event.text}</span>
            {event.projectFileRefs.length > 0 ? (
              <div className="work-message-files" aria-label="本轮项目文件引用">
                {event.projectFileRefs.map((path) => {
                  const parts = path.split(/[\\/]/).filter(Boolean);
                  const name = parts[parts.length - 1] ?? path;
                  return (
                    <span key={path} className="work-composer-file" title={path}>
                      <Paperclip aria-hidden />
                      <span>{name}</span>
                    </span>
                  );
                })}
              </div>
            ) : null}
          </div>
          <CopyMessageButton text={event.text} />
        </article>
      );
    case "agentTextDelta":
      return (
        <article className="work-message-row is-agent is-streaming">
          <div className="work-message-content">
            <Markdown
              value={event.delta}
              workspacePath={projectPath}
              onOpenFileLink={(target) => {
                const resolved = resolveWorkMessageFilePath(projectPath, target.path);
                if (resolved) {
                  onOpenOutput(resolved);
                }
              }}
            />
          </div>
          <CopyMessageButton text={event.delta} />
        </article>
      );
    case "agentMessageCompleted":
      return (
        <article className="work-message-row is-agent">
          <div className="work-message-content">
            <Markdown
              value={event.text}
              workspacePath={projectPath}
              onOpenFileLink={(target) => {
                const resolved = resolveWorkMessageFilePath(projectPath, target.path);
                if (resolved) {
                  onOpenOutput(resolved);
                }
              }}
            />
          </div>
          <CopyMessageButton text={event.text} />
        </article>
      );
    case "reasoningUpdated":
      return (
        <div className="work-progress-row">
          <LoaderCircle className="is-spinning" aria-hidden />
          <span>{event.text}</span>
        </div>
      );
    case "toolStarted":
    case "toolProgress":
    case "toolCompleted":
      return <ToolEvent event={event} />;
    case "outputAvailable": {
      const pathSegments = event.path.split(/[\\/]/);
      const resolvedPath = resolveProjectOutputPath(projectPath, event.path);
      return (
        <button
          type="button"
          className="work-output-card"
          onClick={() => resolvedPath && onOpenOutput(resolvedPath)}
          disabled={!resolvedPath}
        >
          <FileOutput aria-hidden />
          <span>
            <strong>{pathSegments[pathSegments.length - 1] || event.path}</strong>
            <small>
              {event.mediaType ?? "输出文件"} · {resolvedPath ? "在文件管理器中显示" : "路径不在当前项目内"}
            </small>
          </span>
        </button>
      );
    }
    case "warningRaised":
      return (
        <div className="work-warning-row">
          <AlertTriangle aria-hidden />
          <span>{event.message}</span>
        </div>
      );
    case "taskFailed":
      return (
        <div className="work-warning-row is-error">
          <AlertTriangle aria-hidden />
          <span>{event.error.message}</span>
        </div>
      );
    case "userInputRequested":
      return (
        <div className="work-input-request-card">
          <TerminalSquare aria-hidden />
          <div>
            <strong>{event.prompt}</strong>
            {event.choices.length > 0 ? (
              <div className="work-input-request-choices" aria-label="Hermes 提供的选项">
                {event.choices.map((choice) => <span key={choice}>{choice}</span>)}
              </div>
            ) : null}
            <span>
              当前锁定 Hermes `/v1` 尚未提供 user input response 接口，不能伪造提交。
            </span>
          </div>
        </div>
      );
    case "usageUpdated":
      return (
        <div className="work-usage-row" aria-label="本轮模型用量">
          <span>输入 {event.inputTokens.toLocaleString()}</span>
          <span>输出 {event.outputTokens.toLocaleString()}</span>
          <strong>总计 {event.totalTokens.toLocaleString()} tokens</strong>
        </div>
      );
    case "unknown":
      return <div className="work-diagnostic-event">未识别事件：{event.rawEventType}</div>;
    default:
      return null;
  }
}
