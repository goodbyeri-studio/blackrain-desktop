import { existsSync } from "node:fs";
import path from "node:path";

export type CodexExecutableOptions = {
  resourcesPath: string;
  override?: string;
  allowOverride?: boolean;
  platform?: NodeJS.Platform;
  arch?: NodeJS.Architecture;
};

/**
 * bundled codex runtime 的平台布局。与
 * `resources/codex/runtime-lock.json` 的 `platforms` 键一一对应，
 * 新增平台时两处必须同时更新。
 */
const RUNTIME_LAYOUTS = {
  darwin: { directory: "darwin-arm64", executable: "codex", arch: "arm64" },
  win32: { directory: "windows-x64", executable: "codex.exe", arch: "x64" },
} as const satisfies Partial<
  Record<
    NodeJS.Platform,
    { directory: string; executable: string; arch: NodeJS.Architecture }
  >
>;

export function resolveCodexExecutablePath(
  options: CodexExecutableOptions,
): string {
  const override = options.override?.trim();
  if (override) {
    if (!options.allowOverride) {
      throw new Error(
        "正式制品不允许通过 BLACKRAIN_CODEX_BIN 替换 bundled codex runtime",
      );
    }
    return requireExecutable(override, "BLACKRAIN_CODEX_BIN");
  }

  const platform = options.platform ?? process.platform;
  const layout = RUNTIME_LAYOUTS[platform as keyof typeof RUNTIME_LAYOUTS];
  if (!layout) {
    throw new Error(
      `BlackRain 未提供 ${platform} 的 bundled codex runtime；当前支持 ${Object.keys(RUNTIME_LAYOUTS).join(" / ")}`,
    );
  }

  // macOS 只 vendored aarch64；在 Intel Mac 上明确报错，而不是解析出一个
  // 架构不匹配的二进制后在 spawn 时给出难以定位的失败。
  const arch = options.arch ?? process.arch;
  if (arch !== layout.arch) {
    throw new Error(
      `BlackRain 未提供 ${platform}-${arch} 的 bundled codex runtime；当前只支持 ${platform}-${layout.arch}`,
    );
  }

  return requireExecutable(
    path.join(
      options.resourcesPath,
      "codex",
      layout.directory,
      "bin",
      layout.executable,
    ),
    `bundled ${layout.executable}`,
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
