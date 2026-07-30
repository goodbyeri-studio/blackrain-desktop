import path from "node:path";

export type CodexHomeSelection =
  | { mode: "standard" }
  | { mode: "custom"; path: string };

export function applyCodexHomeSelection(
  environment: NodeJS.ProcessEnv,
  selection: CodexHomeSelection = { mode: "standard" },
): NodeJS.ProcessEnv {
  const next = { ...environment };
  if (selection.mode === "standard") {
    return next;
  }

  const selectedPath = selection.path.trim();
  if (!selectedPath || !path.isAbsolute(selectedPath)) {
    throw new Error("CODEX_HOME 必须指向绝对路径");
  }
  next.CODEX_HOME = path.normalize(selectedPath);
  return next;
}
