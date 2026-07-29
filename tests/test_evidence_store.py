import base64
import os
import tempfile
import unittest

os.environ["EVIDENCE_BACKEND"] = "local"
from backend.evidence_store import EvidenceStore

class EvidenceStoreTests(unittest.TestCase):
    def test_stores_reference_and_rejects_oversize(self):
        with tempfile.TemporaryDirectory() as directory:
            os.environ["EVIDENCE_LOCAL_DIR"] = directory
            os.environ["MAX_EVIDENCE_BYTES"] = "3"
            import backend.evidence_store as module
            module.MAX_EVIDENCE_BYTES = 3
            store = EvidenceStore()
            claim_id = "CLM-123E4567-E89B-42D3-A456-426614174000"
            self.assertEqual(
                store.put(claim_id, base64.b64encode(b"abc").decode()),
                f"evidence/{claim_id}",
            )
            self.assertEqual(store.get(f"evidence/{claim_id}"), base64.b64encode(b"abc").decode())
            with self.assertRaises(ValueError):
                store.put(
                    "CLM-123E4567-E89B-42D3-A456-426614174001",
                    base64.b64encode(b"abcd").decode(),
                )
            with self.assertRaises(ValueError):
                store.put("../escape", base64.b64encode(b"abc").decode())
