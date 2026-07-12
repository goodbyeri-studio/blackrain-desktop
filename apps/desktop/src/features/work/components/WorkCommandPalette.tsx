import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Search from "lucide-react/dist/esm/icons/search";

import { ModalShell } from "@/features/design-system/components/modal/ModalShell";

export type WorkCommand = {
  id: string;
  label: string;
  detail: string;
  icon: ReactNode;
  onSelect: () => void;
};

type WorkCommandPaletteProps = {
  commands: WorkCommand[];
  onClose: () => void;
};

export function WorkCommandPalette({ commands, onClose }: WorkCommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const visibleCommands = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) {
      return commands;
    }
    return commands.filter((command) =>
      `${command.label} ${command.detail}`.toLocaleLowerCase().includes(normalized),
    );
  }, [commands, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const choose = (command: WorkCommand | undefined) => {
    if (!command) {
      return;
    }
    onClose();
    command.onSelect();
  };

  return (
    <ModalShell
      className="work-command-modal"
      cardClassName="work-command-card"
      ariaLabel="WORK 命令"
      onBackdropClick={onClose}
      onEscapeKeyDown={onClose}
    >
      <label className="work-command-search">
        <Search aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => {
                if (visibleCommands.length === 0) {
                  return 0;
                }
                const delta = event.key === "ArrowDown" ? 1 : -1;
                return (current + delta + visibleCommands.length) % visibleCommands.length;
              });
            }
            if (event.key === "Enter") {
              event.preventDefault();
              choose(visibleCommands[activeIndex]);
            }
          }}
          placeholder="搜索任务和命令"
          aria-label="搜索 WORK 命令"
        />
        <kbd>Esc</kbd>
      </label>
      <div className="work-command-list" role="listbox" aria-label="可用命令">
        {visibleCommands.length > 0 ? (
          visibleCommands.map((command, index) => (
            <button
              type="button"
              key={command.id}
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? "is-active" : ""}
              onMouseMove={() => setActiveIndex(index)}
              onClick={() => choose(command)}
            >
              <span className="work-command-icon">{command.icon}</span>
              <span>
                <strong>{command.label}</strong>
                <small>{command.detail}</small>
              </span>
            </button>
          ))
        ) : (
          <div className="work-command-empty">没有匹配的命令</div>
        )}
      </div>
    </ModalShell>
  );
}
