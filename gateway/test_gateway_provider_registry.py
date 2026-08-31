import json
import unittest
from pathlib import Path

import gateway


FIXTURES = Path(__file__).with_name("fixtures")


class ProviderRegistryValidationTests(unittest.TestCase):
    def test_accepts_sanitized_fixture_and_disabled_empty_provider(self):
        providers = json.loads((FIXTURES / "providers-valid.json").read_text(encoding="utf-8"))

        normalized = gateway.validate_provider_registry(providers)

        self.assertEqual([item["id"] for item in normalized], ["fixture", "disabled"])
        self.assertEqual(normalized[1]["models"], [])

    def test_rejects_missing_fields_with_provider_location(self):
        with self.assertRaisesRegex(
            gateway.ProviderRegistryError,
            r"providers\[0\]\.name: must be a non-empty string",
        ):
            gateway.validate_provider_registry([
                {"id": "missing-name", "base_url": "https://example.invalid", "models": ["m"]}
            ])

    def test_rejects_duplicate_provider(self):
        provider = {
            "id": "duplicate",
            "name": "Duplicate",
            "base_url": "https://example.invalid",
            "models": ["m"],
        }
        with self.assertRaisesRegex(gateway.ProviderRegistryError, r"providers\[1\]\.id"):
            gateway.validate_provider_registry([provider, dict(provider)])

    def test_rejects_duplicate_model_at_model_location(self):
        provider = {
            "id": "models",
            "name": "Models",
            "base_url": "https://example.invalid",
            "models": ["same", {"id": "same"}],
        }
        with self.assertRaisesRegex(gateway.ProviderRegistryError, r"providers\[0\]\.models\[1\]"):
            gateway.validate_provider_registry([provider])

    def test_enabled_provider_requires_a_model(self):
        provider = {
            "id": "empty",
            "name": "Empty",
            "base_url": "https://example.invalid",
            "models": [],
        }
        with self.assertRaisesRegex(gateway.ProviderRegistryError, r"providers\[0\]\.models"):
            gateway.validate_provider_registry([provider])

    def test_errors_do_not_include_sensitive_values(self):
        secret = "token-that-must-not-appear"
        provider = {
            "id": secret,
            "name": "Sensitive",
            "base_url": "not-a-url",
            "api_key": secret,
            "models": ["m"],
        }
        with self.assertRaises(gateway.ProviderRegistryError) as caught:
            gateway.validate_provider_registry([provider])
        self.assertNotIn(secret, str(caught.exception))


if __name__ == "__main__":
    unittest.main()
