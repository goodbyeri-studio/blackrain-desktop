import { existsSync } from "node:fs";
import path from "node:path";

export type NodeRuntimeOptions = {
  resourcesPath: string;
  override?: string;
  allowOverride?: boolean;
  platform?: NodeJS.Platform;
  arch?: NodeJS.Architecture;
};

/**
 * 随包 Node runtime 的平台布局。Browser MCP adapter 用它做 stdio 宿主。
 * 与 `resources/node-runtime/runtime-lock.json` 的 `platforms` 键一一对应，
 * 新增平台时两处必须同时更新。
 */
const RUNTIME_LAYOUTS = {
  darwin: {
    directory: "darwin-arm64",
    executable: path.join("bin", "node"),
    arch: "arm64",
  },
  win32: { directory: "windows-x64", executable: "node.exe", arch: "x64" },
} as const satisfies Partial<
  Record<
    NodeJS.Platform,
    { directory: string; executable: string; arch: NodeJS.Architecture }
  >
>;

/**
 * 解析随包 Node 可执行文件。未打包时允许用 BLACKRAIN_NODE_BIN 覆盖，
 * 或回退到 PATH 上的 `node`；正式制品只接受 vendored runtime。
 */
export function resolveNodeRuntimePath(options: NodeRuntimeOptions): string {
  const override = options.override?.trim();
  if (override) {
    if (!options.allowOverride) {
      throw new Error(
        "正式制品不允许通过 BLACKRAIN_NODE_BIN 替换 bundled Node runtime",
      );
    }
    return override;
  }

  const platform = options.platform ?? process.platform;
  const layout = RUNTIME_LAYOUTS[platform as keyof typeof RUNTIME_LAYOUTS];
  if (!layout) {
    throw new Error(
      `BlackRain 未提供 ${platform} 的 bundled Node runtime；当前支持 ${Object.keys(RUNTIME_LAYOUTS).join(" / ")}`,
    );
  }

  const arch = options.arch ?? process.arch;
  if (arch !== layout.arch) {
    throw new Error(
      `BlackRain 未提供 ${platform}-${arch} 的 bundled Node runtime；当前只支持 ${platform}-${layout.arch}`,
    );
  }

  const candidate = path.join(
    options.resourcesPath,
    "node-runtime",
    layout.directory,
    layout.executable,
  );
  const normalized = path.normalize(candidate);
  if (!existsSync(normalized)) {
    throw new Error(`bundled Node runtime 不存在: ${normalized}`);
  }
  return normalized;
}
