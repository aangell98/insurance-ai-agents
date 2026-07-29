"""Single compatibility layer for current APIM flags and portable providers."""

from __future__ import annotations

import os


def selected_provider() -> str:
    """Resolve legacy USE_APIM_GATEWAY before choosing the portable provider."""
    requested = os.environ.get("LLM_PROVIDER", "").strip().lower()
    apim_enabled = os.environ.get("USE_APIM_GATEWAY", "false").lower() in {"1", "true", "yes"}
    if apim_enabled and requested in {"", "azure_openai", "azure"}:
        return "azure_apim"
    return requested or "azure_openai"
