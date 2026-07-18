import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import ArrowUp from "lucide-react/dist/esm/icons/arrow-up";
import Bot from "lucide-react/dist/esm/icons/bot";
import Layers3 from "lucide-react/dist/esm/icons/layers-3";
import Mic from "lucide-react/dist/esm/icons/mic";
import Paperclip from "lucide-react/dist/esm/icons/paperclip";
import Plus from "lucide-react/dist/esm/icons/plus";
import Wrench from "lucide-react/dist/esm/icons/wrench";
import Square from "lucide-react/dist/esm/icons/square";
import Sparkles from "lucide-react/dist/esm/icons/sparkles";
import X from "lucide-react/dist/esm/icons/x";

import { useComposerDictationControls } from "@/features/composer/hooks/useComposerDictationControls";
import { DictationWaveform } from "@/features/dictation/components/DictationWaveform";
import type { DictationTranscript } from "@/types";
import { computeDictationInsertion } from "@/utils/dictation";

type WorkComposerProps = {
  value: string;
  disabled: boolean;
  running: boolean;
  canStop: boolean;
  canResume: boolean;
  projectFileRefs: string[];
  canAttach: boolean;
  attachmentError: string | null;
  skillNames: string[];
  selectedModel: string | null;
  focusRequestId: number;
  dictationEnabled: boolean;
  dictationState: "idle" | "listening" | "processing";
  dictationLevel: number;
  dictationTranscript: DictationTranscript | null;
  dictationError: string | null;
  dictationHint: string | null;
  onChange: (value: string) => void;
  onAddFiles: () => void;
  onOpenTools: () => void;
  onOpenModels: () => void;
  onRemoveFile: (path: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onResume: () => void;
  onToggleDictation?: () => void;
  onCancelDictation?: () => void;
  onOpenDictationSettings?: () => void;
  onDictationTranscriptHandled?: (id: string) => void;
  onDismissDictationError?: () => void;
  onDismissDictationHint?: () => void;
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
  skillNames,
  selectedModel,
  focusRequestId,
  dictationEnabled,
  dictationState,
  dictationLevel,
  dictationTranscript,
  dictationError,
  dictationHint,
  onChange,
  onAddFiles,
  onOpenTools,
  onOpenModels,
  onRemoveFile,
  onSubmit,
  onStop,
  onResume,
  onToggleDictation,
  onCancelDictation,
  onOpenDictationSettings,
  onDictationTranscriptHandled,
  onDismissDictationError,
  onDismissDictationHint,
}: WorkComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const handledTranscriptIdRef = useRef<string | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);
  const canSubmit = value.trim().length > 0 && !disabled;
  const slashMatch = /(^|\s)\/([^\s/]*)$/.exec(value);
  const skillQuery = slashMatch?.[2]?.toLocaleLowerCase() ?? null;
  const matchingSkills = useMemo(
    () =>
      skillQuery === null
        ? []
        : skillNames.filter((name) => name.toLocaleLowerCase().includes(skillQuery)).slice(0, 8),
    [skillNames, skillQuery],
  );
  const skillCompletionOpen = matchingSkills.length > 0 && !disabled;
  const {
    handleMicClick,
    isDictating,
    isDictationBusy,
    isDictationProcessing,
    micAriaLabel,
    micDisabled,
    micTitle,
  } = useComposerDictationControls({
    disabled,
    dictationEnabled,
    dictationState,
    onToggleDictation,
    onCancelDictation,
    onOpenDictationSettings,
  });

  useEffect(() => {
    if (focusRequestId > 0 && !disabled) {
      textareaRef.current?.focus();
    }
  }, [disabled, focusRequestId]);

  useEffect(() => {
    setSelectedSkillIndex(0);
  }, [skillQuery]);

  useEffect(() => {
    if (!dictationTranscript || handledTranscriptIdRef.current === dictationTranscript.id) {
      return;
    }
    handledTranscriptIdRef.current = dictationTranscript.id;
    const text = dictationTranscript.text.trim();
    if (text) {
      const start = textareaRef.current?.selectionStart ?? value.length;
      const end = textareaRef.current?.selectionEnd ?? start;
      const { nextText, nextCursor } = computeDictationInsertion(value, text, start, end);
      onChange(nextText);
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
      });
    }
    onDictationTranscriptHandled?.(dictationTranscript.id);
  }, [dictationTranscript, onChange, onDictationTranscriptHandled, value]);

  useEffect(() => {
    if (!actionsOpen) {
      return undefined;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) {
        setActionsOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [actionsOpen]);

  const applySkill = (name: string) => {
    if (!slashMatch) {
      return;
    }
    const start = slashMatch.index + slashMatch[1].length;
    onChange(`${value.slice(0, start)}/${name} `);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (skillCompletionOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setSelectedSkillIndex((current) => {
        const delta = event.key === "ArrowDown" ? 1 : -1;
        return (current + delta + matchingSkills.length) % matchingSkills.length;
      });
      return;
    }
    if (skillCompletionOpen && event.key === "Escape") {
      event.preventDefault();
      onChange(value.replace(/\/([^\s/]*)$/, "$1"));
      return;
    }
    if (skillCompletionOpen && event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      const skill = matchingSkills[selectedSkillIndex];
      if (skill) {
        applySkill(skill);
      }
      return;
    }
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
        {skillCompletionOpen ? (
          <div className="work-skill-completions" role="listbox" aria-label="可用 Skills">
            <div className="work-skill-completions-label">Skills</div>
            {matchingSkills.map((name, index) => (
              <button
                type="button"
                role="option"
                aria-selected={index === selectedSkillIndex}
                className={index === selectedSkillIndex ? "is-selected" : ""}
                key={name}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applySkill(name)}
              >
                <Wrench aria-hidden />
                <span>/{name}</span>
              </button>
            ))}
          </div>
        ) : null}
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
        {isDictationBusy ? (
          <DictationWaveform
            active={isDictating}
            processing={isDictationProcessing}
            level={dictationLevel}
          />
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
                : "你在想什么？"
            }
            rows={2}
            disabled={disabled}
            aria-label="WORK 任务指令"
            aria-describedby={
              attachmentError
                ? "work-composer-error work-composer-help"
                : "work-composer-help"
            }
          />
          <div className="work-composer-actions">
            <div ref={actionsRef} className="work-composer-action-menu">
              <button
                type="button"
                className="ghost work-composer-plus"
                disabled={disabled}
                onClick={() => setActionsOpen((open) => !open)}
                aria-label="打开 Composer 操作"
                aria-expanded={actionsOpen}
              >
                <Plus aria-hidden />
              </button>
              {actionsOpen ? (
                <div className="work-composer-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!canAttach}
                    onClick={() => {
                      setActionsOpen(false);
                      onAddFiles();
                    }}
                  >
                    <Paperclip aria-hidden />
                    <span>添加项目文件</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActionsOpen(false);
                      onOpenTools();
                    }}
                  >
                    <Wrench aria-hidden />
                    <span>Skills 与工具</span>
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className={`ghost work-dictation-button${isDictationBusy ? " is-active" : ""}`}
              disabled={micDisabled}
              onClick={handleMicClick}
              aria-label={micAriaLabel}
              title={micTitle}
            >
              {isDictationProcessing ? (
                <X aria-hidden />
              ) : isDictating ? (
                <Square aria-hidden />
              ) : (
                <Mic aria-hidden />
              )}
            </button>
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
        <div className="work-composer-status">
          <span><Bot /> Hermes Agent</span>
          <button type="button" onClick={onOpenModels} disabled={disabled} aria-label="选择 WORK 模型">
            <Sparkles aria-hidden />
            {selectedModel ?? "选择模型"}
          </button>
          {running ? <span><Layers3 /> 后续消息将排队</span> : null}
        </div>
      </div>
      {attachmentError ? (
        <small id="work-composer-error" role="alert">
          {attachmentError}
        </small>
      ) : null}
      {dictationError ? (
        <small className="work-composer-feedback is-error" role="alert">
          <span>{dictationError}</span>
          <button type="button" onClick={onDismissDictationError} aria-label="关闭听写错误">
            <X aria-hidden />
          </button>
        </small>
      ) : null}
      {dictationHint ? (
        <small className="work-composer-feedback">
          <span>{dictationHint}</span>
          <button type="button" onClick={onDismissDictationHint} aria-label="关闭听写提示">
            <X aria-hidden />
          </button>
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
