"""002-accounts-credits / M-A2：credit 倍率换算（代理服务端）。

唯一职责：把一次对话的 token 用量 + 模型，换算成要扣的 credit。
比值钉死 DeepSeek 真实价：pro 是 flash 的 3 倍 → flash 0.5x / pro 1.5x。
与前端 `creditPricing.ts` 必须保持同一套倍率（3:1）。

锚定（占位，正式定价时改 TOKENS_PER_CREDIT_AT_1X 一处）：
    100 credit ≈ 1M pro-等效 token @ 1.5x  →  1 credit = 10000 token @ 1x
    pro:  1 credit ≈ 6,667 token（10000 / 1.5）
    flash:1 credit ≈ 20,000 token（10000 / 0.5）

MVP 用「混合单价」：输入+输出按同一等效价。已知会轻微低估输出/思考重的任务；
后续可拆输入/输出分计（见 spec 待定项）。此处不做拆分。
"""

# 模型 credit 倍率。未知模型回退 1x（不误加价）。与前端 creditPricing.ts 一致。
MULTIPLIERS = {
    "deepseek-v4-flash": 0.5,
    "deepseek-v4-pro": 1.5,
}

# 占位锚定：1x 倍率下多少 token 折 1 credit。正式定价改这一处。
TOKENS_PER_CREDIT_AT_1X = 10000


def model_multiplier(model_id):
    """查模型倍率；未知回退 1.0。"""
    return MULTIPLIERS.get(model_id, 1.0)


def credits_for_usage(model_id, input_tokens, output_tokens):
    """按 (输入+输出) × 倍率 / 锚定，算出要扣的 credit。

    返回非负 float。token 缺失按 0 计。混合单价（输入输出同价）。
    """
    in_tok = max(0, int(input_tokens or 0))
    out_tok = max(0, int(output_tokens or 0))
    total = in_tok + out_tok
    cost = total * model_multiplier(model_id) / TOKENS_PER_CREDIT_AT_1X
    # 量化到 6 位小数，避免浮点尾巴写进 ledger。
    return round(cost, 6)
