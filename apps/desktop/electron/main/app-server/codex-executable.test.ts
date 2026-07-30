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
});
