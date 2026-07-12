import { useEffect, useState, type RefObject } from "react";

import { subscribeWindowDragDrop } from "@/services/dragDrop";
import { resolveProjectOutputPath } from "../state/selectors";

type WorkProjectDropState = "idle" | "accept" | "reject";

type UseWorkProjectDropArgs = {
  targetRef: RefObject<HTMLElement | null>;
  projectPath: string;
  disabled: boolean;
  onDropFiles: (paths: string[], rejectedCount: number) => void;
};

function normalizePosition(
  position: { x: number; y: number },
  rect: DOMRect,
) {
  const scale = window.devicePixelRatio || 1;
  const scaled = { x: position.x / scale, y: position.y / scale };
  const directInside =
    position.x >= rect.left && position.x <= rect.right &&
    position.y >= rect.top && position.y <= rect.bottom;
  const scaledInside =
    scaled.x >= rect.left && scaled.x <= rect.right &&
    scaled.y >= rect.top && scaled.y <= rect.bottom;
  return !directInside && scaledInside ? scaled : position;
}

export function useWorkProjectDrop({
  targetRef,
  projectPath,
  disabled,
  onDropFiles,
}: UseWorkProjectDropArgs) {
  const [state, setState] = useState<WorkProjectDropState>("idle");

  useEffect(() => {
    if (disabled || !projectPath) {
      setState("idle");
      return undefined;
    }
    return subscribeWindowDragDrop((event) => {
      const target = targetRef.current;
      if (!target) {
        return;
      }
      if (event.payload.type === "leave") {
        setState("idle");
        return;
      }
      const rect = target.getBoundingClientRect();
      const position = normalizePosition(event.payload.position, rect);
      const inside =
        position.x >= rect.left && position.x <= rect.right &&
        position.y >= rect.top && position.y <= rect.bottom;
      if (event.payload.type === "enter" || event.payload.type === "over") {
        setState(inside ? "accept" : "idle");
        return;
      }
      if (event.payload.type !== "drop" || !inside) {
        setState("idle");
        return;
      }
      const paths = Array.from(new Set(
        (event.payload.paths ?? []).map((path) => path.trim()).filter(Boolean),
      ));
      const accepted = paths.filter((path) =>
        Boolean(resolveProjectOutputPath(projectPath, path)),
      );
      setState(accepted.length > 0 ? "accept" : "reject");
      onDropFiles(accepted, paths.length - accepted.length);
      window.setTimeout(() => setState("idle"), 700);
    });
  }, [disabled, onDropFiles, projectPath, targetRef]);

  return state;
}
