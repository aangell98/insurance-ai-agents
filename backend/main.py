"""FastAPI Backend - Claims Processing API for the Insurance AI Demo Dashboard."""

import asyncio
import base64
import json
import logging
import os
import sys
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Add project root to path for agent imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agents.orchestrator.agent import process_claim
from agents.shared.mock_data import DEMO_SCENARIOS, POLICIES, CUSTOMER_HISTORY

load_dotenv(override=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# In-memory stores for demo
claims_store: dict[str, dict] = {}
policies_store: dict[str, dict] = dict(POLICIES)  # mutable copy
customers_store: dict[str, dict] = dict(CUSTOMER_HISTORY)  # mutable copy
image_store: dict[str, str] = {}  # claim_id -> base64 image
security_incidents: list[dict] = []  # registry of detected manipulation/injection attempts


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
    policy_id: str = Field(..., description="Insurance policy ID", examples=["POL-2026-001"])
    customer_id: str = Field(..., description="Customer ID", examples=["CUST-1001"])
    incident_type: str = Field(..., description="Type of incident", examples=["collision"])
    description: str = Field(..., description="Free-text claim description", min_length=10)
    estimated_amount: float = Field(..., gt=0, description="Estimated claim amount in EUR")
    claim_id: str | None = Field(None, description="Optional pre-generated claim ID for WebSocket sync")
    image_b64: str | None = Field(None, description="Base64-encoded evidence image")


class PolicyRequest(BaseModel):
    customer_id: str = Field(..., description="ID del cliente al que pertenece la póliza")
    vehicle: str = Field(..., min_length=2)
    coverage_type: str = Field(default="Todo Riesgo")
    max_coverage: float = Field(default=50000, gt=0)
    start_date: str | None = Field(None, description="YYYY-MM-DD")
    end_date: str | None = Field(None, description="YYYY-MM-DD")


class CustomerRequest(BaseModel):
    name: str = Field(..., min_length=2)
    years_as_customer: int = Field(default=0, ge=0)
    previous_claims: int = Field(default=0, ge=0)
    risk_profile: str = Field(default="low")
    payment_history: str = Field(default="excellent")


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
    policy = policies_store.get(policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail=f"Policy {policy_id} not found")
    return {
        **policy,
        "customer_history": customers_store.get(policy.get("customer_id")),
    }


@app.get("/api/policies")
async def list_policies():
    """List all registered policies."""
    return list(policies_store.values())


@app.post("/api/policies")
async def register_policy(request: PolicyRequest):
    """Register a new insurance policy linked to an existing customer."""
    customer = customers_store.get(request.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail=f"Customer {request.customer_id} not found")
    seq = len(policies_store) + 1
    year = datetime.now(timezone.utc).year
    policy_id = f"POL-{year}-{seq:03d}"
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    start = request.start_date or today
    if request.end_date:
        end = request.end_date
    else:
        y = int(start[:4]) + 1
        end = f"{y}{start[4:]}"
    policy = {
        "policy_id": policy_id,
        "customer_id": request.customer_id,
        "customer_name": customer["name"],
        "vehicle": request.vehicle,
        "coverage_type": request.coverage_type,
        "status": "active",
        "start_date": start,
        "end_date": end,
        "max_coverage": request.max_coverage,
    }
    policies_store[policy_id] = policy
    # Sync to mock data so the agents see it
    from agents.shared.mock_data import POLICIES as MOCK_POLICIES
    MOCK_POLICIES[policy_id] = policy
    return policy


# ── Customers ──

@app.get("/api/customers")
async def list_customers():
    """List all registered customers."""
    return list(customers_store.values())


@app.get("/api/customers/{customer_id}")
async def get_customer(customer_id: str):
    """Lookup a customer by ID. Returns 404 if not found."""
    customer = customers_store.get(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail=f"Customer {customer_id} not found")
    customer_policies = [p for p in policies_store.values() if p.get("customer_id") == customer_id]
    return {**customer, "policies": customer_policies}


@app.post("/api/customers")
async def register_customer(request: CustomerRequest):
    """Register a new customer."""
    seq = len(customers_store) + 1
    customer_id = f"CUST-{1000 + seq}"
    customer = {
        "customer_id": customer_id,
        "name": request.name,
        "years_as_customer": request.years_as_customer,
        "previous_claims": request.previous_claims,
        "previous_claims_details": [],
        "risk_profile": request.risk_profile,
        "payment_history": request.payment_history,
    }
    customers_store[customer_id] = customer
    # Sync to mock data so agents can verify it
    from agents.shared.mock_data import CUSTOMER_HISTORY as MOCK_CUSTOMERS
    MOCK_CUSTOMERS[customer_id] = customer
    return customer


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

    # Store image if provided
    if request.image_b64:
        image_store[claim_id] = request.image_b64
        claim_input["image_b64"] = request.image_b64

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
    # Stash original input so the audit endpoint can resolve policy/customer.
    result["_input"] = {
        "policy_id": request.policy_id,
        "customer_id": request.customer_id,
    }
    claims_store[claim_id] = result

    # Register security incident if the pipeline flagged a manipulation attempt
    if result.get("security_flagged"):
        security_incidents.append({
            "claim_id": claim_id,
            "policy_id": request.policy_id,
            "customer_id": request.customer_id,
            "incident_type": "prompt_injection",
            "severity": "critical",
            "detected_at": result["timestamp"],
            "description": (
                "Intento de manipulación del sistema detectado en la descripción del siniestro. "
                "Se identificaron instrucciones falsas que intentaban evadir los controles de validación."
            ),
            "raw_payload_excerpt": request.description[:500],
            "status": "open",
        })
        logger.warning(
            f"🛡️ SECURITY INCIDENT REGISTERED: claim={claim_id} customer={request.customer_id} "
            f"policy={request.policy_id} (total open: {len([i for i in security_incidents if i['status']=='open'])})"
        )

    return ClaimResponse(**result)


@app.get("/api/claims/{claim_id}/audit")
async def get_audit_trail(claim_id: str):
    """Get the complete audit trail for a processed claim."""
    result = claims_store.get(claim_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Claim {claim_id} not found")

    # Resolve policy + customer history so the operator can see the source data
    # the agents actually consulted (CUSTOMER_HISTORY / POLICIES).
    from agents.shared.mock_data import CUSTOMER_HISTORY
    inp = result.get("_input", {})
    policy = policies_store.get(inp.get("policy_id"))
    customer = CUSTOMER_HISTORY.get(inp.get("customer_id"))

    return {
        "claim_id": claim_id,
        "decision": result["decision"],
        "confidence": result["confidence"],
        "reasoning": result["reasoning"],
        "total_duration_ms": result["total_duration_ms"],
        "audit_trail": result["audit_trail"],
        "intake_result": result["intake_result"],
        "risk_result": result["risk_result"],
        "compliance_result": result["compliance_result"],
        "metadata": result.get("metadata", {}),
        "has_image": claim_id in image_store,
        "policy": policy,
        "customer_history": customer,
    }


@app.get("/api/claims/{claim_id}/image")
async def get_claim_image(claim_id: str):
    """Return the base64 evidence image attached to a claim, if any."""
    img = image_store.get(claim_id)
    if not img:
        raise HTTPException(status_code=404, detail="No image for this claim")
    return {"claim_id": claim_id, "image_b64": img}


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
            "estimated_amount": r.get("intake_result", {}).get("extracted_data", {}).get("estimated_amount", 0),
            "policy_id": r.get("intake_result", {}).get("claim_id", ""),
        }
        for cid, r in claims_store.items()
    ]


@app.get("/api/security/incidents")
async def list_security_incidents():
    """List all detected security incidents (manipulation / prompt-injection attempts)."""
    return {
        "total": len(security_incidents),
        "open": sum(1 for i in security_incidents if i["status"] == "open"),
        "incidents": list(reversed(security_incidents)),  # newest first
    }


@app.get("/api/stats")
async def get_statistics():
    """Get dashboard statistics for the operator view."""
    total = len(claims_store)
    approved = sum(1 for r in claims_store.values() if r["decision"] == "approve")
    review = sum(1 for r in claims_store.values() if r["decision"] == "human_review")
    rejected = sum(1 for r in claims_store.values() if r["decision"] == "reject")
    avg_duration = (
        sum(r["total_duration_ms"] for r in claims_store.values()) / total
        if total > 0 else 0
    )
    total_amount = sum(
        r.get("intake_result", {}).get("extracted_data", {}).get("estimated_amount", 0)
        or 0
        for r in claims_store.values()
    )
    avg_risk = 0
    risk_count = 0
    for r in claims_store.values():
        rs = r.get("risk_result", {}).get("risk_score")
        if rs:
            avg_risk += rs
            risk_count += 1
    avg_risk = avg_risk / risk_count if risk_count > 0 else 0

    return {
        "total_claims": total,
        "approved": approved,
        "human_review": review,
        "rejected": rejected,
        "avg_duration_ms": round(avg_duration),
        "total_amount": total_amount,
        "avg_risk_score": round(avg_risk, 1),
        "active_policies": len(policies_store),
        "decisions_breakdown": {
            "approve": approved,
            "human_review": review,
            "reject": rejected,
        },
    }


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
