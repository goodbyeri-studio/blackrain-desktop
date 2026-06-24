import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppSettings, DebugEntry, ModelOption, WorkspaceInfo } from "../../../types";
import { getConfigModel, getModelList } from "../../../services/tauri";
import { normalizeEffortValue, parseModelListResponse } from "../utils/modelListResponse";

type UseModelsOptions = {
  activeWorkspace: WorkspaceInfo | null;
  onDebug?: (entry: DebugEntry) => void;
  preferredModelId?: string | null;
  preferredEffort?: string | null;
  selectionKey?: string | null;
  modelGateway?: AppSettings["modelGateway"] | null;
};

const CONFIG_MODEL_DESCRIPTION = "Configured in CODEX_HOME/config.toml";

// 2049 自有模型清单。我们走自己的 DeepSeek 网关，不用内核自带的 OpenAI 目录
// （那些 GPT-5.x 选了会把无效 model 名发给 DeepSeek 而失败）。
// 旧名 deepseek-chat / deepseek-reasoner 将于 2026-07-24 弃用，故只列 v4 新名。
const OWN_MODELS: ModelOption[] = [
  {
    id: "deepseek-v4-flash",
    model: "deepseek-v4-flash",
    displayName: "DeepSeek V4 Flash",
    description: "高性价比主力 · 1M 上下文",
    providerId: "deepseek",
    providerName: "DeepSeek",
    supportedReasoningEfforts: [],
    defaultReasoningEffort: null,
    isDefault: true,
  },
  {
    id: "deepseek-v4-pro",
    model: "deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro",
    description: "旗舰 1.6T · 1M 上下文 · 攻坚",
    providerId: "deepseek",
    providerName: "DeepSeek",
    supportedReasoningEfforts: [],
    defaultReasoningEffort: null,
    isDefault: false,
  },
];

const findModelByIdOrModel = (
  models: ModelOption[],
  idOrModel: string | null,
): ModelOption | null => {
  if (!idOrModel) {
    return null;
  }
  return (
    models.find((model) => model.id === idOrModel) ??
    models.find((model) => model.model === idOrModel) ??
    null
  );
};

const pickDefaultModel = (models: ModelOption[], configModel: string | null) =>
  findModelByIdOrModel(models, configModel) ??
  models.find((model) => model.isDefault) ??
  models[0] ??
  null;

function publicGatewayModelId(
  provider: AppSettings["modelGateway"]["providers"][number],
  modelId: string,
): string {
  if (provider.id === "deepseek" || modelId.includes("/")) {
    return modelId;
  }
  return `${provider.id}/${modelId}`;
}

function modelGatewayToOptions(
  gateway: AppSettings["modelGateway"] | null | undefined,
): ModelOption[] {
  if (!gateway?.enabled) {
    return [];
  }
  return gateway.providers
    .filter((provider) => provider.enabled)
    .flatMap((provider) =>
      provider.models.map((model) => {
        const id = publicGatewayModelId(provider, model.id);
        return {
          id,
          model: id,
          displayName:
            provider.id === "deepseek"
              ? model.displayName
              : `${provider.name} / ${model.displayName}`,
          description: model.description,
          providerId: provider.id,
          providerName: provider.name,
          supportedReasoningEfforts: [],
          defaultReasoningEffort: null,
          isDefault: id === gateway.defaultModel || model.isDefault,
        } satisfies ModelOption;
      }),
    );
}

function mergeModelOptions(...groups: ModelOption[][]): ModelOption[] {
  const seen = new Set<string>();
  const out: ModelOption[] = [];
  for (const group of groups) {
    for (const model of group) {
      const key = model.id || model.model;
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push(model);
    }
  }
  return out;
}

export function useModels({
  activeWorkspace,
  onDebug,
  preferredModelId = null,
  preferredEffort = null,
  selectionKey = null,
  modelGateway = null,
}: UseModelsOptions) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [configModel, setConfigModel] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelIdState] = useState<string | null>(null);
  const [selectedEffort, setSelectedEffortState] = useState<string | null>(null);
  const lastFetchedWorkspaceId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const hasUserSelectedModel = useRef(false);
  const hasUserSelectedEffort = useRef(false);
  const lastWorkspaceId = useRef<string | null>(null);
  const lastSelectionKey = useRef<string | null>(null);

  const workspaceId = activeWorkspace?.id ?? null;
  const isConnected = Boolean(activeWorkspace?.connected);
  const configuredGatewayModels = useMemo(
    () => modelGatewayToOptions(modelGateway),
    [modelGateway],
  );

  useEffect(() => {
    if (selectionKey === lastSelectionKey.current) {
      return;
    }
    lastSelectionKey.current = selectionKey;
    hasUserSelectedModel.current = false;
    hasUserSelectedEffort.current = false;
  }, [selectionKey]);

  useEffect(() => {
    if (workspaceId === lastWorkspaceId.current) {
      return;
    }
    hasUserSelectedModel.current = false;
    hasUserSelectedEffort.current = false;
    lastWorkspaceId.current = workspaceId;
    setConfigModel(null);
  }, [workspaceId]);

  useEffect(() => {
    if (selectedEffort === null) {
      return;
    }
    if (selectedEffort.trim().length > 0) {
      return;
    }
    hasUserSelectedEffort.current = false;
    setSelectedEffortState(null);
  }, [selectedEffort]);

  const setSelectedModelId = useCallback((next: string | null) => {
    hasUserSelectedModel.current = true;
    setSelectedModelIdState(next);
  }, []);

  const setSelectedEffort = useCallback((next: string | null) => {
    hasUserSelectedEffort.current = true;
    setSelectedEffortState(next);
  }, []);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? null,
    [models, selectedModelId],
  );

  const reasoningSupported = useMemo(() => {
    if (!selectedModel) {
      return false;
    }
    return (
      selectedModel.supportedReasoningEfforts.length > 0 ||
      selectedModel.defaultReasoningEffort !== null
    );
  }, [selectedModel]);

  const reasoningOptions = useMemo(() => {
    const supported = selectedModel?.supportedReasoningEfforts.map(
      (effort) => effort.reasoningEffort,
    );
    if (supported && supported.length > 0) {
      return supported;
    }
    const defaultEffort = normalizeEffortValue(selectedModel?.defaultReasoningEffort);
    return defaultEffort ? [defaultEffort] : [];
  }, [selectedModel]);

  const resolveEffort = useCallback(
    (model: ModelOption, preferCurrent: boolean) => {
      const supportedEfforts = model.supportedReasoningEfforts.map(
        (effort) => effort.reasoningEffort,
      );
      const currentEffort = normalizeEffortValue(selectedEffort);
      if (preferCurrent && currentEffort) {
        return currentEffort;
      }
      if (supportedEfforts.length === 0) {
        return normalizeEffortValue(preferredEffort);
      }
      const preferred = normalizeEffortValue(preferredEffort);
      if (preferred && supportedEfforts.includes(preferred)) {
        return preferred;
      }
      return normalizeEffortValue(model.defaultReasoningEffort);
    },
    [preferredEffort, selectedEffort],
  );

  const refreshModels = useCallback(async () => {
    if (!workspaceId || !isConnected) {
      return;
    }
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    onDebug?.({
      id: `${Date.now()}-client-model-list`,
      timestamp: Date.now(),
      source: "client",
      label: "model/list",
      payload: { workspaceId },
    });
    try {
      const [modelListResult, configModelResult] = await Promise.allSettled([
        getModelList(workspaceId),
        getConfigModel(workspaceId),
      ]);
      const configModelFromConfig =
        configModelResult.status === "fulfilled"
          ? configModelResult.value
          : null;
      if (configModelResult.status === "rejected") {
        onDebug?.({
          id: `${Date.now()}-client-config-model-error`,
          timestamp: Date.now(),
          source: "error",
          label: "config/model error",
          payload:
            configModelResult.reason instanceof Error
              ? configModelResult.reason.message
              : String(configModelResult.reason),
        });
      }
      const response =
        modelListResult.status === "fulfilled" ? modelListResult.value : null;
      if (modelListResult.status === "rejected") {
        onDebug?.({
          id: `${Date.now()}-client-model-list-error`,
          timestamp: Date.now(),
          source: "error",
          label: "model/list error",
          payload:
            modelListResult.reason instanceof Error
              ? modelListResult.reason.message
              : String(modelListResult.reason),
        });
      }
      onDebug?.({
        id: `${Date.now()}-server-model-list`,
        timestamp: Date.now(),
        source: "server",
        label: "model/list response",
        payload: response,
      });
      setConfigModel(configModelFromConfig);
      const parsedModels = parseModelListResponse(response);
      const dataFromServer = mergeModelOptions(configuredGatewayModels, parsedModels);
      const fallbackModels: ModelOption[] =
        dataFromServer.length > 0 ? dataFromServer : OWN_MODELS;
      const data = (() => {
        if (!configModelFromConfig) {
          return fallbackModels;
        }
        const hasConfigModel = fallbackModels.some(
          (model) => model.model === configModelFromConfig,
        );
        if (hasConfigModel) {
          return fallbackModels;
        }
        const configOption: ModelOption = {
          id: configModelFromConfig,
          model: configModelFromConfig,
          displayName: `${configModelFromConfig} (config)`,
          description: CONFIG_MODEL_DESCRIPTION,
          supportedReasoningEfforts: [],
          defaultReasoningEffort: null,
          isDefault: false,
        };
        return [configOption, ...fallbackModels];
      })();
      setModels(data);
      lastFetchedWorkspaceId.current = workspaceId;
      const defaultModel = pickDefaultModel(data, configModelFromConfig);
      const existingSelection = findModelByIdOrModel(data, selectedModelId);
      if (selectedModelId && !existingSelection) {
        hasUserSelectedModel.current = false;
      }
      const preferredSelection = findModelByIdOrModel(data, preferredModelId);
      const shouldKeepExisting =
        hasUserSelectedModel.current && existingSelection !== null;
      const nextSelection =
        (shouldKeepExisting ? existingSelection : null) ??
        preferredSelection ??
        defaultModel ??
        existingSelection;
      if (nextSelection) {
        if (nextSelection.id !== selectedModelId) {
          setSelectedModelIdState(nextSelection.id);
        }
        const nextEffort = resolveEffort(
          nextSelection,
          hasUserSelectedEffort.current,
        );
        if (nextEffort !== selectedEffort) {
          setSelectedEffortState(nextEffort);
        }
      }
    } finally {
      inFlight.current = false;
    }
  }, [
    isConnected,
    configuredGatewayModels,
    onDebug,
    preferredModelId,
    selectedEffort,
    selectedModelId,
    resolveEffort,
    workspaceId,
  ]);

  useEffect(() => {
    if (!workspaceId || !isConnected) {
      return;
    }
    if (lastFetchedWorkspaceId.current === workspaceId && models.length > 0) {
      return;
    }
    refreshModels();
  }, [isConnected, models.length, refreshModels, workspaceId]);

  useEffect(() => {
    if (!selectedModel) {
      return;
    }
    const currentEffort = normalizeEffortValue(selectedEffort);
    if (currentEffort) {
      return;
    }
    const nextEffort = normalizeEffortValue(selectedModel.defaultReasoningEffort);
    if (nextEffort === null) {
      return;
    }
    hasUserSelectedEffort.current = false;
    setSelectedEffortState(nextEffort);
  }, [selectedEffort, selectedModel]);

  useEffect(() => {
    if (!models.length) {
      return;
    }
    const preferredSelection = findModelByIdOrModel(models, preferredModelId);
    const defaultModel = pickDefaultModel(models, configModel);
    const existingSelection = findModelByIdOrModel(models, selectedModelId);
    if (selectedModelId && !existingSelection) {
      hasUserSelectedModel.current = false;
    }
    const shouldKeepUserSelection =
      hasUserSelectedModel.current && existingSelection !== null;
    if (shouldKeepUserSelection) {
      return;
    }
    const nextSelection =
      preferredSelection ?? defaultModel ?? existingSelection ?? null;
    if (!nextSelection) {
      return;
    }
    if (nextSelection.id !== selectedModelId) {
      setSelectedModelIdState(nextSelection.id);
    }
    const nextEffort = resolveEffort(nextSelection, hasUserSelectedEffort.current);
    if (nextEffort !== selectedEffort) {
      setSelectedEffortState(nextEffort);
    }
  }, [
    configModel,
    models,
    preferredModelId,
    selectedEffort,
    selectedModelId,
    resolveEffort,
  ]);

  return {
    models,
    selectedModel,
    reasoningSupported,
    selectedModelId,
    setSelectedModelId,
    reasoningOptions,
    selectedEffort,
    setSelectedEffort,
    refreshModels,
  };
}
