import { useEffect, useMemo, useRef, useState } from "react";
import Check from "lucide-react/dist/esm/icons/check";
import Search from "lucide-react/dist/esm/icons/search";
import Sparkles from "lucide-react/dist/esm/icons/sparkles";

import { ModalShell } from "@/features/design-system/components/modal/ModalShell";
import type { HermesRuntimeModel } from "../types";

type WorkModelPickerProps = {
  models: HermesRuntimeModel[];
  selectedModel: string | null;
  onSelect: (model: string) => void;
  onClose: () => void;
};

export function WorkModelPicker({
  models,
  selectedModel,
  onSelect,
  onClose,
}: WorkModelPickerProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const visibleModels = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized
      ? models.filter((model) =>
          `${model.id} ${model.ownedBy}`.toLocaleLowerCase().includes(normalized),
        )
      : models;
  }, [models, query]);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setActiveIndex(0), [query]);

  const choose = (model: HermesRuntimeModel | undefined) => {
    if (!model) {
      return;
    }
    onSelect(model.id);
    onClose();
  };

  return (
    <ModalShell
      className="work-model-modal"
      cardClassName="work-model-card"
      ariaLabel="选择 WORK 模型"
      onBackdropClick={onClose}
      onEscapeKeyDown={onClose}
    >
      <header className="work-model-header">
        <Sparkles aria-hidden />
        <div>
          <strong>选择模型</strong>
          <small>来自当前 Hermes runtime `/v1/models`</small>
        </div>
      </header>
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
                if (visibleModels.length === 0) {
                  return 0;
                }
                const delta = event.key === "ArrowDown" ? 1 : -1;
                return (current + delta + visibleModels.length) % visibleModels.length;
              });
            }
            if (event.key === "Enter") {
              event.preventDefault();
              choose(visibleModels[activeIndex]);
            }
          }}
          placeholder="搜索模型"
          aria-label="搜索 WORK 模型"
        />
        <kbd>Esc</kbd>
      </label>
      <div className="work-model-list" role="listbox" aria-label="可用 WORK 模型">
        {visibleModels.length > 0 ? visibleModels.map((model, index) => (
          <button
            type="button"
            role="option"
            aria-selected={model.id === selectedModel}
            className={index === activeIndex ? "is-active" : ""}
            key={model.id}
            onMouseMove={() => setActiveIndex(index)}
            onClick={() => choose(model)}
          >
            <span>
              <strong>{model.id}</strong>
              <small>{model.ownedBy}</small>
            </span>
            {model.id === selectedModel ? <Check aria-hidden /> : null}
          </button>
        )) : <div className="work-command-empty">没有匹配的模型</div>}
      </div>
    </ModalShell>
  );
}
