"""Explicit workload identity selection; never falls back to developer credentials."""

from __future__ import annotations

import os


def get_azure_credential():
    """Return only the credential type selected by AZURE_AUTH_MODE.

    Production callers must set ``managed_identity`` (Container Apps/AKS) or
    ``workload_identity`` (federated CI/Kubernetes). Local mock mode needs no
    Azure credential and must not silently borrow an Azure CLI login.
    """
    mode = os.environ.get("AZURE_AUTH_MODE", "managed_identity").lower()
    if mode == "managed_identity":
        from azure.identity import ManagedIdentityCredential
        return ManagedIdentityCredential(client_id=os.environ.get("AZURE_CLIENT_ID") or None)
    if mode == "workload_identity":
        from azure.identity import WorkloadIdentityCredential
        required = ("AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_FEDERATED_TOKEN_FILE")
        missing = [name for name in required if not os.environ.get(name)]
        if missing:
            raise RuntimeError(f"workload_identity requires {', '.join(missing)}")
        return WorkloadIdentityCredential(
            tenant_id=os.environ["AZURE_TENANT_ID"],
            client_id=os.environ["AZURE_CLIENT_ID"],
            token_file_path=os.environ["AZURE_FEDERATED_TOKEN_FILE"],
        )
    if mode == "azure_cli":
        # Explicit local/CI mode. azure/login establishes this credential in
        # GitHub Actions; it is never selected implicitly.
        from azure.identity import AzureCliCredential
        return AzureCliCredential()
    raise RuntimeError("AZURE_AUTH_MODE must be managed_identity, workload_identity, or azure_cli; DefaultAzureCredential is intentionally unsupported.")
