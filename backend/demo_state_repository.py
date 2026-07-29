"""Shared mutable demo state; memory is only for the explicit mock profile."""
from __future__ import annotations

import os
import threading
import json
from decimal import Decimal
from collections.abc import MutableMapping
from typing import Any, Iterator

from agents.shared.mock_data import CUSTOMER_HISTORY, POLICIES


class DemoStateRepository:
    _memory: dict[str, dict[str, Any]] = {
        "policies": {},
        "customers": {},
        "incidents": {},
        "evidence": {},
        "claim_ids": {},
    }
    _lock = threading.Lock()

    def __init__(self) -> None:
        self.backend = os.environ.get("STATE_BACKEND", "memory").lower()
        self._table = None
        if self.backend == "dynamodb":
            import boto3
            table = os.environ.get("DYNAMODB_STATE_TABLE", "")
            if not table:
                raise RuntimeError("DYNAMODB_STATE_TABLE is required for STATE_BACKEND=dynamodb")
            self._table = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION")).Table(table)
        if self.backend == "cosmos":
            from azure.cosmos import CosmosClient
            from agents.shared.identity import get_azure_credential
            endpoint = os.environ["COSMOS_ENDPOINT"]
            self._container = CosmosClient(endpoint, credential=get_azure_credential()).get_database_client(os.environ.get("COSMOS_DATABASE", "insurance-claims")).get_container_client(os.environ.get("COSMOS_STATE_CONTAINER", "demo-state"))
        else:
            self._container = None
        self.seed()

    def seed(self) -> None:
        for key, value in POLICIES.items():
            self.put_if_absent("policies", key, value)
        for key, value in CUSTOMER_HISTORY.items():
            self.put_if_absent("customers", key, value)

    def put_if_absent(self, collection: str, key: str, value: dict[str, Any]) -> None:
        if self.backend == "memory":
            with self._lock:
                self._memory[collection].setdefault(key, dict(value))
            return
        if self.backend == "cosmos":
            try:
                self._container.create_item({"id": f"STATE#{collection}#{key}", "customer_id": "STATE", "state_collection": collection, "state_key": key, "state_value": value})
            except Exception:
                pass
            return
        try:
            self._table.put_item(
                Item={"claim_id": f"STATE#{collection}#{key}", "customer_id": "STATE", "state_collection": collection, "state_key": key, "state_value": json.loads(json.dumps(value), parse_float=Decimal)},
                ConditionExpression="attribute_not_exists(claim_id)",
            )
        except self._table.meta.client.exceptions.ConditionalCheckFailedException:
            pass

    def put(self, collection: str, key: str, value: dict[str, Any]) -> None:
        if self.backend == "memory":
            with self._lock:
                self._memory[collection][key] = dict(value)
            return
        if self.backend == "cosmos":
            self._container.upsert_item({"id": f"STATE#{collection}#{key}", "customer_id": "STATE", "state_collection": collection, "state_key": key, "state_value": value})
            return
        normalized = json.loads(json.dumps(value), parse_float=Decimal)
        self._table.put_item(Item={"claim_id": f"STATE#{collection}#{key}", "customer_id": "STATE", "state_collection": collection, "state_key": key, "state_value": normalized})

    def get(self, collection: str, key: str) -> dict[str, Any] | None:
        if self.backend == "memory":
            return self._memory[collection].get(key)
        if self.backend == "cosmos":
            try:
                return self._container.read_item(item=f"STATE#{collection}#{key}", partition_key="STATE").get("state_value")
            except Exception:
                return None
        item = self._table.get_item(Key={"claim_id": f"STATE#{collection}#{key}"}).get("Item")
        return item.get("state_value") if item else None

    def values(self, collection: str) -> list[dict[str, Any]]:
        if self.backend == "memory":
            return list(self._memory[collection].values())
        if self.backend == "cosmos":
            return [item["state_value"] for item in self._container.query_items(query="SELECT * FROM c WHERE c.customer_id = 'STATE' AND c.state_collection = @c", parameters=[{"name": "@c", "value": collection}], partition_key="STATE")]
        items, kwargs = [], {"FilterExpression": "state_collection = :c", "ExpressionAttributeValues": {":c": collection}}
        while True:
            response = self._table.scan(**kwargs)
            items.extend(item["state_value"] for item in response.get("Items", []))
            if not response.get("LastEvaluatedKey"):
                return items
            kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]

    def reserve_claim_id(self, claim_id: str, customer_id: str) -> bool:
        value = {"claim_id": claim_id, "customer_id": customer_id}
        if self.backend == "memory":
            with self._lock:
                if claim_id in self._memory["claim_ids"]:
                    return False
                self._memory["claim_ids"][claim_id] = value
                return True
        if self.backend == "cosmos":
            try:
                self._container.create_item({
                    "id": f"STATE#claim_ids#{claim_id}",
                    "customer_id": "STATE",
                    "state_collection": "claim_ids",
                    "state_key": claim_id,
                    "state_value": value,
                })
                return True
            except Exception as error:
                if "Conflict" in type(error).__name__ or "409" in str(error):
                    return False
                raise
        try:
            self._table.put_item(
                Item={
                    "claim_id": f"STATE#claim_ids#{claim_id}",
                    "customer_id": "STATE",
                    "state_collection": "claim_ids",
                    "state_key": claim_id,
                    "state_value": value,
                },
                ConditionExpression="attribute_not_exists(claim_id)",
            )
            return True
        except self._table.meta.client.exceptions.ConditionalCheckFailedException:
            return False

    def release_claim_id(self, claim_id: str) -> None:
        if self.backend == "memory":
            with self._lock:
                self._memory["claim_ids"].pop(claim_id, None)
            return
        if self.backend == "cosmos":
            try:
                self._container.delete_item(
                    item=f"STATE#claim_ids#{claim_id}",
                    partition_key="STATE",
                )
            except Exception:
                pass
            return
        self._table.delete_item(Key={"claim_id": f"STATE#claim_ids#{claim_id}"})


class StateMapping(MutableMapping[str, dict[str, Any]]):
    def __init__(self, repository: DemoStateRepository, collection: str):
        self.repository, self.collection = repository, collection
    def __getitem__(self, key):
        value = self.repository.get(self.collection, key)
        if value is None: raise KeyError(key)
        return value
    def __setitem__(self, key, value): self.repository.put(self.collection, key, value)
    def __delitem__(self, key): raise NotImplementedError
    def __iter__(self) -> Iterator[str]:
        return iter([str(value.get(f"{self.collection[:-1]}_id", "")) for value in self.values()])
    def __len__(self): return len(self.repository.values(self.collection))
    def values(self): return self.repository.values(self.collection)
    def get(self, key, default=None): return self.repository.get(self.collection, key) or default
