import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyCodexHomeSelection,
  codexHomeId,
  resolveCodexHomePath,
} from "./codex-home";

describe("applyCodexHomeSelection", () => {
  it("默认保留父进程环境并沿用 Codex CLI 标准 Home 解析", () => {
    expect(
      applyCodexHomeSelection({
        CODEX_HOME: "C:\\Users\\tester\\another-home",
      }),
    ).toMatchObject({ CODEX_HOME: "C:\\Users\\tester\\another-home" });
  });

  it("custom 模式只接受用户显式选择的绝对路径", () => {
    const selected = path.resolve("test-data", "custom-codex-home");
    expect(
      applyCodexHomeSelection({}, {
        mode: "custom",
        path: selected,
      }),
    ).toMatchObject({ CODEX_HOME: path.normalize(selected) });
    expect(() =>
      applyCodexHomeSelection({}, {
        mode: "custom",
        path: "custom-codex-home",
      }),
    ).toThrow("绝对路径");
  });

  it("标准 Home 沿用 CODEX_HOME，否则使用用户目录下的 .codex", () => {
    const selected = path.resolve("test-data", "shared-codex-home");
    const profile = path.resolve("test-data", "profile");
    expect(resolveCodexHomePath({ CODEX_HOME: selected })).toBe(
      path.normalize(selected),
    );
    expect(resolveCodexHomePath({ USERPROFILE: profile })).toBe(
      path.join(profile, ".codex"),
    );
  });

  it("为同一个 Home 生成稳定且不暴露路径的标识", () => {
    const selected = path.resolve("test-data", "shared-codex-home");
    const first = codexHomeId({ CODEX_HOME: selected });
    const second = codexHomeId({}, { mode: "custom", path: selected });
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{32}$/);
    expect(first).not.toContain("shared-codex-home");
  });
});
