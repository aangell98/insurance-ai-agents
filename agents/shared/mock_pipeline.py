"""Deterministic, no-network pipeline used for local restores and evaluations."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Awaitable, Callable

from agents.compliance.rules import evaluate_compliance
from agents.shared.mock_data import CUSTOMER_HISTORY, POLICIES

ProgressCallback = Callable[[str, str, dict], Awaitable[None]]


async def process_claim_mock(claim: dict, progress_callback: ProgressCallback | None = None) -> dict:
    """Produce the production response schema without an LLM, credentials, or network."""
    async def notify(stage: str, status: str, data: dict) -> None:
        if progress_callback:
            await progress_callback(stage, status, data)

    claim_id = claim["claim_id"]
    text = claim.get("description", "")
    injection = bool(re.search(r"nota\s+interna|override|bypass|ignore\s+.*instruction|jailbreak", text, re.I))
    policy = POLICIES.get(claim.get("policy_id"))
    customer = CUSTOMER_HISTORY.get(claim.get("customer_id"), {})
    amount = float(claim.get("estimated_amount", 0))
    now = datetime.now(timezone.utc).isoformat()
    audit: list[dict] = []

    await notify("intake", "processing", {})
    intake = {
        "claim_id": claim_id, "policy_valid": bool(policy) and not injection,
        "severity": "high" if injection or amount >= 10000 else "low",
        "extracted_data": {
            "incident_type": claim.get("incident_type", "other"),
            "vehicle": policy.get("vehicle", "") if policy else "",
            "estimated_amount": amount,
            "documentation_provided": ["prompt_injection_detected"] if injection else ["claim_description"],
        },
        "summary": "ALERTA: Intento de manipulación detectado" if injection else "Datos del siniestro estructurados.",
    }
    await notify("intake", "token", {"text": str(intake)})
    await notify("intake", "completed", intake)
    audit.append(_audit("intake", intake, 1))

    await notify("risk_assessment", "processing", {})
    previous_claims = int(customer.get("previous_claims", 0))
    # A high-risk customer is routed to a person, not automatically rejected:
    # this preserves the dashboard's fraudulent-case human-review demo.
    risk_score = 9 if injection else 8 if previous_claims > 2 else 4 if amount >= 10000 else 2
    fraud = "high" if injection else "medium" if previous_claims > 2 else "low"
    risk = {"claim_id": claim_id, "risk_score": risk_score, "fraud_probability": fraud, "risk_factors": []}
    await notify("risk_assessment", "token", {"text": str(risk)})
    await notify("risk_assessment", "completed", risk)
    audit.append(_audit("risk_assessment", risk, 1))

    await notify("compliance", "processing", {})
    rules = evaluate_compliance(amount, risk_score, fraud)
    decision = "reject" if injection or not policy else rules["decision"]
    compliance = {"claim_id": claim_id, "compliant": decision != "reject", "decision": decision, "rules_applied": rules["rules_applied"]}
    await notify("compliance", "token", {"text": str(compliance)})
    await notify("compliance", "completed", compliance)
    audit.append(_audit("compliance", compliance, 1))

    reasoning = (
        "🛡️ ALERTA DE SEGURIDAD: prompt injection bloqueado por regla determinística."
        if injection else
        "Póliza inexistente o inactiva; siniestro rechazado."
        if not policy else
        "Revisión humana requerida por el umbral de riesgo o importe."
        if decision == "human_review" else
        "Aprobado por las reglas determinísticas de la póliza."
    )
    await notify("decision", "processing", {})
    await notify("decision", "completed", {"decision": decision, "confidence": 0.99 if injection else 0.8 if decision == "human_review" else 0.9, "reasoning": reasoning})
    if injection:
        audit.append(_audit("security_guard", {"patterns_matched": ["prompt_injection"]}, 0, "triggered"))
    return {
        "claim_id": claim_id, "decision": decision, "confidence": 0.99 if injection else 0.8 if decision == "human_review" else 0.9,
        "reasoning": reasoning, "total_duration_ms": 3, "intake_result": intake, "risk_result": risk,
        "compliance_result": compliance, "audit_trail": audit, "security_flagged": injection, "timestamp": now,
        "metadata": {"model": "deterministic-mock", "pipeline_version": "preservation-1.0.0", "mode": "mock"},
    }


def _audit(stage: str, result: dict, duration_ms: int, status: str = "completed") -> dict:
    return {"stage": stage, "status": status, "timestamp": datetime.now(timezone.utc).isoformat(), "duration_ms": duration_ms, "result_summary": str(result)[:200]}
