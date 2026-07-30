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

  it("按官方 package 布局解析 bundled codex.exe", () => {
    const resourcesPath = mkdtempSync(path.join(os.tmpdir(), "blackrain-codex-"));
    const executablePath = path.join(
      resourcesPath,
      "codex",
      "windows-x64",
      "bin",
      "codex.exe",
    );
    try {
      mkdirSync(path.dirname(executablePath), { recursive: true });
      copyFileSync(process.execPath, executablePath);
      expect(
        resolveCodexExecutablePath({ resourcesPath, platform: "win32" }),
      ).toBe(path.normalize(executablePath));
    } finally {
      rmSync(resourcesPath, { recursive: true, force: true });
    }
  });
});
