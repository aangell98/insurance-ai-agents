"""Orchestrator Agent - Coordinates the multi-agent workflow for claims processing.

This agent implements a sequential graph-based workflow:
  START → Claims Intake → Risk Assessment → Compliance → Final Decision

Each agent's output feeds into the next agent, creating a complete audit trail.
"""

import json
import os
import logging
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv

import importlib

# Agent directories use hyphens (claims-intake), so we use importlib
intake_agent = importlib.import_module("agents.claims-intake.agent")
risk_agent = importlib.import_module("agents.risk-assessment.agent")
compliance_agent = importlib.import_module("agents.compliance.agent")

load_dotenv(override=False)

logger = logging.getLogger(__name__)


def _make_audit_entry(stage: str, status: str, result: dict, duration_ms: int = 0) -> dict:
    return {
        "stage": stage,
        "status": status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "duration_ms": duration_ms,
        "result_summary": _summarize_result(stage, result),
    }


def _summarize_result(stage: str, result: dict) -> str:
    if stage == "intake":
        severity = result.get("severity", "unknown")
        valid = result.get("policy_valid", False)
        return f"Policy valid: {valid}, Severity: {severity}"
    elif stage == "risk_assessment":
        score = result.get("risk_score", "?")
        fraud = result.get("fraud_probability", "?")
        return f"Risk score: {score}/10, Fraud probability: {fraud}"
    elif stage == "compliance":
        decision = result.get("decision", "?")
        compliant = result.get("compliant", "?")
        return f"Compliant: {compliant}, Decision: {decision}"
    return str(result)[:200]


def _determine_final_decision(
    claim_input: dict,
    intake_result: dict,
    risk_result: dict,
    compliance_result: dict,
) -> tuple[str, float, str]:
    """Determine the final decision based on all agent results.
    
    Uses DETERMINISTIC rules from rules.py as the authoritative decision,
    combined with LLM agent analysis for reasoning and context.
    
    Returns: (decision, confidence, reasoning)
    """
    # Import rules directly for deterministic decision
    from agents.compliance.rules import evaluate_compliance

    risk_score = risk_result.get("risk_score", 5)
    fraud_prob = risk_result.get("fraud_probability", "medium")
    policy_valid = intake_result.get("policy_valid", True)
    amount = claim_input.get("estimated_amount", 0)

    # Invalid policy → reject
    if not policy_valid:
        return "reject", 0.95, "La póliza no es válida o no está activa."

    # High fraud → reject
    if fraud_prob == "high" and risk_score >= 7:
        return "reject", 0.85, (
            f"Alto riesgo de fraude (probabilidad: {fraud_prob}, "
            f"risk score: {risk_score}/10). Se recomienda investigación."
        )

    # Use DETERMINISTIC rules for the compliance decision
    rules_result = evaluate_compliance(amount, risk_score, fraud_prob)
    deterministic_decision = rules_result["decision"]
    rules_reasons = rules_result["reasons"]

    fraud_label = {"low": "baja", "medium": "media", "high": "alta"}.get(fraud_prob, fraud_prob)
    amount_fmt = f"{amount:,.0f}".replace(",", ".")

    if deterministic_decision == "reject":
        return "reject", 0.90, (
            f"Siniestro rechazado. El análisis combinado de los tres agentes indica "
            f"un nivel de riesgo inaceptable (score {risk_score}/10, probabilidad de "
            f"fraude {fraud_label}). No cumple con los umbrales de aprobación vigentes."
        )

    if deterministic_decision == "human_review":
        # Build a human-readable explanation of WHY it needs review
        review_reasons = []
        applied = rules_result.get("rules_applied", {})
        if applied.get("human_review_threshold") and amount > applied["human_review_threshold"]:
            review_reasons.append(
                f"el monto ({amount_fmt}€) supera el umbral de revisión humana "
                f"obligatoria ({applied['human_review_threshold']:,.0f}€) establecido por la normativa vigente"
            )
        if amount > applied.get("auto_approve_max_amount", float("inf")):
            review_reasons.append(
                f"el monto ({amount_fmt}€) excede el límite de aprobación automática "
                f"({applied['auto_approve_max_amount']:,.0f}€)"
            )
        if risk_score > applied.get("max_risk_score_auto_approve", 10):
            review_reasons.append(
                f"el score de riesgo ({risk_score}/10) supera el máximo permitido "
                f"para aprobación automática"
            )
        if not review_reasons:
            review_reasons = rules_reasons

        return "human_review", 0.80, (
            f"El siniestro requiere revisión humana: {'; '.join(review_reasons)}. "
            f"El equipo de siniestros será notificado para validación manual. "
            f"Risk score: {risk_score}/10 · Probabilidad de fraude: {fraud_label}."
        )

    # All checks passed → approve
    return "approve", 0.90, (
        f"Siniestro aprobado automáticamente tras el análisis de los tres agentes especializados. "
        f"El monto ({amount_fmt}€) está dentro del límite de aprobación automática, "
        f"el score de riesgo es aceptable ({risk_score}/10) y la probabilidad de fraude es {fraud_label}. "
        f"Cumple con todas las regulaciones aplicables (EU Insurance Directive, DGS, EU AI Act)."
    )


async def process_claim(claim_input: dict, progress_callback=None) -> dict:
    """Process a claim through the full multi-agent pipeline.
    
    Args:
        claim_input: Dict with keys: policy_id, customer_id, description,
                     estimated_amount, incident_type
        progress_callback: Optional async callable(stage, status, data) for real-time updates
    
    Returns:
        Complete decision with audit trail
    """
    claim_id = claim_input.get("claim_id", f"CLM-{uuid.uuid4().hex[:8].upper()}")
    claim_input["claim_id"] = claim_id

    audit_trail = []
    start_time = datetime.now(timezone.utc)

    async def notify(stage: str, status: str, data: dict = None):
        if progress_callback:
            await progress_callback(stage, status, data or {})

    # ── Stage 1: Claims Intake ──
    await notify("intake", "processing")
    try:
        t0 = datetime.now(timezone.utc)
        intake_result = await intake_agent.run(claim_input)
        duration = int((datetime.now(timezone.utc) - t0).total_seconds() * 1000)
        audit_trail.append(_make_audit_entry("intake", "completed", intake_result, duration))
        await notify("intake", "completed", intake_result)
        logger.info(f"[{claim_id}] Intake completed in {duration}ms")
    except Exception as e:
        logger.error(f"[{claim_id}] Intake failed: {e}")
        audit_trail.append(_make_audit_entry("intake", "failed", {"error": str(e)}))
        await notify("intake", "failed", {"error": str(e)})
        return _error_response(claim_id, "intake", str(e), audit_trail)

    # ── Stage 2: Risk & Fraud Assessment ──
    await notify("risk_assessment", "processing")
    try:
        t0 = datetime.now(timezone.utc)
        risk_result = await risk_agent.run(claim_input, intake_result)
        duration = int((datetime.now(timezone.utc) - t0).total_seconds() * 1000)
        audit_trail.append(_make_audit_entry("risk_assessment", "completed", risk_result, duration))
        await notify("risk_assessment", "completed", risk_result)
        logger.info(f"[{claim_id}] Risk assessment completed in {duration}ms")
    except Exception as e:
        logger.error(f"[{claim_id}] Risk assessment failed: {e}")
        audit_trail.append(_make_audit_entry("risk_assessment", "failed", {"error": str(e)}))
        await notify("risk_assessment", "failed", {"error": str(e)})
        return _error_response(claim_id, "risk_assessment", str(e), audit_trail)

    # ── Stage 3: Compliance Validation ──
    await notify("compliance", "processing")
    try:
        t0 = datetime.now(timezone.utc)
        compliance_result = await compliance_agent.run(claim_input, intake_result, risk_result)
        duration = int((datetime.now(timezone.utc) - t0).total_seconds() * 1000)
        audit_trail.append(_make_audit_entry("compliance", "completed", compliance_result, duration))
        await notify("compliance", "completed", compliance_result)
        logger.info(f"[{claim_id}] Compliance completed in {duration}ms")
    except Exception as e:
        logger.error(f"[{claim_id}] Compliance failed: {e}")
        audit_trail.append(_make_audit_entry("compliance", "failed", {"error": str(e)}))
        await notify("compliance", "failed", {"error": str(e)})
        return _error_response(claim_id, "compliance", str(e), audit_trail)

    # ── Stage 4: Final Decision ──
    await notify("decision", "processing")
    decision, confidence, reasoning = _determine_final_decision(
        claim_input, intake_result, risk_result, compliance_result
    )
    total_duration = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)

    final_result = {
        "claim_id": claim_id,
        "decision": decision,
        "confidence": confidence,
        "reasoning": reasoning,
        "total_duration_ms": total_duration,
        "intake_result": intake_result,
        "risk_result": risk_result,
        "compliance_result": compliance_result,
        "audit_trail": audit_trail,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "metadata": {
            "agents_used": ["claims-intake", "risk-assessment", "compliance"],
            "model": os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o"),
            "pipeline_version": "1.0.0",
        },
    }

    await notify("decision", "completed", {
        "decision": decision,
        "confidence": confidence,
        "reasoning": reasoning,
    })

    logger.info(f"[{claim_id}] Pipeline completed in {total_duration}ms → {decision}")
    return final_result


def _error_response(claim_id: str, failed_stage: str, error: str, audit_trail: list) -> dict:
    return {
        "claim_id": claim_id,
        "decision": "human_review",
        "confidence": 0.0,
        "reasoning": f"Pipeline error at stage '{failed_stage}': {error}. Routing to human review.",
        "total_duration_ms": 0,
        "intake_result": {},
        "risk_result": {},
        "compliance_result": {},
        "audit_trail": audit_trail,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "error": {"stage": failed_stage, "message": error},
    }
