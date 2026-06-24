import type { AppSettings, ModelOption } from "@/types";

type ModelGatewaySettings = AppSettings["modelGateway"];
type ModelGatewayProvider = ModelGatewaySettings["providers"][number];

// 2049 自有模型清单（网关未配置/禁用时的兜底）。我们走自己的 DeepSeek 网关，
// 不用内核自带的 OpenAI 目录（那些 GPT-5.x 选了会把无效 model 名发给 DeepSeek 而失败）。
// 旧名 deepseek-chat / deepseek-reasoner 将于 2026-07-24 弃用，故只列 v4 新名。
export const OWN_MODELS: ModelOption[] = [
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

// 网关对外模型 id：DeepSeek 保留裸名（兼容早期默认值），其余加 provider 前缀。
export function publicGatewayModelId(
  provider: Pick<ModelGatewayProvider, "id">,
  modelId: string,
): string {
  if (provider.id === "deepseek" || modelId.includes("/")) {
    return modelId;
  }
  return `${provider.id}/${modelId}`;
}

// 把网关 registry 摊平成模型选择器用的 ModelOption[]。
// 这是 BlackRain 模型的唯一真源：对话选择器和设置页都用它，
// 绝不混入内核 model/list 返回的自带 OpenAI 目录。
export function modelGatewayToOptions(
  gateway: ModelGatewaySettings | null | undefined,
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
