"""Persistencia de siniestros en Azure Cosmos DB.

Diseño:
- Container `claims` particionado por `/customer_id`
- Acceso AAD con identidad gestionada o workload identity explícita (sin claves)
- Si las variables de entorno COSMOS_* no están configuradas, el repositorio
  cae en modo no-op para que el backend siga funcionando en local sin Cosmos.

Cuando Cosmos está activo, el backend persiste cada siniestro procesado para:
- Vista de Cliente: listar "mis siniestros" (query por partition key)
- Vista de Operario: cola de revisión humana (query cross-partition por decision)
"""

from __future__ import annotations

import logging
import os
import sys
import json
from decimal import Decimal
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)
class ClaimConflictError(Exception): pass


class ClaimsRepository:
    """Wrapper sobre el container `claims` de Cosmos DB."""

    def __init__(self) -> None:
        self.endpoint = os.environ.get("COSMOS_ENDPOINT", "").strip()
        self.database_name = os.environ.get("COSMOS_DATABASE", "insurance-claims")
        self.container_name = os.environ.get("COSMOS_CONTAINER", "claims")
        self._container = None
        self._client = None

        if not self.endpoint:
            logger.info("Cosmos DB no configurado (COSMOS_ENDPOINT vacío) → modo en-memoria.")
            return

        try:
            from azure.cosmos import CosmosClient
            from agents.shared.identity import get_azure_credential

            credential = get_azure_credential()
            self._client = CosmosClient(self.endpoint, credential=credential)
            db = self._client.get_database_client(self.database_name)
            self._container = db.get_container_client(self.container_name)
            logger.info(
                "Cosmos DB conectado: endpoint=%s db=%s container=%s",
                self.endpoint, self.database_name, self.container_name,
            )
        except Exception as e:  # noqa: BLE001
            logger.warning("No se pudo conectar a Cosmos DB (%s) → modo en-memoria.", e)
            self._container = None

    @property
    def is_enabled(self) -> bool:
        return self._container is not None

    def save(self, claim: dict[str, Any]) -> None:
        """Persiste un siniestro procesado. No-op si Cosmos no está activo."""
        if not self._container:
            return
        # Cosmos requiere `id` como string y `customer_id` para el partition key
        doc = dict(claim)
        doc["id"] = doc.get("claim_id") or doc["id"]
        if "customer_id" not in doc:
            inp = doc.get("_input", {}) or {}
            doc["customer_id"] = inp.get("customer_id", "unknown")
        doc["persisted_at"] = datetime.now(timezone.utc).isoformat()
        try:
            self._container.create_item(doc)
            logger.debug("Cosmos create ok: id=%s customer=%s", doc["id"], doc["customer_id"])
        except Exception as e:  # noqa: BLE001
            if "Conflict" in type(e).__name__ or "409" in str(e):
                raise ClaimConflictError(doc["id"]) from e
            raise

    def get(self, claim_id: str, customer_id: str) -> Optional[dict[str, Any]]:
        if not self._container:
            return None
        try:
            return self._container.read_item(item=claim_id, partition_key=customer_id)
        except Exception as e:  # noqa: BLE001
            logger.debug("Cosmos read falló (id=%s): %s", claim_id, e)
            return None

    def get_by_claim_id(self, claim_id: str) -> Optional[dict[str, Any]]:
        if not self._container:
            return None
        try:
            items = list(self._container.query_items(
                query="SELECT * FROM c WHERE c.claim_id = @claim_id",
                parameters=[{"name": "@claim_id", "value": claim_id}],
                enable_cross_partition_query=True,
            ))
            return items[0] if items else None
        except Exception as error:  # noqa: BLE001
            logger.warning("Cosmos query (by claim id) falló: %s", error)
            return None

    def list_by_customer(self, customer_id: str, limit: int = 100) -> list[dict[str, Any]]:
        """Query por partition key — eficiente, single-partition."""
        if not self._container:
            return []
        try:
            items = list(self._container.query_items(
                query="SELECT * FROM c WHERE c.customer_id = @cid ORDER BY c.timestamp DESC OFFSET 0 LIMIT @lim",
                parameters=[{"name": "@cid", "value": customer_id}, {"name": "@lim", "value": limit}],
                partition_key=customer_id,
            ))
            return items
        except Exception as e:  # noqa: BLE001
            logger.warning("Cosmos query (by customer) falló: %s", e)
            return []

    def list_pending_review(self, limit: int = 100) -> list[dict[str, Any]]:
        if not self._container:
            return []
        try:
            return list(self._container.query_items(
                query="SELECT * FROM c WHERE c.decision = 'human_review' ORDER BY c.timestamp DESC OFFSET 0 LIMIT @lim",
                parameters=[{"name": "@lim", "value": limit}],
                enable_cross_partition_query=True,
            ))
        except Exception as error:  # noqa: BLE001
            logger.warning("Cosmos query (pending review) falló: %s", error)
            return []

    def list_all(self, limit: int | None = None) -> list[dict[str, Any]]:
        if not self._container:
            return []
        try:
            query = "SELECT * FROM c ORDER BY c.timestamp DESC"
            parameters = []
            if limit is not None:
                query += " OFFSET 0 LIMIT @lim"
                parameters = [{"name": "@lim", "value": limit}]
            return list(self._container.query_items(
                query=query,
                parameters=parameters,
                enable_cross_partition_query=True,
            ))
        except Exception as error:  # noqa: BLE001
            logger.warning("Cosmos query (all) falló: %s", error)
            return []


class DynamoClaimsRepository:
    """DynamoDB persistence for the AWS ECS profile; no process-local fallback."""

    def __init__(self) -> None:
        self.table_name = os.environ.get("DYNAMODB_TABLE", "").strip()
        self._table = None
        if not self.table_name:
            logger.info("DynamoDB no configurado (DYNAMODB_TABLE vacío).")
            return
        try:
            import boto3
            self._table = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION")).Table(self.table_name)
        except Exception as error:  # noqa: BLE001
            logger.warning("No se pudo inicializar DynamoDB: %s", error)

    @property
    def is_enabled(self) -> bool:
        return self._table is not None

    def save(self, claim: dict[str, Any]) -> None:
        if not self._table:
            return
        item = json.loads(json.dumps(claim), parse_float=Decimal)
        item["claim_id"] = str(item["claim_id"])
        item["customer_id"] = str(item.get("customer_id") or item.get("_input", {}).get("customer_id", "unknown"))
        try:
            self._table.put_item(Item=item, ConditionExpression="attribute_not_exists(claim_id)")
        except Exception as error:
            if "ConditionalCheckFailed" in type(error).__name__:
                raise ClaimConflictError(item["claim_id"]) from error
            raise

    def get(self, claim_id: str, customer_id: str | None = None) -> Optional[dict[str, Any]]:
        if not self._table:
            return None
        return self._table.get_item(Key={"claim_id": claim_id}).get("Item")

    def get_by_claim_id(self, claim_id: str) -> Optional[dict[str, Any]]:
        return self.get(claim_id)

    def list_by_customer(self, customer_id: str, limit: int = 100) -> list[dict[str, Any]]:
        if not self._table:
            return []
        from boto3.dynamodb.conditions import Key
        items, kwargs = [], {
            "IndexName": "customer_id-index",
            "KeyConditionExpression": Key("customer_id").eq(customer_id),
            "ScanIndexForward": False,
        }
        while len(items) < limit:
            response = self._table.query(**kwargs, Limit=limit - len(items))
            items.extend(response.get("Items", []))
            if not response.get("LastEvaluatedKey"):
                break
            kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
        return items

    def list_pending_review(self, limit: int = 100) -> list[dict[str, Any]]:
        if not self._table:
            return []
        from boto3.dynamodb.conditions import Key
        items, kwargs = [], {
            "IndexName": "decision-index",
            "KeyConditionExpression": Key("decision").eq("human_review"),
            "ScanIndexForward": False,
        }
        while len(items) < limit:
            response = self._table.query(**kwargs, Limit=limit - len(items))
            items.extend(response.get("Items", []))
            if not response.get("LastEvaluatedKey"):
                break
            kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
        return items

    def list_all(self, limit: int | None = None) -> list[dict[str, Any]]:
        if not self._table:
            return []
        items: list[dict[str, Any]] = []
        kwargs: dict[str, Any] = {}
        while True:
            response = self._table.scan(**kwargs)
            items.extend(response.get("Items", []))
            last_key = response.get("LastEvaluatedKey")
            if not last_key:
                ordered = sorted(
                    items,
                    key=lambda item: str(item.get("timestamp", "")),
                    reverse=True,
                )
                return ordered[:limit] if limit is not None else ordered
            kwargs["ExclusiveStartKey"] = last_key

# Singleton — se instancia una sola vez al importar
_repo: ClaimsRepository | DynamoClaimsRepository | None = None


def get_repo() -> ClaimsRepository | DynamoClaimsRepository:
    global _repo
    if _repo is None:
        _repo = DynamoClaimsRepository() if os.environ.get("STATE_BACKEND", "").lower() == "dynamodb" else ClaimsRepository()
    return _repo
