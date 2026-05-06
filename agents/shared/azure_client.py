"""Shared Azure OpenAI client — gets token once at startup via az CLI subprocess."""

import os
import subprocess
import logging
import time
import httpx
from openai import AsyncAzureOpenAI

# Corp network MITMs TLS — for demo we skip verify (endpoint is private Azure).
_http_client = httpx.AsyncClient(verify=False)

logger = logging.getLogger(__name__)

_cached_token: str | None = None
_token_expires: float = 0
_client: AsyncAzureOpenAI | None = None


def _get_token_via_cli() -> str:
    """Get an Azure AD token by calling az CLI synchronously."""
    for az_path in [
        r"C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd",
        "az",
    ]:
        try:
            result = subprocess.run(
                [az_path, "account", "get-access-token",
                 "--resource", "https://cognitiveservices.azure.com",
                 "--query", "accessToken", "-o", "tsv"],
                capture_output=True, text=True, timeout=30,
            )
            if result.returncode == 0 and result.stdout.strip():
                logger.info("Got Azure token via az CLI")
                return result.stdout.strip()
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue

    raise RuntimeError("Could not get Azure token. Run 'az login' first.")


async def get_openai_client() -> AsyncAzureOpenAI:
    """Get a configured AsyncAzureOpenAI client with a cached token."""
    global _cached_token, _token_expires, _client

    if _cached_token is None or time.time() > _token_expires:
        _cached_token = _get_token_via_cli()
        _token_expires = time.time() + 3000
        _client = None  # force new client with fresh token

    if _client is None:
        _client = AsyncAzureOpenAI(
            azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
            azure_ad_token=_cached_token,
            api_version="2024-12-01-preview",
            http_client=_http_client,
        )

    return _client
