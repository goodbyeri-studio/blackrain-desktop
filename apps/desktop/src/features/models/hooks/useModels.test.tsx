// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { getConfigModel, getModelList } from "../../../services/desktop";
import { useModels } from "./useModels";

vi.mock("../../../services/desktop", () => ({
  getModelList: vi.fn(),
  getConfigModel: vi.fn(),
}));

const workspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "CodexMonitor",
  path: "/tmp/codex",
  connected: true,
  settings: { sidebarCollapsed: false },
};

describe("useModels", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("adds the config model when it is missing from model/list", async () => {
    vi.mocked(getModelList).mockResolvedValueOnce({
      result: {
        data: [
          {
            id: "remote-1",
            model: "gpt-5.1",
            displayName: "GPT-5.1",
            supportedReasoningEfforts: [],
            defaultReasoningEffort: null,
            isDefault: true,
          },
        ],
      },
    });
    vi.mocked(getConfigModel).mockResolvedValueOnce("custom-model");

    const { result } = renderHook(() =>
      useModels({ activeWorkspace: workspace }),
    );

    await waitFor(() => expect(result.current.models.length).toBeGreaterThan(0));

    expect(getConfigModel).toHaveBeenCalledWith("workspace-1");
    expect(result.current.models[0]).toMatchObject({
      id: "custom-model",
      model: "custom-model",
    });
    expect(result.current.selectedModel?.model).toBe("custom-model");
    expect(result.current.reasoningSupported).toBe(false);
  });

  it("ignores the kernel OpenAI catalog and only shows gateway registry models", async () => {
    // 内核 model/list 实际返回自带 OpenAI 目录（models.json: gpt-*），
    // 网关根本路由不了这些模型。选择器必须无视它，只用 BlackRain 网关 registry。
    vi.mocked(getModelList).mockResolvedValueOnce({
      result: {
        data: [
          {
            id: "gpt-5.5",
            model: "gpt-5.5",
            displayName: "GPT-5.5",
            supportedReasoningEfforts: [],
            defaultReasoningEffort: null,
            isDefault: true,
          },
        ],
      },
    });
    vi.mocked(getConfigModel).mockResolvedValueOnce("qwen/qwen3-coder-plus");

    const { result } = renderHook(() =>
      useModels({
        activeWorkspace: workspace,
        modelGateway: {
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
        },
      }),
    );

    await waitFor(() => expect(result.current.models.length).toBeGreaterThan(0));

    const ids = result.current.models.map((m) => m.id);
    // 网关模型在；内核的 gpt-5.5 不应出现。
    expect(ids).toContain("qwen/qwen3-coder-plus");
    expect(ids).not.toContain("gpt-5.5");
    expect(result.current.models[0]).toMatchObject({
      providerId: "qwen",
      providerName: "Qwen",
    });
    expect(result.current.selectedModel?.model).toBe("qwen/qwen3-coder-plus");
  });

  it("adds models configured in app model gateway settings", async () => {
    vi.mocked(getModelList).mockResolvedValueOnce({ data: [] });
    vi.mocked(getConfigModel).mockResolvedValueOnce("qwen/qwen3-coder-plus");

    const { result } = renderHook(() =>
      useModels({
        activeWorkspace: workspace,
        modelGateway: {
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
        },
      }),
    );

    await waitFor(() => expect(result.current.models.length).toBe(1));

    expect(result.current.models[0]).toMatchObject({
      id: "qwen/qwen3-coder-plus",
      model: "qwen/qwen3-coder-plus",
      displayName: "Qwen / Qwen3 Coder Plus",
      providerId: "qwen",
      providerName: "Qwen",
    });
    expect(result.current.selectedModelId).toBe("qwen/qwen3-coder-plus");
  });

  it("uses DeepSeek official high/max reasoning efforts from the gateway registry", async () => {
    vi.mocked(getModelList).mockResolvedValueOnce({ data: [] });
    vi.mocked(getConfigModel).mockResolvedValueOnce("deepseek-v4-flash");

    const { result } = renderHook(() =>
      useModels({
        activeWorkspace: workspace,
        modelGateway: {
          enabled: true,
          port: 8899,
          defaultModel: "deepseek-v4-flash",
          providers: [
            {
              id: "deepseek",
              name: "DeepSeek",
              kind: "openai-compatible",
              baseUrl: "https://api.deepseek.com/v1",
              apiKeyEnv: "DEEPSEEK_API_KEY",
              enabled: true,
              models: [
                {
                  id: "deepseek-v4-flash",
                  displayName: "DeepSeek V4 Flash",
                  description: "flash model",
                  isDefault: true,
                },
              ],
            },
          ],
        },
      }),
    );

    await waitFor(() => expect(result.current.models.length).toBe(1));

    expect(result.current.reasoningOptions).toEqual(["high", "max"]);
    expect(result.current.selectedEffort).toBe("high");
  });

  it("adds DeepSeek reasoning efforts to config models", async () => {
    vi.mocked(getModelList).mockResolvedValueOnce({ data: [] });
    vi.mocked(getConfigModel).mockResolvedValueOnce("deepseek-v4-flash");

    const { result } = renderHook(() =>
      useModels({
        activeWorkspace: workspace,
        modelGateway: {
          enabled: true,
          port: 8899,
          defaultModel: "qwen/qwen3-coder-plus",
          providers: [],
        },
      }),
    );

    await waitFor(() => expect(result.current.selectedModelId).toBe("deepseek-v4-flash"));

    expect(result.current.reasoningOptions).toEqual(["high", "max"]);
    expect(result.current.selectedEffort).toBe("high");
  });

  it("keeps the selected reasoning effort when switching models", async () => {
    vi.mocked(getModelList).mockResolvedValueOnce({
      result: {
        data: [
          {
            id: "remote-1",
            model: "gpt-5.1",
            displayName: "GPT-5.1",
            supportedReasoningEfforts: [
              { reasoningEffort: "low", description: "Low" },
              { reasoningEffort: "medium", description: "Medium" },
            ],
            defaultReasoningEffort: "medium",
            isDefault: true,
          },
        ],
      },
    });
    vi.mocked(getConfigModel).mockResolvedValueOnce("custom-model");

    const { result } = renderHook(() =>
      useModels({ activeWorkspace: workspace }),
    );

    await waitFor(() => expect(result.current.models.length).toBeGreaterThan(1));

    act(() => {
      result.current.setSelectedEffort("high");
      result.current.setSelectedModelId("custom-model");
    });

    await waitFor(() => {
      expect(result.current.selectedModelId).toBe("custom-model");
      expect(result.current.selectedEffort).toBe("high");
    });
  });
});
