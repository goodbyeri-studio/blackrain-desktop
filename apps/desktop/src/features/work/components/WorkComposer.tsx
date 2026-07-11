import { useRef, type KeyboardEvent } from "react";
import ArrowUp from "lucide-react/dist/esm/icons/arrow-up";
import Square from "lucide-react/dist/esm/icons/square";

type WorkComposerProps = {
  value: string;
  disabled: boolean;
  running: boolean;
  canStop: boolean;
  canResume: boolean;
  onChange: (value: string) => void;
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
  onChange,
  onSubmit,
  onStop,
  onResume,
}: WorkComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const canSubmit = value.trim().length > 0 && !disabled && !running;

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
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={running ? "Hermes 正在执行任务…" : "描述你希望 Office 工作台完成的任务"}
          rows={1}
          disabled={disabled || running}
          aria-label="Office 任务指令"
        />
        <div className="work-composer-actions">
          {canResume ? (
            <button type="button" className="ghost" disabled={disabled} onClick={onResume}>
              恢复连接
            </button>
          ) : null}
          {canStop ? (
            <button type="button" className="work-stop-button" disabled={disabled} onClick={onStop} aria-label="停止任务">
              <Square aria-hidden />
            </button>
          ) : (
            <button type="button" className="work-send-button" disabled={!canSubmit} onClick={onSubmit} aria-label="发送任务">
              <ArrowUp aria-hidden />
            </button>
          )}
        </div>
      </div>
      <small>Hermes 可能调用本工作台声明的工具；高影响操作会先请求审批。</small>
    </div>
  );
}
