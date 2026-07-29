import os
import sys
import unittest
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

os.environ.setdefault("AUTH_ENABLED", "false")
os.environ.setdefault("LLM_PROVIDER", "mock")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import main
from claims_repository import ClaimConflictError
from demo_state_repository import DemoStateRepository


class WebSocketTicketTests(unittest.TestCase):
    def setUp(self):
        main.websocket_tickets.clear()
        main.claim_reservations.clear()
        DemoStateRepository._memory["claim_ids"].clear()
        self.client = TestClient(main.app)

    def ticket(self, claim_id=None, customer_id="CUST-1001"):
        claim_id = claim_id or "CLM-" + str(uuid.uuid4())
        response = self.client.post(
            "/api/ws-ticket",
            json={"claim_id": claim_id, "customer_id": customer_id},
        )
        self.assertEqual(response.status_code, 200)
        return claim_id, response.json()["ticket"]

    def test_ticket_is_bound_and_single_use(self):
        claim_id, ticket = self.ticket()
        with self.client.websocket_connect(
            f"/ws/claims/{claim_id}?ticket={ticket}"
        ) as socket:
            socket.send_text("ping")
            self.assertEqual(socket.receive_json()["type"], "pong")
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect(
                f"/ws/claims/{claim_id}?ticket={ticket}"
            ):
                pass

        claim_id, ticket = self.ticket()
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect(
                f"/ws/claims/CLM-{uuid.uuid4()}?ticket={ticket}"
            ):
                pass

    def test_expired_or_wrong_claim_ticket_is_rejected(self):
        claim_id, ticket = self.ticket()
        main.websocket_tickets[ticket]["expires"] = 0
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect(
                f"/ws/claims/{claim_id}?ticket={ticket}"
            ):
                pass

    def test_claim_id_cannot_be_reserved_twice(self):
        claim_id, _ = self.ticket()
        response = self.client.post(
            "/api/ws-ticket",
            json={"claim_id": claim_id, "customer_id": "CUST-1001"},
        )
        self.assertEqual(response.status_code, 409)

class ClaimIdTests(unittest.TestCase):
    def test_default_claim_id_contains_full_uuid(self):
        response = TestClient(main.app).post(
            "/api/claims/evaluate",
            json={
                "policy_id": "POL-2026-001",
                "customer_id": "CUST-1001",
                "incident_type": "collision",
                "description": "Rear bumper collision while parked, no injuries reported.",
                "estimated_amount": 1200,
            },
        )
        self.assertEqual(response.status_code, 200)
        claim_id = response.json()["claim_id"]
        self.assertTrue(claim_id.startswith("CLM-"))
        uuid.UUID(claim_id.removeprefix("CLM-"))

    def test_persistence_conflict_returns_409_without_local_mutation(self):
        claim_id = "CLM-123E4567-E89B-42D3-A456-426614174000"
        main.claims_store.pop(claim_id, None)
        repository = MagicMock()
        repository.save.side_effect = ClaimConflictError(claim_id)
        with patch.object(main, "get_repo", return_value=repository):
            response = TestClient(main.app).post(
                "/api/claims/evaluate",
                json={
                    "claim_id": claim_id,
                    "policy_id": "POL-2026-001",
                    "customer_id": "CUST-1001",
                    "incident_type": "collision",
                    "description": "Rear bumper collision while parked, no injuries reported.",
                    "estimated_amount": 1200,
                },
            )
        self.assertEqual(response.status_code, 409)
        self.assertNotIn(claim_id, main.claims_store)


if __name__ == "__main__":
    unittest.main()
