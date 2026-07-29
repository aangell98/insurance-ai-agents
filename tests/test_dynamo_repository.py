import unittest
from decimal import Decimal

from backend.claims_repository import DynamoClaimsRepository


class FakeTable:
    def __init__(self):
        self.item = None
        self.kwargs = None

    def put_item(self, Item, **kwargs):
        self.item = Item
        self.kwargs = kwargs


class DynamoRepositoryTests(unittest.TestCase):
    def test_save_normalizes_claim_and_float_for_dynamodb(self):
        repository = object.__new__(DynamoClaimsRepository)
        repository._table = FakeTable()
        repository.save({
            "claim_id": "CLAIM-1",
            "customer_id": "CUST-1",
            "estimated_amount": 12.5,
        })
        self.assertEqual(repository._table.item["claim_id"], "CLAIM-1")
        self.assertEqual(repository._table.item["customer_id"], "CUST-1")
        self.assertEqual(repository._table.item["estimated_amount"], Decimal("12.5"))
        self.assertEqual(
            repository._table.kwargs["ConditionExpression"],
            "attribute_not_exists(claim_id)",
        )
