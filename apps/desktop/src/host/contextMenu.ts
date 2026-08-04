import type { MouseEvent } from "react";
import { getHostClient } from "./client";

export type ContextMenuAction = {
  id: string;
  label: string;
  enabled?: boolean;
  onSelect: () => void | Promise<void>;
};

export type ContextMenuEntry = ContextMenuAction | { kind: "separator" };

export async function showContextMenu(
  event: MouseEvent,
  entries: readonly ContextMenuEntry[],
): Promise<void> {
  event.preventDefault();
  event.stopPropagation();
  const actions = entries.filter((entry): entry is ContextMenuAction => "id" in entry);
  const selected = await getHostClient().menu.popup({
    x: Math.round(event.clientX),
    y: Math.round(event.clientY),
    items: entries.map((entry) => "id" in entry
      ? {
          kind: "item" as const,
          id: entry.id,
          label: entry.label,
          enabled: entry.enabled,
        }
      : { kind: "separator" as const }),
  });
  const action = actions.find((entry) => entry.id === selected);
  if (action) await action.onSelect();
}
