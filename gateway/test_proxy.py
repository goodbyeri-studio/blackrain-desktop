"""proxy.py 纯函数单测（stdlib unittest，零依赖、不起服务/不连网）。
跑：cd gateway && python3 -m unittest test_proxy -v"""

import unittest

import proxy
from proxy import ProxyError, allowed_model, gateway_models_payload, redact


class TestAllowedModel(unittest.TestCase):
    def test_allows_known_models(self):
        self.assertEqual(allowed_model("deepseek-v4-flash"), "deepseek-v4-flash")
        self.assertEqual(allowed_model("deepseek-v4-pro"), "deepseek-v4-pro")

    def test_rejects_unknown_model(self):
        with self.assertRaises(ProxyError) as ctx:
            allowed_model("gpt-5.5")
        self.assertEqual(ctx.exception.status, 400)
        self.assertEqual(ctx.exception.code, "unsupported_model")

    def test_rejects_none(self):
        with self.assertRaises(ProxyError):
            allowed_model(None)


class TestRedact(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(redact(""), "<empty>")
        self.assertEqual(redact(None), "<empty>")

    def test_short_fully_masked(self):
        self.assertEqual(redact("abc123"), "****")

    def test_long_partial(self):
        out = redact("sbp_1234567890abcdef")
        self.assertTrue(out.startswith("sbp_"))
        self.assertTrue(out.endswith("ef"))
        self.assertNotIn("567890", out)


class TestModelsPayload(unittest.TestCase):
    def test_lists_models_with_multiplier(self):
        payload = gateway_models_payload()
        self.assertEqual(payload["object"], "list")
        ids = {m["id"]: m["credit_multiplier"] for m in payload["data"]}
        self.assertEqual(ids["deepseek-v4-flash"], 0.5)
        self.assertEqual(ids["deepseek-v4-pro"], 1.5)


class TestProxyError(unittest.TestCase):
    def test_body_shape(self):
        e = ProxyError(402, "insufficient_credits", "额度不足")
        self.assertEqual(e.body(), {"error": {"code": "insufficient_credits", "message": "额度不足"}})


if __name__ == "__main__":
    unittest.main()
