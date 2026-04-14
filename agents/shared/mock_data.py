"""Mock data for the insurance claims demo.
Simulates external systems (policy DB, customer history, fraud patterns)."""

POLICIES = {
    "POL-2024-001": {
        "policy_id": "POL-2024-001",
        "customer_id": "CUST-1001",
        "customer_name": "María García López",
        "vehicle": "Seat León 2021",
        "coverage_type": "Todo Riesgo",
        "status": "active",
        "start_date": "2024-01-15",
        "end_date": "2025-01-15",
        "max_coverage": 50000,
    },
    "POL-2024-002": {
        "policy_id": "POL-2024-002",
        "customer_id": "CUST-1002",
        "customer_name": "Carlos Ruiz Martínez",
        "vehicle": "BMW Serie 3 2022",
        "coverage_type": "Terceros Ampliado",
        "status": "active",
        "start_date": "2024-03-01",
        "end_date": "2025-03-01",
        "max_coverage": 30000,
    },
    "POL-2024-003": {
        "policy_id": "POL-2024-003",
        "customer_id": "CUST-1003",
        "customer_name": "Ana Fernández Díaz",
        "vehicle": "Tesla Model 3 2023",
        "coverage_type": "Todo Riesgo",
        "status": "active",
        "start_date": "2024-06-01",
        "end_date": "2025-06-01",
        "max_coverage": 80000,
    },
}

CUSTOMER_HISTORY = {
    "CUST-1001": {
        "customer_id": "CUST-1001",
        "name": "María García López",
        "years_as_customer": 5,
        "previous_claims": 1,
        "previous_claims_details": [
            {"year": 2022, "type": "minor_collision", "amount": 1200, "status": "approved"}
        ],
        "risk_profile": "low",
        "payment_history": "excellent",
    },
    "CUST-1002": {
        "customer_id": "CUST-1002",
        "name": "Carlos Ruiz Martínez",
        "years_as_customer": 1,
        "previous_claims": 3,
        "previous_claims_details": [
            {"year": 2024, "type": "theft", "amount": 8000, "status": "approved"},
            {"year": 2024, "type": "collision", "amount": 5000, "status": "approved"},
            {"year": 2024, "type": "vandalism", "amount": 3000, "status": "under_review"},
        ],
        "risk_profile": "high",
        "payment_history": "irregular",
    },
    "CUST-1003": {
        "customer_id": "CUST-1003",
        "name": "Ana Fernández Díaz",
        "years_as_customer": 3,
        "previous_claims": 0,
        "previous_claims_details": [],
        "risk_profile": "low",
        "payment_history": "excellent",
    },
}

FRAUD_PATTERNS = [
    {
        "pattern_id": "FP-001",
        "name": "Multiple claims in short period",
        "description": "More than 2 claims within 12 months",
        "severity": "high",
    },
    {
        "pattern_id": "FP-002",
        "name": "New customer high-value claim",
        "description": "Customer with less than 2 years filing claim > 5000€",
        "severity": "medium",
    },
    {
        "pattern_id": "FP-003",
        "name": "Inconsistent damage description",
        "description": "Claimed damage does not match incident type or estimated amount is disproportionate",
        "severity": "high",
    },
    {
        "pattern_id": "FP-004",
        "name": "Weekend/holiday incident",
        "description": "Incident reported during weekend or holiday with no witnesses",
        "severity": "low",
    },
]

# Pre-built demo scenarios for the presentation
DEMO_SCENARIOS = {
    "low_risk": {
        "policy_id": "POL-2024-001",
        "customer_id": "CUST-1001",
        "description": (
            "El pasado viernes 10 de enero, mientras circulaba por la M-30 en Madrid "
            "a la altura de la salida de Méndez Álvaro, un vehículo que circulaba detrás "
            "de mí no frenó a tiempo y colisionó con la parte trasera de mi Seat León. "
            "El impacto causó daños en el parachoques trasero y la puerta del maletero. "
            "Hay parte amistoso firmado por ambos conductores. Taller ha estimado la "
            "reparación en aproximadamente 2.500€."
        ),
        "estimated_amount": 2500,
        "incident_type": "collision",
        "expected_decision": "approve",
    },
    "high_amount": {
        "policy_id": "POL-2024-003",
        "customer_id": "CUST-1003",
        "description": (
            "El día 5 de enero, durante la tormenta que afectó a la Comunidad de Madrid, "
            "un árbol cayó sobre mi Tesla Model 3 que estaba estacionado en la calle Serrano. "
            "El vehículo sufrió daños severos en el techo panorámico, capó delantero y "
            "parabrisas. El taller oficial Tesla ha estimado los daños en 15.000€. "
            "Adjunto fotos del incidente y el informe del servicio de emergencias."
        ),
        "estimated_amount": 15000,
        "incident_type": "natural_disaster",
        "expected_decision": "approve",
    },
    "fraudulent": {
        "policy_id": "POL-2024-002",
        "customer_id": "CUST-1002",
        "description": (
            "Reporto que mi BMW Serie 3 fue robado durante la noche del sábado pasado "
            "mientras estaba aparcado en una zona residencial sin cámaras. No hay testigos. "
            "El vehículo tiene solo 6 meses y estaba completamente equipado. "
            "Solicito la indemnización completa del valor del vehículo: 8.500€."
        ),
        "estimated_amount": 8500,
        "incident_type": "theft",
        "expected_decision": "human_review",
    },
}
