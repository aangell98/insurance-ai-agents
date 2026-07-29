import os
import unittest

os.environ["STATE_BACKEND"] = "memory"

from backend.demo_state_repository import DemoStateRepository


class DemoStateRepositoryTests(unittest.TestCase):
    def test_state_created_by_one_instance_is_visible_after_restart(self):
        first = DemoStateRepository()
        first.put("incidents", "restart-test", {"status": "open", "claim_id": "CLM-R"})
        second = DemoStateRepository()
        self.assertEqual(second.get("incidents", "restart-test")["claim_id"], "CLM-R")
