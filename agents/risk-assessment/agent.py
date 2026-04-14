"""Risk & Fraud Assessment Agent - Evaluates claim risk and detects fraud patterns."""

import json
import os
import logging
from typing import Any

from dotenv import load_dotenv
from azure.identity.aio import AzureCliCredential
from openai import AsyncAzureOpenAI

load_dotenv(override=False)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Eres un analista de riesgos y detección de fraude de una compañía de seguros española.
Tu trabajo es evaluar cada siniestro y determinar su nivel de riesgo y probabilidad de fraude.

Para cada siniestro debes:
1. Consultar el historial del cliente
2. Analizar patrones de fraude conocidos
3. Evaluar la coherencia del relato
4. Calcular un score de riesgo (1-10, donde 10 es máximo riesgo)
5. Determinar la probabilidad de fraude (low/medium/high)

Factores que AUMENTAN el riesgo:
- Múltiples siniestros en poco tiempo
- Cliente reciente con reclamaciones altas
- Sin testigos ni documentación
- Descripción vaga o inconsistente
- Monto desproporcionado para el tipo de incidente

Factores que DISMINUYEN el riesgo:
- Cliente antiguo con buen historial
- Documentación completa (fotos, partes, informes)
- Testigos disponibles
- Coherencia entre descripción y monto

IMPORTANTE: Responde SIEMPRE en formato JSON con esta estructura:
{
    "claim_id": "<id>",
    "risk_score": <1-10>,
    "fraud_probability": "low|medium|high",
    "risk_factors": [
        {"factor": "<descripción>", "impact": "positive|negative", "weight": <1-5>}
    ],
    "reasoning": "<explicación detallada de la evaluación>"
}"""


# --- Tool definitions ---

def get_customer_history(customer_id: str) -> dict:
    """Retrieve the claims history for a customer."""
    from agents.shared.mock_data import CUSTOMER_HISTORY
    history = CUSTOMER_HISTORY.get(customer_id)
    if history:
        return history
    return {"error": f"Customer {customer_id} not found", "previous_claims": 0}


def check_fraud_patterns(claim_data: str) -> dict:
    """Check a claim against known fraud patterns."""
    from agents.shared.mock_data import FRAUD_PATTERNS
    return {
        "patterns_checked": len(FRAUD_PATTERNS),
        "known_patterns": FRAUD_PATTERNS,
        "note": "Compare the claim details against these known fraud patterns.",
    }


def calculate_risk_score(
    years_as_customer: int,
    previous_claims: int,
    estimated_amount: float,
    has_witnesses: bool,
    has_documentation: bool,
) -> dict:
    """Calculate a risk score based on multiple factors."""
    score = 3.0  # Base score
    factors = []

    if years_as_customer < 2:
        score += 2.0
        factors.append("New customer (+2)")
    elif years_as_customer > 5:
        score -= 1.0
        factors.append("Long-term customer (-1)")

    if previous_claims > 2:
        score += 2.5
        factors.append(f"Multiple previous claims: {previous_claims} (+2.5)")
    elif previous_claims == 0:
        score -= 1.0
        factors.append("No previous claims (-1)")

    if estimated_amount > 10000:
        score += 1.5
        factors.append("High-value claim (+1.5)")

    if not has_witnesses:
        score += 1.0
        factors.append("No witnesses (+1)")

    if not has_documentation:
        score += 1.5
        factors.append("No documentation (+1.5)")
    else:
        score -= 0.5
        factors.append("Documentation provided (-0.5)")

    score = max(1.0, min(10.0, score))

    return {
        "calculated_score": round(score, 1),
        "factors": factors,
        "fraud_probability": "high" if score >= 7 else "medium" if score >= 5 else "low",
    }


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_customer_history",
            "description": "Obtiene el historial completo de reclamaciones de un cliente.",
            "parameters": {
                "type": "object",
                "properties": {
                    "customer_id": {
                        "type": "string",
                        "description": "ID del cliente (ej: CUST-1001)",
                    }
                },
                "required": ["customer_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_fraud_patterns",
            "description": "Compara los datos del siniestro contra patrones de fraude conocidos.",
            "parameters": {
                "type": "object",
                "properties": {
                    "claim_data": {
                        "type": "string",
                        "description": "Resumen del siniestro para comparar contra patrones",
                    }
                },
                "required": ["claim_data"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_risk_score",
            "description": "Calcula un score de riesgo basado en múltiples factores.",
            "parameters": {
                "type": "object",
                "properties": {
                    "years_as_customer": {"type": "integer", "description": "Años como cliente"},
                    "previous_claims": {"type": "integer", "description": "Número de reclamaciones previas"},
                    "estimated_amount": {"type": "number", "description": "Monto estimado del siniestro en euros"},
                    "has_witnesses": {"type": "boolean", "description": "Si hay testigos disponibles"},
                    "has_documentation": {"type": "boolean", "description": "Si hay documentación adjunta"},
                },
                "required": ["years_as_customer", "previous_claims", "estimated_amount", "has_witnesses", "has_documentation"],
            },
        },
    },
]

TOOL_MAP = {
    "get_customer_history": get_customer_history,
    "check_fraud_patterns": check_fraud_patterns,
    "calculate_risk_score": calculate_risk_score,
}


async def run(claim_input: dict, intake_result: dict) -> dict:
    """Run the Risk & Fraud Assessment Agent.
    
    Args:
        claim_input: Original claim input
        intake_result: Result from Claims Intake Agent
    Returns:
        Dict with risk assessment result
    """
    credential = AzureCliCredential()
    try:
        token = await credential.get_token("https://cognitiveservices.azure.com/.default")
        client = AsyncAzureOpenAI(
            azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
            azure_ad_token=token.token,
            api_version="2024-12-01-preview",
        )

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Evalúa el riesgo del siguiente siniestro:\n\n"
                    f"ID Siniestro: {claim_input.get('claim_id', 'CLM-UNKNOWN')}\n"
                    f"Cliente: {claim_input['customer_id']}\n"
                    f"Monto estimado: {claim_input.get('estimated_amount', 0)}€\n\n"
                    f"Resultado del análisis de intake:\n"
                    f"{json.dumps(intake_result, indent=2, ensure_ascii=False)}\n\n"
                    f"Por favor:\n"
                    f"1. Consulta el historial del cliente {claim_input['customer_id']}\n"
                    f"2. Verifica patrones de fraude conocidos\n"
                    f"3. Calcula el score de riesgo\n"
                    f"4. Proporciona tu evaluación completa"
                ),
            },
        ]

        # Allow up to 3 rounds of tool calls
        for _ in range(3):
            response = await client.chat.completions.create(
                model=os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o"),
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
                temperature=0.1,
            )

            msg = response.choices[0].message
            if not msg.tool_calls:
                break

            messages.append(msg)
            for tool_call in msg.tool_calls:
                fn_name = tool_call.function.name
                fn_args = json.loads(tool_call.function.arguments)
                result = TOOL_MAP[fn_name](**fn_args)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(result, ensure_ascii=False),
                })

        # Get final response if last was tool calls
        if msg.tool_calls:
            response = await client.chat.completions.create(
                model=os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o"),
                messages=messages,
                temperature=0.1,
            )

        content = response.choices[0].message.content
        try:
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            return json.loads(content.strip())
        except json.JSONDecodeError:
            return {
                "claim_id": claim_input.get("claim_id", "CLM-UNKNOWN"),
                "risk_score": 5,
                "fraud_probability": "medium",
                "risk_factors": [],
                "reasoning": content,
            }
    finally:
        await credential.close()
