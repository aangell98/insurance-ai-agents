"""Provider-neutral LLM interface for Azure OpenAI, Bedrock, and OpenAI-compatible endpoints."""

from __future__ import annotations

import asyncio
import os
from typing import Any, Protocol

import httpx

from agents.shared.identity import get_azure_credential
from agents.shared.provider_config import selected_provider


class LLMProvider(Protocol):
    async def complete(self, messages: list[dict[str, Any]], *, model: str, temperature: float = 0.1) -> str: ...


class AzureOpenAIProvider:
    async def complete(self, messages: list[dict[str, Any]], *, model: str, temperature: float = 0.1) -> str:
        from openai import AsyncAzureOpenAI
        endpoint = os.environ["AZURE_OPENAI_ENDPOINT"]
        client = AsyncAzureOpenAI(
            azure_endpoint=endpoint,
            azure_ad_token_provider=lambda: get_azure_credential().get_token("https://cognitiveservices.azure.com/.default").token,
            api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2024-12-01-preview"),
        )
        response = await client.chat.completions.create(model=model, messages=messages, temperature=temperature)
        return response.choices[0].message.content or ""


class ApimOpenAIProvider:
    """OpenAI-compatible adapter that always traverses the governed APIM API."""
    async def complete(self, messages: list[dict[str, Any]], *, model: str, temperature: float = 0.1) -> str:
        from openai import AsyncAzureOpenAI
        gateway = os.environ.get("APIM_GATEWAY_URL", "").rstrip("/")
        subscription_key = os.environ.get("APIM_SUBSCRIPTION_KEY", "")
        if not gateway or not subscription_key:
            raise RuntimeError("azure_apim requires APIM_GATEWAY_URL and APIM_SUBSCRIPTION_KEY.")
        client = AsyncAzureOpenAI(
            azure_endpoint=f"{gateway}/openai-gov",
            api_key="apim-subscription",
            api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2024-12-01-preview"),
            default_headers={
                "Ocp-Apim-Subscription-Key": subscription_key,
                "X-Agent-Id": os.environ.get("AGENT_ID", "unknown"),
            },
        )
        response = await client.chat.completions.create(model=model, messages=messages, temperature=temperature)
        return response.choices[0].message.content or ""


class OpenAICompatibleProvider:
    async def complete(self, messages: list[dict[str, Any]], *, model: str, temperature: float = 0.1) -> str:
        from openai import AsyncOpenAI
        base_url = os.environ["OPENAI_COMPATIBLE_BASE_URL"]
        client = AsyncOpenAI(base_url=base_url, api_key=os.environ.get("OPENAI_COMPATIBLE_API_KEY", "local-no-key"))
        response = await client.chat.completions.create(model=model, messages=messages, temperature=temperature)
        return response.choices[0].message.content or ""


class BedrockProvider:
    async def complete(self, messages: list[dict[str, Any]], *, model: str, temperature: float = 0.1) -> str:
        """Use only AWS web identity; static AWS keys are deliberately rejected."""
        if os.environ.get("AWS_ACCESS_KEY_ID") or os.environ.get("AWS_SECRET_ACCESS_KEY"):
            raise RuntimeError("bedrock rejects static AWS credentials; use AWS_ROLE_ARN and AWS_WEB_IDENTITY_TOKEN_FILE.")
        web_identity = os.environ.get("AWS_ROLE_ARN") and os.environ.get("AWS_WEB_IDENTITY_TOKEN_FILE")
        task_role = os.environ.get("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI")
        if not (web_identity or task_role):
            raise RuntimeError("bedrock requires AWS web identity or an ECS task-role credential endpoint.")
        try:
            import boto3
        except ImportError as error:
            raise RuntimeError("Install boto3 to use LLM_PROVIDER=bedrock.") from error
        region = os.environ["AWS_REGION"]
        prompt = "\n".join(f"{message['role']}: {message['content']}" for message in messages)
        client = boto3.client("bedrock-runtime", region_name=region)
        response = await asyncio.to_thread(client.converse, modelId=model, messages=[{"role": "user", "content": [{"text": prompt}]}], inferenceConfig={"temperature": temperature})
        return response["output"]["message"]["content"][0]["text"]


def get_llm_provider() -> LLMProvider:
    provider = selected_provider()
    if provider == "azure_openai":
        return AzureOpenAIProvider()
    if provider == "azure_apim":
        return ApimOpenAIProvider()
    if provider in {"ollama", "vllm", "openai_compatible"}:
        return OpenAICompatibleProvider()
    if provider == "bedrock":
        return BedrockProvider()
    raise RuntimeError(f"Unsupported LLM_PROVIDER={provider!r}; use azure_openai, bedrock, ollama, vllm, or mock.")
