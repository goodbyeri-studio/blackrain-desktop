import { existsSync } from "node:fs";
import path from "node:path";

export type CodexExecutableOptions = {
  resourcesPath: string;
  override?: string;
  allowOverride?: boolean;
  platform?: NodeJS.Platform;
};

export function resolveCodexExecutablePath(
  options: CodexExecutableOptions,
): string {
  const override = options.override?.trim();
  if (override) {
    if (!options.allowOverride) {
      throw new Error("正式制品不允许通过 BLACKRAIN_CODEX_BIN 替换 bundled codex.exe");
    }
    return requireExecutable(override, "BLACKRAIN_CODEX_BIN");
  }
  if ((options.platform ?? process.platform) !== "win32") {
    throw new Error("BlackRain Electron MVP 仅解析 Windows bundled codex.exe");
  }
  return requireExecutable(
    path.join(options.resourcesPath, "codex", "windows-x64", "codex.exe"),
    "bundled codex.exe",
  );
}

function requireExecutable(candidate: string, source: string): string {
  if (!path.isAbsolute(candidate)) {
    throw new Error(`${source} 必须是绝对路径`);
  }
  const normalized = path.normalize(candidate);
  if (!existsSync(normalized)) {
    throw new Error(`${source} 不存在: ${normalized}`);
  }
  return normalized;
}
