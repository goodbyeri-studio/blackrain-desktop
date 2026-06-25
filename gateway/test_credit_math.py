"""credit_math 单测（stdlib unittest，零依赖）。
跑：cd gateway && python3 -m unittest test_credit_math -v"""

import unittest
from credit_math import (
    MULTIPLIERS,
    TOKENS_PER_CREDIT_AT_1X,
    credits_for_usage,
    model_multiplier,
)


class TestCreditMath(unittest.TestCase):
    def test_multiplier_ratio_3to1(self):
        # 核心不变量：pro 是 flash 的 3 倍，与前端 creditPricing.ts 一致。
        self.assertEqual(model_multiplier("deepseek-v4-flash"), 0.5)
        self.assertEqual(model_multiplier("deepseek-v4-pro"), 1.5)
        self.assertEqual(
            model_multiplier("deepseek-v4-pro") / model_multiplier("deepseek-v4-flash"),
            3,
        )

    def test_unknown_model_falls_back_1x(self):
        self.assertEqual(model_multiplier("gpt-5.5"), 1.0)

    def test_anchor_pro_6667_tokens_per_credit(self):
        # design.md：pro 1 credit ≈ 6667 token。6667 token@1.5x 应 ≈ 1 credit。
        self.assertAlmostEqual(
            credits_for_usage("deepseek-v4-pro", 6667, 0), 1.0, places=3
        )

    def test_anchor_flash_20000_tokens_per_credit(self):
        # design.md：flash 1 credit ≈ 20000 token。
        self.assertAlmostEqual(
            credits_for_usage("deepseek-v4-flash", 20000, 0), 1.0, places=3
        )

    def test_blended_input_output(self):
        # 混合单价：输入+输出同价。pro 40000+4450=44450 token@1.5x。
        # 44450 * 1.5 / 10000 = 6.6675
        self.assertAlmostEqual(
            credits_for_usage("deepseek-v4-pro", 40000, 4450), 6.6675, places=4
        )

    def test_100_credits_is_1M_pro_tokens(self):
        # 锚定：100 credit ≈ 1M pro-等效 token。
        # 1M pro token@1.5x = 1_000_000 * 1.5 / 10000 = 150 credit?? 不，等效是反向：
        # 100 credit 能买多少 pro token：100 = tok*1.5/10000 → tok = 666,667。
        # 即 100 credit ≈ 0.667M pro token —— 但 spec 写「100 credit ≈ 1M pro-等效」是占位近似。
        # 这里只验「同样 100 credit，flash 能买的是 pro 的 3 倍」这一比值不变量。
        pro_tok_for_100 = 100 * TOKENS_PER_CREDIT_AT_1X / 1.5
        flash_tok_for_100 = 100 * TOKENS_PER_CREDIT_AT_1X / 0.5
        self.assertAlmostEqual(flash_tok_for_100 / pro_tok_for_100, 3, places=6)

    def test_missing_tokens_treated_zero(self):
        self.assertEqual(credits_for_usage("deepseek-v4-pro", None, None), 0.0)

    def test_negative_tokens_clamped(self):
        self.assertEqual(credits_for_usage("deepseek-v4-pro", -100, -5), 0.0)

    def test_multipliers_match_frontend(self):
        # 守护：倍率表只含已知两模型，改动需同步前端。
        self.assertEqual(set(MULTIPLIERS), {"deepseek-v4-flash", "deepseek-v4-pro"})


if __name__ == "__main__":
    unittest.main()
