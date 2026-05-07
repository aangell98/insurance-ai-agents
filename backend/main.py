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
from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect, HTTPException, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Add project root to path for agent imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agents.orchestrator.agent import process_claim
from agents.shared.mock_data import DEMO_SCENARIOS, POLICIES, CUSTOMER_HISTORY
from claims_repository import get_repo
from auth import (
    AUTH_ENABLED,
    Principal,
    enforce_self_or_operator,
    require_customer_or_operator,
    require_operator,
)

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
async def get_policy(policy_id: str, _: Principal = Depends(require_operator)):
    """Lookup a policy by ID. Returns 404 if not found."""
    policy = policies_store.get(policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail=f"Policy {policy_id} not found")
    return {
        **policy,
        "customer_history": customers_store.get(policy.get("customer_id")),
    }


@app.get("/api/policies")
async def list_policies(_: Principal = Depends(require_operator)):
    """List all registered policies."""
    return list(policies_store.values())


@app.post("/api/policies")
async def register_policy(request: PolicyRequest, _: Principal = Depends(require_operator)):
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
async def list_customers(_: Principal = Depends(require_operator)):
    """List all registered customers."""
    return list(customers_store.values())


@app.get("/api/customers/{customer_id}")
async def get_customer(customer_id: str, _: Principal = Depends(require_operator)):
    """Lookup a customer by ID. Returns 404 if not found."""
    customer = customers_store.get(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail=f"Customer {customer_id} not found")
    customer_policies = [p for p in policies_store.values() if p.get("customer_id") == customer_id]
    return {**customer, "policies": customer_policies}


@app.post("/api/customers")
async def register_customer(request: CustomerRequest, _: Principal = Depends(require_operator)):
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
async def evaluate_claim(
    request: ClaimRequest,
    principal: Principal = Depends(require_customer_or_operator),
):
    """Submit a claim for evaluation through the multi-agent pipeline.

    This is the main endpoint. It runs the claim through:
    1. Claims Intake Agent
    2. Risk & Fraud Assessment Agent
    3. Compliance Agent
    4. Final Decision

    Si AUTH_ENABLED y el caller es customer-puro, el `customer_id` del body
    debe coincidir con el UPN del token (un cliente sólo crea siniestros suyos).
    """
    enforce_self_or_operator(principal, request.customer_id)
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
    # customer_id at top level too — used by Cosmos as partition key
    result["customer_id"] = request.customer_id
    result["policy_id"] = request.policy_id
    result["estimated_amount"] = request.estimated_amount
    result["incident_type"] = request.incident_type
    claims_store[claim_id] = result

    # Persist to Cosmos (no-op si COSMOS_ENDPOINT no está configurado)
    try:
        get_repo().save(result)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Cosmos persist failó: {e}")

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
    else:
        # Register a fraud-suspected incident if Risk flagged high fraud probability
        # (kept separate from prompt-injection so the SecurityView can distinguish them)
        risk = result.get("risk_result") or {}
        intake = result.get("intake_result") or {}
        fraud_prob = str(risk.get("fraud_probability", "")).lower()
        image_mismatch = intake.get("image_matches_description") is False
        if fraud_prob == "high" or image_mismatch:
            reasons = []
            if fraud_prob == "high":
                reasons.append(f"Probabilidad de fraude alta (risk_score={risk.get('risk_score', '?')}).")
            if image_mismatch:
                concerns = intake.get("image_concerns") or "imagen no relacionada con el siniestro descrito"
                reasons.append(f"Imagen aportada no coherente: {concerns}")
            security_incidents.append({
                "claim_id": claim_id,
                "policy_id": request.policy_id,
                "customer_id": request.customer_id,
                "incident_type": "fraud_suspected",
                "severity": "high" if fraud_prob == "high" else "medium",
                "detected_at": result["timestamp"],
                "description": " ".join(reasons),
                "raw_payload_excerpt": request.description[:500],
                "status": "open",
            })
            logger.warning(
                f"🚨 FRAUD INCIDENT REGISTERED: claim={claim_id} fraud_prob={fraud_prob} "
                f"image_mismatch={image_mismatch}"
            )

    return ClaimResponse(**result)


@app.get("/api/claims/{claim_id}/audit")
async def get_audit_trail(claim_id: str, _: Principal = Depends(require_operator)):
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
async def get_claim_image(claim_id: str, _: Principal = Depends(require_operator)):
    """Return the base64 evidence image attached to a claim, if any."""
    img = image_store.get(claim_id)
    if not img:
        raise HTTPException(status_code=404, detail="No image for this claim")
    return {"claim_id": claim_id, "image_b64": img}


@app.get("/api/claims")
async def list_claims(_: Principal = Depends(require_operator)):
    """List all processed claims (for demo dashboard).

    Si Cosmos está configurado, lee de la base de datos (persistencia real).
    Si no, cae en el store en-memoria (fallback dev).
    """
    repo = get_repo()
    if repo.is_enabled:
        items = repo.list_all(limit=200)
        return [
            {
                "claim_id": r.get("claim_id") or r.get("id"),
                "customer_id": r.get("customer_id"),
                "policy_id": r.get("policy_id") or (r.get("_input") or {}).get("policy_id", ""),
                "decision": r.get("decision"),
                "confidence": r.get("confidence"),
                "timestamp": r.get("timestamp"),
                "total_duration_ms": r.get("total_duration_ms"),
                "estimated_amount": r.get("estimated_amount")
                    or r.get("intake_result", {}).get("extracted_data", {}).get("estimated_amount", 0),
                "persisted": True,
            }
            for r in items
        ]
    # Fallback in-memory
    return [
        {
            "claim_id": cid,
            "customer_id": (r.get("_input") or {}).get("customer_id"),
            "decision": r["decision"],
            "confidence": r["confidence"],
            "timestamp": r["timestamp"],
            "total_duration_ms": r["total_duration_ms"],
            "estimated_amount": r.get("intake_result", {}).get("extracted_data", {}).get("estimated_amount", 0),
            "policy_id": r.get("intake_result", {}).get("claim_id", ""),
            "persisted": False,
        }
        for cid, r in claims_store.items()
    ]


@app.get("/api/claims/by-customer/{customer_id}")
async def list_claims_by_customer(
    customer_id: str,
    principal: Principal = Depends(require_customer_or_operator),
):
    """Lista siniestros de un cliente concreto (single-partition query).

    Customer-puro sólo puede consultar su propio `customer_id` (matched contra UPN).
    Operator puede consultar cualquiera.
    """
    enforce_self_or_operator(principal, customer_id)
    repo = get_repo()
    if repo.is_enabled:
        items = repo.list_by_customer(customer_id, limit=100)
    else:
        items = [
            r for r in claims_store.values()
            if (r.get("_input") or {}).get("customer_id") == customer_id
        ]
    return [
        {
            "claim_id": r.get("claim_id") or r.get("id"),
            "customer_id": r.get("customer_id") or (r.get("_input") or {}).get("customer_id"),
            "decision": r.get("decision"),
            "confidence": r.get("confidence"),
            "timestamp": r.get("timestamp"),
            "estimated_amount": r.get("estimated_amount")
                or r.get("intake_result", {}).get("extracted_data", {}).get("estimated_amount", 0),
        }
        for r in items
    ]


@app.get("/api/claims/pending-review")
async def list_pending_review(_: Principal = Depends(require_operator)):
    """Cola de revisión humana — vista de operario."""
    repo = get_repo()
    if repo.is_enabled:
        items = repo.list_pending_review(limit=100)
    else:
        items = [r for r in claims_store.values() if r.get("decision") == "human_review"]
    return [
        {
            "claim_id": r.get("claim_id") or r.get("id"),
            "customer_id": r.get("customer_id") or (r.get("_input") or {}).get("customer_id"),
            "policy_id": r.get("policy_id") or (r.get("_input") or {}).get("policy_id"),
            "decision": r.get("decision"),
            "confidence": r.get("confidence"),
            "reasoning": r.get("reasoning"),
            "timestamp": r.get("timestamp"),
            "estimated_amount": r.get("estimated_amount")
                or r.get("intake_result", {}).get("extracted_data", {}).get("estimated_amount", 0),
        }
        for r in items
    ]


@app.get("/api/security/incidents")
async def list_security_incidents(_: Principal = Depends(require_operator)):
    """List all detected security incidents (manipulation / prompt-injection attempts)."""
    return {
        "total": len(security_incidents),
        "open": sum(1 for i in security_incidents if i["status"] == "open"),
        "incidents": list(reversed(security_incidents)),  # newest first
    }


@app.get("/api/governance/status")
async def governance_status(_: Principal = Depends(require_operator)):
    """Return live governance posture: APIM gateway, eval pipeline, audit trail."""
    import subprocess

    # Git commit (best-effort)
    git_sha = os.environ.get("GIT_SHA")
    if not git_sha:
        try:
            git_sha = subprocess.check_output(
                ["git", "rev-parse", "--short", "HEAD"],
                cwd=os.path.join(os.path.dirname(__file__), ".."),
                stderr=subprocess.DEVNULL,
                timeout=3,
            ).decode().strip()
        except Exception:
            git_sha = "local-dev"

    apim_enabled = os.environ.get("USE_APIM_GATEWAY", "false").lower() in ("1", "true", "yes")
    apim_url = os.environ.get("APIM_GATEWAY_URL", "")
    if apim_url:
        # mask middle part
        try:
            host = apim_url.split("//", 1)[1]
            apim_url_masked = f"https://{host[:6]}***{host[-12:]}"
        except Exception:
            apim_url_masked = "***"
    else:
        apim_url_masked = "(no configurado — modo directo)"

    # Latest eval report
    eval_path = os.path.join(os.path.dirname(__file__), "..", "evals", "last_report.json")
    latest_eval: dict | None = None
    if os.path.isfile(eval_path):
        try:
            with open(eval_path, "r", encoding="utf-8") as f:
                report = json.load(f)
            latest_eval = {
                "timestamp": report.get("timestamp"),
                "total": report.get("total"),
                "passed": report.get("passed"),
                "failed": report.get("failed"),
                "pass_rate": report.get("pass_rate"),
                "model": report.get("model"),
                "via_apim": report.get("via_apim"),
            }
        except Exception:
            latest_eval = None

    # CODEOWNERS summary
    codeowners_path = os.path.join(os.path.dirname(__file__), "..", ".github", "CODEOWNERS")
    code_owners: list[dict] = []
    if os.path.isfile(codeowners_path):
        try:
            with open(codeowners_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    parts = line.split()
                    if len(parts) >= 2:
                        code_owners.append({"path": parts[0], "owners": parts[1:]})
        except Exception:
            pass

    return {
        "pipeline_version": "1.0.0",
        "git_commit": git_sha,
        "model": os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o"),
        "deployed_at": datetime.now(timezone.utc).isoformat(),
        "apim": {
            "enabled": apim_enabled,
            "gateway_url": apim_url_masked,
            "policies": [
                {"id": "managed-identity",  "name": "Managed Identity → Azure OpenAI",            "active": True},
                {"id": "audit-log",         "name": "Audit Trace (request + response)",            "active": True},
                {"id": "content-safety",    "name": "LLM Content Safety (Hate/Sexual/SH/Violence)","active": True},
                {"id": "token-limit",       "name": "Azure OpenAI Token Limit (per agent)",        "active": True},
                {"id": "emit-token-metric", "name": "Token metrics → App Insights",                "active": True},
                {"id": "error-handling",    "name": "On-error fallback (429 + safety)",            "active": True},
            ],
        },
        "evals": {
            "dataset_path": "evals/golden_dataset.json",
            "workflow": ".github/workflows/eval-on-pr.yml",
            "latest": latest_eval,
        },
        "code_ownership": code_owners,
        "checks": {
            "pull_request_template":   os.path.isfile(os.path.join(os.path.dirname(__file__), "..", ".github", "pull_request_template.md")),
            "codeowners":              os.path.isfile(codeowners_path),
            "deploy_workflow":         os.path.isfile(os.path.join(os.path.dirname(__file__), "..", ".github", "workflows", "deploy-agent.yml")),
            "eval_workflow":           os.path.isfile(os.path.join(os.path.dirname(__file__), "..", ".github", "workflows", "eval-on-pr.yml")),
            "infra_as_code":           os.path.isfile(os.path.join(os.path.dirname(__file__), "..", "infra", "main.bicep")),
            "apim_policy_xml":         os.path.isfile(os.path.join(os.path.dirname(__file__), "..", "infra", "apim-policy.xml")),
        },
    }


@app.get("/api/stats")
async def get_statistics(_: Principal = Depends(require_operator)):
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
