"""gateway.py resolve_provider_key 单测（stdlib unittest）。
重点验 api_key_file 每次读盘（JWT 刷新方案核心）。
跑：cd gateway && python3 -m unittest test_gateway_key -v"""

import os
import tempfile
import unittest

import gateway


class TestResolveProviderKey(unittest.TestCase):
    def test_inline_api_key_wins(self):
        p = {"id": "x", "api_key": "inline-key", "api_key_file": "/nope", "api_key_env": "X"}
        self.assertEqual(gateway.resolve_provider_key(p), "inline-key")

    def test_api_key_file_read_fresh(self):
        # 核心：每次调用都重新读盘 → 文件改了立刻拿到新值（JWT 刷新）。
        with tempfile.NamedTemporaryFile("w", suffix=".jwt", delete=False) as fh:
            fh.write("jwt-v1\n")
            path = fh.name
        try:
            p = {"id": "x", "api_key_file": path}
            self.assertEqual(gateway.resolve_provider_key(p), "jwt-v1")
            # 模拟 App 刷新 token 改写文件
            with open(path, "w", encoding="utf-8") as fh:
                fh.write("jwt-v2\n")
            self.assertEqual(gateway.resolve_provider_key(p), "jwt-v2")
        finally:
            os.unlink(path)

    def test_api_key_file_missing_returns_none(self):
        p = {"id": "x", "api_key_file": "/definitely/not/here.jwt"}
        self.assertIsNone(gateway.resolve_provider_key(p))

    def test_api_key_file_empty_falls_through_to_env(self):
        with tempfile.NamedTemporaryFile("w", suffix=".jwt", delete=False) as fh:
            fh.write("   \n")  # 空白
            path = fh.name
        try:
            os.environ["TEST_GW_KEY"] = "env-key"
            p = {"id": "x", "api_key_file": path, "api_key_env": "TEST_GW_KEY"}
            # 文件空 → 回退 env
            self.assertEqual(gateway.resolve_provider_key(p), "env-key")
        finally:
            os.unlink(path)
            os.environ.pop("TEST_GW_KEY", None)

    def test_env_fallback(self):
        os.environ["TEST_GW_KEY2"] = "env-key2"
        try:
            p = {"id": "x", "api_key_env": "TEST_GW_KEY2"}
            self.assertEqual(gateway.resolve_provider_key(p), "env-key2")
        finally:
            os.environ.pop("TEST_GW_KEY2", None)

    def test_camelcase_api_key_file(self):
        with tempfile.NamedTemporaryFile("w", suffix=".jwt", delete=False) as fh:
            fh.write("camel-jwt\n")
            path = fh.name
        try:
            p = {"id": "x", "apiKeyFile": path}
            self.assertEqual(gateway.resolve_provider_key(p), "camel-jwt")
        finally:
            os.unlink(path)

    def test_nothing_configured_returns_none(self):
        self.assertIsNone(gateway.resolve_provider_key({"id": "x"}))


if __name__ == "__main__":
    unittest.main()
