import { useEffect, useRef, type KeyboardEvent } from "react";
import ArrowUp from "lucide-react/dist/esm/icons/arrow-up";
import Paperclip from "lucide-react/dist/esm/icons/paperclip";
import Square from "lucide-react/dist/esm/icons/square";
import X from "lucide-react/dist/esm/icons/x";

type WorkComposerProps = {
  value: string;
  disabled: boolean;
  running: boolean;
  canStop: boolean;
  canResume: boolean;
  projectFileRefs: string[];
  canAttach: boolean;
  attachmentError: string | null;
  focusRequestId: number;
  onChange: (value: string) => void;
  onAddFiles: () => void;
  onRemoveFile: (path: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onResume: () => void;
};

export function WorkComposer({
  value,
  disabled,
  running,
  canStop,
  canResume,
  projectFileRefs,
  canAttach,
  attachmentError,
  focusRequestId,
  onChange,
  onAddFiles,
  onRemoveFile,
  onSubmit,
  onStop,
  onResume,
}: WorkComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const canSubmit = value.trim().length > 0 && !disabled;

  useEffect(() => {
    if (focusRequestId > 0 && !disabled) {
      textareaRef.current?.focus();
    }
  }, [disabled, focusRequestId]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSubmit) {
        onSubmit();
      }
    }
  };

  return (
    <div className="work-composer-wrap">
      <div className="work-composer">
        {projectFileRefs.length > 0 ? (
          <div className="work-composer-files" aria-label="项目文件引用">
            {projectFileRefs.map((path) => {
              const parts = path.split(/[\\/]/).filter(Boolean);
              const name = parts[parts.length - 1] ?? path;
              return (
                <span key={path} className="work-composer-file" title={path}>
                  <Paperclip aria-hidden />
                  <span>{name}</span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onRemoveFile(path)}
                    aria-label={`移除项目文件 ${name}`}
                  >
                    <X aria-hidden />
                  </button>
                </span>
              );
            })}
          </div>
        ) : null}
        <div className="work-composer-input-row">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              running
                ? "输入后续任务，将在当前任务结束后执行"
                : "描述你希望 Office 工作台完成的任务"
            }
            rows={1}
            disabled={disabled}
            aria-label="Office 任务指令"
            aria-describedby={
              attachmentError
                ? "work-composer-error work-composer-help"
                : "work-composer-help"
            }
          />
          <div className="work-composer-actions">
            <button
              type="button"
              className="ghost work-attach-button"
              disabled={!canAttach || disabled}
              onClick={onAddFiles}
              aria-label="添加项目文件引用"
            >
              <Paperclip aria-hidden />
            </button>
            {canResume ? (
              <button type="button" className="ghost" disabled={disabled} onClick={onResume}>
                恢复连接
              </button>
            ) : null}
            {canStop ? (
              <button type="button" className="work-stop-button" disabled={disabled} onClick={onStop} aria-label="停止任务">
                <Square aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              className="work-send-button"
              disabled={!canSubmit}
              onClick={onSubmit}
              aria-label={running ? "排队后续任务" : "发送任务"}
            >
              <ArrowUp aria-hidden />
            </button>
          </div>
        </div>
      </div>
      {attachmentError ? (
        <small id="work-composer-error" role="alert">
          {attachmentError}
        </small>
      ) : null}
      <small id="work-composer-help">
        {running
          ? "后续任务会持久化排队；当前 run 结束前不会发送给 Hermes。"
          : "Hermes 可能调用本工作台声明的工具；高影响操作会先请求审批。"}
      </small>
    </div>
  );
}
