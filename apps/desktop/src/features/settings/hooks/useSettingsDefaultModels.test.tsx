// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AppSettings } from "@/types";
import { useSettingsDefaultModels } from "./useSettingsDefaultModels";

type Gateway = AppSettings["modelGateway"];

function gateway(overrides: Partial<Gateway> = {}): Gateway {
  return {
    enabled: true,
    port: 8899,
    defaultModel: "qwen/qwen3-coder-plus",
    providers: [
      {
        id: "qwen",
        name: "Qwen",
        kind: "openai-compatible",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apiKeyEnv: "QWEN_API_KEY",
        enabled: true,
        models: [
          {
            id: "qwen3-coder-plus",
            displayName: "Qwen3 Coder Plus",
            description: "coding model",
            isDefault: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("useSettingsDefaultModels", () => {
  it("derives models from the gateway registry only", () => {
    const { result } = renderHook(() => useSettingsDefaultModels(gateway()));

    const ids = result.current.models.map((model) => model.id);
    expect(ids).toEqual(["qwen/qwen3-coder-plus"]);
    expect(result.current.models[0]).toMatchObject({
      providerId: "qwen",
      providerName: "Qwen",
    });
    expect(result.current.hasModels).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    // 内核自带 OpenAI 目录绝不出现。
    expect(ids).not.toContain("gpt-5.5");
  });

  it("skips disabled providers", () => {
    const { result } = renderHook(() =>
      useSettingsDefaultModels(
        gateway({
          providers: [
            { ...gateway().providers[0], enabled: false },
            {
              id: "deepseek",
              name: "DeepSeek",
              kind: "deepseek",
              baseUrl: "https://api.deepseek.com/v1",
              apiKeyEnv: "DEEPSEEK_API_KEY",
              enabled: true,
              models: [
                {
                  id: "deepseek-v4-flash",
                  displayName: "DeepSeek V4 Flash",
                  description: "",
                  isDefault: true,
                },
              ],
            },
          ],
        }),
      ),
    );

    const ids = result.current.models.map((model) => model.id);
    expect(ids).toEqual(["deepseek-v4-flash"]);
  });

  it("falls back to DeepSeek own models when the gateway is disabled", () => {
    const { result } = renderHook(() =>
      useSettingsDefaultModels(gateway({ enabled: false })),
    );

    const ids = result.current.models.map((model) => model.id);
    expect(ids).toEqual(["deepseek-v4-flash", "deepseek-v4-pro"]);
    expect(result.current.hasModels).toBe(true);
  });

  it("falls back to own models when there are no providers", () => {
    const { result } = renderHook(() =>
      useSettingsDefaultModels(gateway({ providers: [] })),
    );

    expect(result.current.models.map((model) => model.id)).toEqual([
      "deepseek-v4-flash",
      "deepseek-v4-pro",
    ]);
  });

  it("returns own models when gateway settings are missing", () => {
    const { result } = renderHook(() => useSettingsDefaultModels(null));

    expect(result.current.models.map((model) => model.id)).toEqual([
      "deepseek-v4-flash",
      "deepseek-v4-pro",
    ]);
  });
});
