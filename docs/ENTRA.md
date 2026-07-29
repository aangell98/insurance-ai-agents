# Entra application registration

No registration is created by this repository or by Bicep. A tenant
administrator must create an API registration, expose `access_as_user`, create
the dashboard SPA redirect URIs, and assign `Customer.Submit` and
`Operator.Review` app roles. Record only IDs in deployment variables; keep
certificates/federated credentials in the identity platform.

For GitHub Actions or Kubernetes, add a federated credential to a
user-assigned managed identity and set `AZURE_AUTH_MODE=workload_identity`,
`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, and `AZURE_FEDERATED_TOKEN_FILE`. The
identity needs Cognitive Services OpenAI User and Cosmos DB Built-in Data
Contributor data-plane access. APIM's own system identity needs Cognitive
Services OpenAI User and Content Safety access. Do not substitute client
secrets or developer CLI credentials.
