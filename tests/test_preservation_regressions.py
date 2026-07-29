import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class PreservationRegressionTests(unittest.TestCase):
    def test_apim_sdk_and_backend_have_one_openai_segment(self):
        client = (ROOT / "agents/shared/azure_client.py").read_text(encoding="utf-8")
        bicep = (ROOT / "infra/main.bicep").read_text(encoding="utf-8")
        terraform = (ROOT / "infra/terraform/azure/main.tf").read_text(encoding="utf-8")
        self.assertIn('f"{gateway}/openai-gov"', client)
        self.assertNotIn("properties.endpoint}openai", bicep)
        self.assertNotIn('endpoint}openai"', terraform)

    def test_redaction_is_ordered_and_repeatable(self):
        spec = importlib.util.spec_from_file_location("export_demo_state", ROOT / "scripts/export_demo_state.py")
        module = importlib.util.module_from_spec(spec)
        assert spec.loader
        spec.loader.exec_module(module)
        for _ in range(20):
            self.assertTrue(module.is_secret_key("connection_string"))
            self.assertTrue(module.is_secret_key("APIM_SUBSCRIPTION_KEY"))
            self.assertTrue(module.is_secret_key("primary_key"))
            self.assertTrue(module.is_secret_key("account_key"))

    def test_bedrock_prompt_excludes_base64_and_maf_is_azure_only(self):
        bedrock = (ROOT / "agents/shared/bedrock_pipeline.py").read_text(encoding="utf-8")
        orchestrator = (ROOT / "agents/orchestrator/agent.py").read_text(encoding="utf-8")
        self.assertIn('if key != "image_b64"', bedrock)
        self.assertIn('selected_provider() in {"azure_openai", "azure_apim"}', orchestrator)

    def test_bicep_wires_per_agent_apim_keys_and_single_replica(self):
        bicep = (ROOT / "infra/main.bicep").read_text(encoding="utf-8")
        self.assertIn("APIM_SUBSCRIPTION_KEY_CLAIMS_INTAKE", bicep)
        self.assertIn("APIM_SUBSCRIPTION_KEY_RISK_ASSESSMENT", bicep)
        self.assertIn("APIM_SUBSCRIPTION_KEY_COMPLIANCE", bicep)
        self.assertIn("minReplicas: 1", bicep)
