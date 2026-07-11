import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2";
import FileOutput from "lucide-react/dist/esm/icons/file-output";
import LoaderCircle from "lucide-react/dist/esm/icons/loader-circle";
import TerminalSquare from "lucide-react/dist/esm/icons/square-terminal";

import { Markdown } from "@/features/messages/components/Markdown";
import { resolveProjectOutputPath } from "../state/selectors";
import type { WorkEvent } from "../types";

type WorkEventRowProps = {
  event: WorkEvent;
  projectPath: string;
  onOpenOutput: (path: string) => void;
};

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
          <div className="work-message-bubble">{event.text}</div>
        </article>
      );
    case "agentTextDelta":
      return (
        <article className="work-message-row is-agent is-streaming">
          <Markdown value={event.delta} workspacePath={projectPath} />
        </article>
      );
    case "agentMessageCompleted":
      return (
        <article className="work-message-row is-agent">
          <Markdown value={event.text} workspacePath={projectPath} />
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
            <span>
              当前锁定 Hermes `/v1` 尚未提供 user input response 接口，不能伪造提交。
            </span>
          </div>
        </div>
      );
    case "unknown":
      return <div className="work-diagnostic-event">未识别事件：{event.rawEventType}</div>;
    default:
      return null;
  }
}
