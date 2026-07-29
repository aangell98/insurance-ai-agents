"""Legacy OpenAI SDK adapter with explicit identity and portable routing.

New integrations should use :mod:`agents.shared.llm_provider`; this adapter
keeps the existing tool-calling agents working with Azure OpenAI, APIM, Ollama,
and vLLM while preserving their OpenAI SDK contract.
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from openai import AsyncAzureOpenAI, AsyncOpenAI

from agents.shared.identity import get_azure_credential
from agents.shared.provider_config import selected_provider

_clients: dict[str, Any] = {}


async def get_openai_client(agent_id: str = "orchestrator") -> Any:
    """Return an OpenAI-compatible client without DefaultAzureCredential fallback."""
    cache_key = agent_id.lower().replace("-", "_")
    if cache_key in _clients:
        return _clients[cache_key]
    provider = selected_provider()
    http_client = httpx.AsyncClient(timeout=60)
    if provider in {"ollama", "vllm", "openai_compatible"}:
        base_url = os.environ.get("OPENAI_COMPATIBLE_BASE_URL", "").rstrip("/")
        if not base_url:
            raise RuntimeError("OPENAI_COMPATIBLE_BASE_URL is required for Ollama/vLLM.")
        _clients[cache_key] = AsyncOpenAI(base_url=base_url, api_key=os.environ.get("OPENAI_COMPATIBLE_API_KEY", "local-no-key"), http_client=http_client)
        return _clients[cache_key]
    if provider == "azure_apim":
        gateway = os.environ.get("APIM_GATEWAY_URL", "").rstrip("/")
        key = (
            os.environ.get(f"APIM_SUBSCRIPTION_KEY_{cache_key.upper()}")
            or os.environ.get("APIM_SUBSCRIPTION_KEY", "")
        )
        if not gateway or not key:
            raise RuntimeError("azure_apim requires APIM_GATEWAY_URL and APIM_SUBSCRIPTION_KEY injected by the secret provider.")
        _clients[cache_key] = AsyncAzureOpenAI(
            azure_endpoint=f"{gateway}/openai-gov", api_key="apim-subscription", api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2024-12-01-preview"),
            default_headers={"Ocp-Apim-Subscription-Key": key, "X-Agent-Id": agent_id},
            http_client=http_client,
        )
        return _clients[cache_key]
    if provider != "azure_openai":
        raise RuntimeError("Legacy adapter supports azure_openai, azure_apim, ollama, vllm, and openai_compatible. Use llm_provider for Bedrock.")
    endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT", "").rstrip("/")
    if not endpoint:
        raise RuntimeError("AZURE_OPENAI_ENDPOINT is required for azure_openai.")
    # azure_ad_token_provider is invoked by the SDK as needed, so long-running
    # streams refresh rather than retaining one startup token.
    def token_provider() -> str:
        return get_azure_credential().get_token("https://cognitiveservices.azure.com/.default").token

    _clients[cache_key] = AsyncAzureOpenAI(
        azure_endpoint=endpoint, azure_ad_token_provider=token_provider,
        api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2024-12-01-preview"), http_client=http_client,
    )
    return _clients[cache_key]
