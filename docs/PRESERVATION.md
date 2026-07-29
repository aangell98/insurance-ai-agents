# Preservation and redeployment

> Parity runs one API replica because progress WebSockets are process-local.
> Add a shared broker before increasing replica count for high availability.

## Offline public showcase

`cd dashboard; npm ci; npm run build:pages` produces a static, GitHub Pages
artifact. It sets `VITE_OFFLINE_MODE=true`; all claims, token-like progress,
audit entries, incidents, governance data, customer/operator screens, reset,
and replay are deterministic browser fixtures. It makes no API, Azure, or
telemetry request. Normal `npm run build` keeps the existing online transport.

## Local restore

Run `docker compose --profile mock up --build` after building the dashboard.
The mock profile sets `LLM_PROVIDER=mock`, so it needs neither a model nor
credentials. For parity, select `azure_openai`, `azure_apim`, `bedrock`,
`ollama`, or `vllm`; model credentials are injected at runtime, never put in
image layers or Git.

Azure uses `AZURE_AUTH_MODE=managed_identity` (Container Apps) or
`workload_identity` (federated CI/Kubernetes). AWS Bedrock requires
`AWS_ROLE_ARN` and `AWS_WEB_IDENTITY_TOKEN_FILE`. Static keys and
`DefaultAzureCredential` fallback are intentionally unsupported.

`helm template demo helm/insurance-ai-agents -f helm/insurance-ai-agents/values-parity.yaml`
renders the portable profile. Terraform roots are account/region agnostic:
`infra/terraform/azure` and `infra/terraform/aws`; use their example tfvars,
provide a remote state backend outside this repository, then run a reviewed
plan. They do not target observed resources.

## Export and restore

First obtain an authorized Cosmos/application export without extracting keys,
then run:

```powershell
python scripts/export_demo_state.py --input authorized-export.json --output export-2026-07-29
python scripts/restore_demo_state.py export-2026-07-29
```

The manifest is versioned and SHA-256 checked; known secret fields are
redacted. Store exports outside Git, encrypt at rest (for example age, KMS, or
Key Vault-backed storage), retain access logs, and import only using a
data-plane managed/workload identity. Eval artifacts are JSON and can be
included as separate manifest files by the same procedure.

## Azure parity notes

`infra/main.bicep` describes separate customer/operator SWAs, Container Apps
environment and backend identity, ACR, OpenAI/deployments, AI Services,
Content Safety, Cosmos, App Insights/Log Analytics, and APIM API/product/
subscriptions/policy. APIM keeps managed identity before audit, safety, token
limits, backend selection and metrics; its backend forwarding disables response
buffering for streaming. Foundry project and Entra application registration
require tenant-level privileges and are documented in `docs/ENTRA.md`.
