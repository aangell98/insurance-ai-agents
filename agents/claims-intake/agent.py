"""Claims Intake Agent - Analyzes and structures incoming insurance claims."""

import json
import os
import logging
from typing import Any

from dotenv import load_dotenv
from azure.identity.aio import AzureCliCredential
from openai import AsyncAzureOpenAI

load_dotenv(override=False)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Eres un analista de siniestros de una compañía de seguros española.
Tu trabajo es recibir un reporte de siniestro y extraer información estructurada.

Para cada siniestro debes:
1. Identificar el tipo de incidente (colisión, robo, incendio, desastre natural, vandalismo, otro)
2. Extraer datos clave: vehículo afectado, fecha, ubicación, daños descritos
3. Verificar que la póliza proporcionada es válida
4. Clasificar la severidad del siniestro (baja, media, alta)
5. Generar un resumen ejecutivo

IMPORTANTE: Responde SIEMPRE en formato JSON con esta estructura:
{
    "claim_id": "<id>",
    "policy_valid": true/false,
    "severity": "low|medium|high",
    "extracted_data": {
        "incident_type": "<tipo>",
        "vehicle": "<vehículo>",
        "date_of_incident": "<fecha>",
        "location": "<ubicación>",
        "damages_described": "<descripción de daños>",
        "estimated_amount": <monto>,
        "witnesses": true/false,
        "documentation_provided": ["<docs>"]
    },
    "summary": "<resumen ejecutivo en 2-3 frases>"
}"""


# --- Tool definitions ---

def verify_policy(policy_id: str) -> dict:
    """Verify that an insurance policy exists and is active."""
    from agents.shared.mock_data import POLICIES
    policy = POLICIES.get(policy_id)
    if policy:
        return {"valid": True, "policy": policy}
    return {"valid": False, "error": f"Policy {policy_id} not found"}


def extract_claim_data(description: str) -> dict:
    """Extract structured data from a free-text claim description."""
    return {
        "raw_description": description,
        "char_count": len(description),
        "has_amount": any(c.isdigit() for c in description),
    }


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "verify_policy",
            "description": "Verifica que una póliza de seguro existe y está activa en el sistema.",
            "parameters": {
                "type": "object",
                "properties": {
                    "policy_id": {
                        "type": "string",
                        "description": "El identificador de la póliza (ej: POL-2024-001)",
                    }
                },
                "required": ["policy_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "extract_claim_data",
            "description": "Extrae datos estructurados de la descripción libre del siniestro.",
            "parameters": {
                "type": "object",
                "properties": {
                    "description": {
                        "type": "string",
                        "description": "La descripción del siniestro proporcionada por el cliente",
                    }
                },
                "required": ["description"],
            },
        },
    },
]

TOOL_MAP = {
    "verify_policy": verify_policy,
    "extract_claim_data": extract_claim_data,
}


async def run(claim_input: dict) -> dict:
    """Run the Claims Intake Agent on a claim input.
    
    Args:
        claim_input: Dict with keys: policy_id, customer_id, description, 
                     estimated_amount, incident_type, claim_id
    Returns:
        Dict with intake analysis result
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
                    f"Analiza el siguiente siniestro:\n\n"
                    f"ID Siniestro: {claim_input.get('claim_id', 'CLM-UNKNOWN')}\n"
                    f"Póliza: {claim_input['policy_id']}\n"
                    f"Cliente: {claim_input['customer_id']}\n"
                    f"Tipo de incidente: {claim_input.get('incident_type', 'unknown')}\n"
                    f"Monto estimado: {claim_input.get('estimated_amount', 0)}€\n\n"
                    f"Descripción del cliente:\n{claim_input['description']}\n\n"
                    f"Por favor, verifica la póliza y extrae los datos del siniestro."
                ),
            },
        ]

        response = await client.chat.completions.create(
            model=os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o"),
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            temperature=0.1,
        )

        # Process tool calls if any
        msg = response.choices[0].message
        if msg.tool_calls:
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

            response = await client.chat.completions.create(
                model=os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o"),
                messages=messages,
                temperature=0.1,
            )

        content = response.choices[0].message.content
        # Parse JSON from response
        try:
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            return json.loads(content.strip())
        except json.JSONDecodeError:
            return {
                "claim_id": claim_input.get("claim_id", "CLM-UNKNOWN"),
                "policy_valid": True,
                "severity": "medium",
                "extracted_data": {},
                "summary": content,
            }
    finally:
        await credential.close()
