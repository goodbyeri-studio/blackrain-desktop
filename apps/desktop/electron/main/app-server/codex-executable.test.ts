import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCodexExecutablePath } from "./codex-executable";

describe("resolveCodexExecutablePath", () => {
  it("开发覆盖只接受存在的绝对路径", () => {
    expect(
      resolveCodexExecutablePath({
        resourcesPath: path.dirname(process.execPath),
        override: process.execPath,
        allowOverride: true,
        platform: process.platform,
      }),
    ).toBe(path.normalize(process.execPath));
    expect(() =>
      resolveCodexExecutablePath({
        resourcesPath: path.dirname(process.execPath),
        override: "codex.exe",
        allowOverride: true,
        platform: "win32",
      }),
    ).toThrow(/绝对路径/);
    expect(() =>
      resolveCodexExecutablePath({
        resourcesPath: path.dirname(process.execPath),
        override: process.execPath,
        allowOverride: false,
        platform: "win32",
      }),
    ).toThrow(/正式制品/);
  });

  it.each([
    {
      label: "macOS arm64",
      platform: "darwin" as const,
      arch: "arm64" as const,
      directory: "darwin-arm64",
      executable: "codex",
    },
    {
      label: "Windows x64",
      platform: "win32" as const,
      arch: "x64" as const,
      directory: "windows-x64",
      executable: "codex.exe",
    },
  ])(
    "按官方 package 布局解析 bundled codex runtime（$label）",
    ({ platform, arch, directory, executable }) => {
      const resourcesPath = mkdtempSync(
        path.join(os.tmpdir(), "blackrain-codex-"),
      );
      const executablePath = path.join(
        resourcesPath,
        "codex",
        directory,
        "bin",
        executable,
      );
      try {
        mkdirSync(path.dirname(executablePath), { recursive: true });
        copyFileSync(process.execPath, executablePath);
        expect(
          resolveCodexExecutablePath({ resourcesPath, platform, arch }),
        ).toBe(path.normalize(executablePath));
      } finally {
        rmSync(resourcesPath, { recursive: true, force: true });
      }
    },
  );

  it("对未 vendored 的平台与架构给出可定位的错误", () => {
    const resourcesPath = path.dirname(process.execPath);
    // Linux 没有 vendored runtime。
    expect(() =>
      resolveCodexExecutablePath({
        resourcesPath,
        platform: "linux",
        arch: "x64",
      }),
    ).toThrow(/未提供 linux 的 bundled codex runtime/);
    // macOS 只 vendored aarch64；Intel Mac 必须明确失败，而不是解析出
    // 架构不匹配的二进制后在 spawn 阶段给出难定位的错误。
    expect(() =>
      resolveCodexExecutablePath({
        resourcesPath,
        platform: "darwin",
        arch: "x64",
      }),
    ).toThrow(/未提供 darwin-x64 的 bundled codex runtime/);
  });
});
