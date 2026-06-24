import { useCallback, useMemo } from "react";
import type { AppSettings, ModelOption } from "@/types";
import {
  OWN_MODELS,
  modelGatewayToOptions,
} from "@/features/models/utils/gatewayModelOptions";

type SettingsDefaultModelsState = {
  models: ModelOption[];
  isLoading: boolean;
  error: string | null;
  hasModels: boolean;
};

// 设置页（Codex / Git / Agents 区）的模型来源。与对话选择器（useModels）同源：
// 只用 BlackRain 网关 registry，不读内核自带的 OpenAI 目录——否则会把网关
// 路由不了的 gpt-* 模型写进默认模型 / agent 配置。
export function useSettingsDefaultModels(
  gateway: AppSettings["modelGateway"] | null | undefined,
) {
  const models = useMemo<ModelOption[]>(() => {
    const fromGateway = modelGatewayToOptions(gateway);
    return fromGateway.length > 0 ? fromGateway : OWN_MODELS;
  }, [gateway]);

  // 网关 registry 是本地配置，派生是同步的；保留 refresh 仅为兼容调用方接口。
  const refresh = useCallback(() => {}, []);

  const state: SettingsDefaultModelsState = {
    models,
    isLoading: false,
    error: null,
    hasModels: models.length > 0,
  };

  return {
    ...state,
    refresh,
  };
}
