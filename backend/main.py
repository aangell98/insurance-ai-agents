"""FastAPI Backend - Claims Processing API for the Insurance AI Demo Dashboard."""

import asyncio
import json
import logging
import os
import sys
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Add project root to path for agent imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agents.orchestrator.agent import process_claim
from agents.shared.mock_data import DEMO_SCENARIOS, POLICIES

load_dotenv(override=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# In-memory store for demo (no persistence needed)
claims_store: dict[str, dict] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Insurance AI Claims API starting up")
    yield
    logger.info("Insurance AI Claims API shutting down")


app = FastAPI(
    title="Insurance AI Claims API",
    description="Multi-agent claims processing pipeline for insurance companies",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        os.environ.get("FRONTEND_URL", ""),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ──

class ClaimRequest(BaseModel):
    policy_id: str = Field(..., description="Insurance policy ID", examples=["POL-2024-001"])
    customer_id: str = Field(..., description="Customer ID", examples=["CUST-1001"])
    incident_type: str = Field(..., description="Type of incident", examples=["collision"])
    description: str = Field(..., description="Free-text claim description", min_length=10)
    estimated_amount: float = Field(..., gt=0, description="Estimated claim amount in EUR")
    claim_id: str | None = Field(None, description="Optional pre-generated claim ID for WebSocket sync")


class ClaimResponse(BaseModel):
    claim_id: str
    decision: str
    confidence: float
    reasoning: str
    total_duration_ms: int
    intake_result: dict
    risk_result: dict
    compliance_result: dict
    audit_trail: list
    timestamp: str


# ── WebSocket connection manager ──

class ConnectionManager:
    def __init__(self):
        self.active: dict[str, WebSocket] = {}

    async def connect(self, claim_id: str, ws: WebSocket):
        await ws.accept()
        self.active[claim_id] = ws

    def disconnect(self, claim_id: str):
        self.active.pop(claim_id, None)

    async def send_update(self, claim_id: str, data: dict):
        ws = self.active.get(claim_id)
        if ws:
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(claim_id)


manager = ConnectionManager()


# ── Endpoints ──

@app.get("/api/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/scenarios")
async def get_scenarios():
    """Return available demo scenarios for quick testing."""
    return {
        name: {
            "policy_id": s["policy_id"],
            "customer_id": s["customer_id"],
            "incident_type": s.get("incident_type", "collision"),
            "description": s["description"],
            "estimated_amount": s["estimated_amount"],
            "expected_decision": s["expected_decision"],
        }
        for name, s in DEMO_SCENARIOS.items()
    }


@app.get("/api/policies/{policy_id}")
async def get_policy(policy_id: str):
    """Lookup a policy by ID. Returns 404 if not found."""
    policy = POLICIES.get(policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail=f"Policy {policy_id} not found")
    return policy


@app.post("/api/claims/evaluate", response_model=ClaimResponse)
async def evaluate_claim(request: ClaimRequest):
    """Submit a claim for evaluation through the multi-agent pipeline.
    
    This is the main endpoint. It runs the claim through:
    1. Claims Intake Agent
    2. Risk & Fraud Assessment Agent
    3. Compliance Agent
    4. Final Decision
    """
    claim_id = request.claim_id or f"CLM-{uuid.uuid4().hex[:8].upper()}"

    claim_input = {
        "claim_id": claim_id,
        "policy_id": request.policy_id,
        "customer_id": request.customer_id,
        "incident_type": request.incident_type,
        "description": request.description,
        "estimated_amount": request.estimated_amount,
    }

    async def progress_callback(stage: str, status: str, data: dict):
        await manager.send_update(claim_id, {
            "type": "progress",
            "claim_id": claim_id,
            "stage": stage,
            "status": status,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    result = await process_claim(claim_input, progress_callback=progress_callback)
    claims_store[claim_id] = result

    return ClaimResponse(**result)


@app.get("/api/claims/{claim_id}/audit")
async def get_audit_trail(claim_id: str):
    """Get the complete audit trail for a processed claim."""
    result = claims_store.get(claim_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Claim {claim_id} not found")
    return {
        "claim_id": claim_id,
        "decision": result["decision"],
        "audit_trail": result["audit_trail"],
        "intake_result": result["intake_result"],
        "risk_result": result["risk_result"],
        "compliance_result": result["compliance_result"],
        "metadata": result.get("metadata", {}),
    }


@app.get("/api/claims")
async def list_claims():
    """List all processed claims (for demo dashboard)."""
    return [
        {
            "claim_id": cid,
            "decision": r["decision"],
            "confidence": r["confidence"],
            "timestamp": r["timestamp"],
            "total_duration_ms": r["total_duration_ms"],
        }
        for cid, r in claims_store.items()
    ]


@app.websocket("/ws/claims/{claim_id}")
async def claim_websocket(websocket: WebSocket, claim_id: str):
    """WebSocket endpoint for real-time pipeline progress updates.
    
    Connect before calling /api/claims/evaluate to receive stage-by-stage updates.
    """
    await manager.connect(claim_id, websocket)
    try:
        while True:
            # Keep connection alive, client sends pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(claim_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
