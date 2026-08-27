import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveNodeRuntimePath } from "./node-runtime-executable";

describe("resolveNodeRuntimePath", () => {
  it("开发覆盖生效，正式制品拒绝覆盖", () => {
    expect(
      resolveNodeRuntimePath({
        resourcesPath: path.dirname(process.execPath),
        override: "node",
        allowOverride: true,
      }),
    ).toBe("node");
    expect(() =>
      resolveNodeRuntimePath({
        resourcesPath: path.dirname(process.execPath),
        override: "node",
        allowOverride: false,
      }),
    ).toThrow(/正式制品/);
  });

  it.each([
    {
      label: "macOS arm64",
      platform: "darwin" as const,
      arch: "arm64" as const,
      directory: "darwin-arm64",
      executable: path.join("bin", "node"),
    },
    {
      label: "Windows x64",
      platform: "win32" as const,
      arch: "x64" as const,
      directory: "windows-x64",
      executable: "node.exe",
    },
  ])(
    "按 runtime-lock 布局解析 bundled Node（$label）",
    ({ platform, arch, directory, executable }) => {
      const resourcesPath = mkdtempSync(
        path.join(os.tmpdir(), "blackrain-node-"),
      );
      const executablePath = path.join(
        resourcesPath,
        "node-runtime",
        directory,
        executable,
      );
      try {
        mkdirSync(path.dirname(executablePath), { recursive: true });
        copyFileSync(process.execPath, executablePath);
        expect(
          resolveNodeRuntimePath({ resourcesPath, platform, arch }),
        ).toBe(path.normalize(executablePath));
      } finally {
        rmSync(resourcesPath, { recursive: true, force: true });
      }
    },
  );

  it("对未 vendored 的平台、架构和缺失文件给出可定位的错误", () => {
    const resourcesPath = path.dirname(process.execPath);
    expect(() =>
      resolveNodeRuntimePath({ resourcesPath, platform: "linux", arch: "x64" }),
    ).toThrow(/未提供 linux 的 bundled Node runtime/);
    expect(() =>
      resolveNodeRuntimePath({ resourcesPath, platform: "darwin", arch: "x64" }),
    ).toThrow(/未提供 darwin-x64 的 bundled Node runtime/);
    expect(() =>
      resolveNodeRuntimePath({
        resourcesPath: mkdtempSync(path.join(os.tmpdir(), "blackrain-empty-")),
        platform: "darwin",
        arch: "arm64",
      }),
    ).toThrow(/bundled Node runtime 不存在/);
  });
});
