// 模型 credit 倍率。
// 比值钉死 DeepSeek 真实价：pro 是 flash 的 3 倍（decisions.md「模型倍率」）。
// 表达为 flash 0.5x / pro 1.5x。前端只用于「展示倍率标签」；
// 真正的 token→credit 扣减在平台代理服务端做（M-A2），此处不扣费。

export interface ModelMultiplier {
  // 网关对外模型 id（与 gatewayModelOptions.publicGatewayModelId 对齐）。
  modelId: string;
  multiplier: number; // credit 倍率
  label: string; // 展示用，如 "0.5x"
}

const MULTIPLIERS: Record<string, number> = {
  "deepseek-v4-flash": 0.5,
  "deepseek-v4-pro": 1.5,
};

// 格式化倍率标签：去掉多余小数（0.5→"0.5x"，1.5→"1.5x"，1→"1x"）。
export function formatMultiplier(multiplier: number): string {
  const trimmed = Number.isInteger(multiplier)
    ? String(multiplier)
    : String(Number(multiplier.toFixed(2)));
  return `${trimmed}x`;
}

// 查模型倍率；未知模型回退 1x（不加价，避免误扣展示）。
export function modelMultiplier(modelId: string): ModelMultiplier {
  const multiplier = MULTIPLIERS[modelId] ?? 1;
  return { modelId, multiplier, label: formatMultiplier(multiplier) };
}

// 是否已知倍率（决定 UI 是否显示倍率徽标）。
export function hasKnownMultiplier(modelId: string): boolean {
  return modelId in MULTIPLIERS;
}
