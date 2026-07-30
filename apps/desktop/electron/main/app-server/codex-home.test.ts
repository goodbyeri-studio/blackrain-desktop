import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyCodexHomeSelection } from "./codex-home";

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
});
