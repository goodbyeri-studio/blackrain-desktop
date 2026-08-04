import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

export type CodexHomeSelection =
  | { mode: "standard" }
  | { mode: "custom"; path: string };

/**
 * 返回 Codex 原生 Home 的稳定、不泄露路径的标识。
 * Home 仍由 codex.exe 解析和持久化；Electron 只用该标识隔离自己的索引。
 */
export function resolveCodexHomePath(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  selection: CodexHomeSelection = { mode: "standard" },
): string {
  if (selection.mode === "custom") {
    const selectedPath = selection.path.trim();
    if (!selectedPath || !path.isAbsolute(selectedPath)) {
      throw new Error("CODEX_HOME 必须指向绝对路径");
    }
    return path.normalize(selectedPath);
  }
  const inherited = environment.CODEX_HOME?.trim();
  if (inherited) {
    if (!path.isAbsolute(inherited)) {
      throw new Error("CODEX_HOME 必须指向绝对路径");
    }
    return path.normalize(inherited);
  }
  const home = environment.USERPROFILE?.trim() || environment.HOME?.trim() || os.homedir();
  return path.join(home, ".codex");
}

export function codexHomeId(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  selection: CodexHomeSelection = { mode: "standard" },
): string {
  const resolved = resolveCodexHomePath(environment, selection);
  return crypto.createHash("sha256").update(path.resolve(resolved).toLowerCase()).digest("hex").slice(0, 32);
}

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
