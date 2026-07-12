import { useEffect, useMemo, useState } from "react";
import Play from "lucide-react/dist/esm/icons/play";
import Square from "lucide-react/dist/esm/icons/square";

import { TerminalPanel } from "@/features/terminal/components/TerminalPanel";
import {
  useTerminalSession,
  type TerminalSessionTransport,
} from "@/features/terminal/hooks/useTerminalSession";
import {
  hermesTerminalClose,
  hermesTerminalOpen,
  hermesTerminalResize,
  hermesTerminalWrite,
} from "@/services/tauri";
import type { WorkTask } from "../types";

const TERMINAL_ID = "work-shell";

type WorkTerminalPanelProps = {
  task: WorkTask | null;
};

function messageOf(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return error instanceof Error ? error.message : "终端操作失败。";
}

export function WorkTerminalPanel({ task }: WorkTerminalPanelProps) {
  const [enabled, setEnabled] = useState(false);
  const [focusRequestVersion, setFocusRequestVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const taskId = task?.taskId ?? null;
  const scopeId = taskId ? `work:${taskId}` : null;
  const transport = useMemo<TerminalSessionTransport | undefined>(() => {
    if (!taskId) {
      return undefined;
    }
    return {
      open: (_scopeId, terminalId, cols, rows) =>
        hermesTerminalOpen(taskId, terminalId, cols, rows),
      write: (_scopeId, terminalId, data) =>
        hermesTerminalWrite(taskId, terminalId, data),
      resize: (_scopeId, terminalId, cols, rows) =>
        hermesTerminalResize(taskId, terminalId, cols, rows),
    };
  }, [taskId]);
  const terminal = useTerminalSession({
    activeWorkspace: scopeId ? { id: scopeId } : null,
    activeTerminalId: taskId ? TERMINAL_ID : null,
    isVisible: Boolean(taskId && enabled),
    focusRequestVersion,
    transport,
  });

  useEffect(() => {
    setEnabled(false);
    setError(null);
  }, [taskId]);

  if (!taskId || !scopeId) {
    return <div className="work-terminal-empty">选择任务后可在其项目目录打开终端。</div>;
  }

  const stopTerminal = async () => {
    setEnabled(false);
    setError(null);
    try {
      await hermesTerminalClose(taskId, TERMINAL_ID);
    } catch (closeError) {
      const message = messageOf(closeError);
      if (!message.toLowerCase().includes("terminal session not found")) {
        setError(message);
      }
    } finally {
      terminal.cleanupTerminalSession(scopeId, TERMINAL_ID);
    }
  };

  if (!enabled) {
    return (
      <div className="work-terminal-empty">
        <span>终端将在当前任务的项目目录中启动。</span>
        <button
          type="button"
          className="primary"
          onClick={() => {
            setError(null);
            setEnabled(true);
            setFocusRequestVersion((current) => current + 1);
          }}
        >
          <Play aria-hidden />
          启动终端
        </button>
        {error ? <small role="alert">{error}</small> : null}
      </div>
    );
  }

  return (
    <div className="work-terminal-panel">
      <header>
        <span>{task?.projectPath ?? ""}</span>
        <button
          type="button"
          className="ghost icon-button"
          aria-label="停止 WORK 终端"
          title="停止 WORK 终端"
          onClick={() => void stopTerminal()}
        >
          <Square aria-hidden />
        </button>
      </header>
      <div className="work-terminal-surface" onClick={() => setFocusRequestVersion((current) => current + 1)}>
        <TerminalPanel
          containerRef={terminal.containerRef}
          status={terminal.status}
          message={terminal.message}
        />
      </div>
      {error ? <small role="alert">{error}</small> : null}
    </div>
  );
}
