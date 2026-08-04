import { getOptionalHostClient } from "../host/client";

export type DragDropPayload = {
  type: "enter" | "over" | "leave" | "drop";
  position: { x: number; y: number };
  paths?: string[];
};

export type DragDropEvent = { payload: DragDropPayload };
type Listener = (event: DragDropEvent) => void;
type SubscriptionOptions = { onError?: (error: unknown) => void };

const listeners = new Set<Listener>();
let started = false;

function dispatch(payload: DragDropPayload) {
  for (const listener of listeners) {
    try {
      listener({ payload });
    } catch (error) {
      console.error("[drag-drop] listener failed", error);
    }
  }
}

function start(options?: SubscriptionOptions) {
  if (started || typeof window === "undefined") return;
  started = true;
  const position = (event: DragEvent) => ({ x: event.clientX, y: event.clientY });
  const enter = (event: DragEvent) => {
    event.preventDefault();
    dispatch({ type: "enter", position: position(event) });
  };
  const over = (event: DragEvent) => {
    event.preventDefault();
    dispatch({ type: "over", position: position(event) });
  };
  const leave = (event: DragEvent) => {
    event.preventDefault();
    dispatch({ type: "leave", position: position(event) });
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    try {
      const host = getOptionalHostClient();
      const paths = Array.from(event.dataTransfer?.files ?? [])
        .map((file) => host?.files.pathForFile(file) ?? "")
        .filter(Boolean);
      dispatch({ type: "drop", position: position(event), paths });
    } catch (error) {
      options?.onError?.(error);
    }
  };
  window.addEventListener("dragenter", enter);
  window.addEventListener("dragover", over);
  window.addEventListener("dragleave", leave);
  window.addEventListener("drop", drop);
  (start as typeof start & { dispose?: () => void }).dispose = () => {
    window.removeEventListener("dragenter", enter);
    window.removeEventListener("dragover", over);
    window.removeEventListener("dragleave", leave);
    window.removeEventListener("drop", drop);
    started = false;
  };
}

export function subscribeWindowDragDrop(onEvent: Listener, options?: SubscriptionOptions) {
  listeners.add(onEvent);
  start(options);
  return () => {
    listeners.delete(onEvent);
    if (listeners.size === 0) {
      (start as typeof start & { dispose?: () => void }).dispose?.();
    }
  };
}
