import os
import unittest

os.environ["LLM_PROVIDER"] = "mock"

from agents.orchestrator.agent import process_claim
from agents.shared.mock_data import DEMO_SCENARIOS


class MockPipelineTests(unittest.IsolatedAsyncioTestCase):
    async def test_fixture_decisions_are_deterministic(self):
        for name in ("low_risk", "high_amount", "human_review", "fraudulent", "prompt_injection"):
            scenario = DEMO_SCENARIOS[name]
            result = await process_claim({**scenario, "claim_id": f"TEST-{name}"})
            self.assertEqual(result["decision"], scenario["expected_decision"])

    async def test_injection_is_audited(self):
        scenario = DEMO_SCENARIOS["prompt_injection"]
        result = await process_claim({**scenario, "claim_id": "TEST-INJECTION"})
        self.assertTrue(result["security_flagged"])
        self.assertTrue(any(row["stage"] == "security_guard" for row in result["audit_trail"]))

    async def test_nonexistent_policy_is_rejected(self):
        result = await process_claim({
            "claim_id": "TEST-INVALID",
            "policy_id": "POL-DOES-NOT-EXIST",
            "customer_id": "CUST-1001",
            "incident_type": "collision",
            "estimated_amount": 500,
            "description": "Colisión menor documentada.",
        })
        self.assertEqual(result["decision"], "reject")
        self.assertFalse(result["intake_result"]["policy_valid"])
