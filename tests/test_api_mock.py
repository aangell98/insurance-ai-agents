import os
import sys
import unittest
import uuid
from pathlib import Path

os.environ["LLM_PROVIDER"] = "mock"
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from fastapi.testclient import TestClient

from main import app
from agents.shared.mock_data import DEMO_SCENARIOS


class MockApiSmokeTests(unittest.TestCase):
    def test_all_demo_scenarios(self):
        with TestClient(app) as client:
            for name, scenario in DEMO_SCENARIOS.items():
                claim_id = f"CLM-{uuid.uuid4()}"
                response = client.post("/api/claims/evaluate", json={**scenario, "claim_id": claim_id})
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()["decision"], scenario["expected_decision"])
                audit = client.get(f"/api/claims/{claim_id}/audit")
                self.assertEqual(audit.status_code, 200, audit.text)
            stats = client.get("/api/stats")
            self.assertEqual(stats.status_code, 200)
            self.assertEqual(stats.json()["total_claims"], len(DEMO_SCENARIOS))

    def test_policy_must_belong_to_submitted_customer(self):
        response = TestClient(app).post(
            "/api/claims/evaluate",
            json={
                "policy_id": "POL-2026-001",
                "customer_id": "CUST-9999",
                "incident_type": "collision",
                "description": "Collision reported with a policy belonging to another customer.",
                "estimated_amount": 1000,
            },
        )
        self.assertEqual(response.status_code, 403)
