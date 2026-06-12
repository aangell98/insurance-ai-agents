# Verificación visual — Insurance AI Agents (Gobernanza + APIM)

Esta guía explica **dónde mirar** para comprobar visualmente que el pipeline
de gobernanza funciona, tanto en GitHub como en Azure (APIM).

---

## 1. GitHub — PR con Eval Gate verde ✅

### 1.1 Pull Request
- **URL:** https://github.com/aangell98/insurance-ai-agents/pull/2
- **Branch:** `feat/governance-and-apim-gateway` → `main`
- **Estado:** OPEN · MERGEABLE · 6 commits

### 1.2 Workflow “Eval Gate”
- **Run exitosa:** https://github.com/aangell98/insurance-ai-agents/actions/runs/25427813684
- Pestaña **Checks** del PR → debe mostrarse:
  ```
  ✓ Eval Gate / Run golden-dataset evals against the multi-agent pipeline
  ```
- Lo que ejecuta:
  1. Login en Azure vía **OIDC federado** (sin secretos de larga duración).
  2. Instala `backend/requirements.txt`.
  3. Lanza `python -m evals.run_evals` contra `evals/golden_dataset.json`.
  4. Sube el JSON como artefacto y publica un comentario en el PR.

### 1.3 Comentario automático en el PR
GitHub Actions deja un comentario con el resultado de los 4 casos:

```
🧪 Eval Gate — 4/4 cases passed (100%)

Pipeline: 1.0.0 · Model: gpt-4o · APIM: false

| ✅ | low_risk_collision           | approve | 0.9  | risk 2 |
| ✅ | high_amount_natural_disaster | approve | 0.9  | risk 5 |
| ✅ | high_risk_theft_no_witnesses | reject  | 0.85 | risk 8 |
| ✅ | prompt_injection_attack      | reject  | 0.99 | risk 9 | 🛡 |
```

### 1.4 OIDC / identidad federada
- App registration: `github-oidc-insurance-ai-evals`
- AppId: `4e593597-088c-404c-984c-203259ff7dbe`
- Tenant: `763b21d6-9a2e-4d90-88f9-d3c5cc8dba90`
- Federated credentials creadas para:
  - `repo:aangell98/insurance-ai-agents:pull_request`
  - `repo:aangell98/insurance-ai-agents:ref:refs/heads/main`
  - `repo:aangell98/insurance-ai-agents:environment:production`
- Secretos en GitHub (Settings → Secrets and variables → Actions):
  `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
- Variables: `AZURE_OPENAI_ENDPOINT`, `USE_APIM_GATEWAY=false`
- Environment GitHub: `production` (creado).
- RBAC: SP tiene rol **Cognitive Services User** sobre
  `ins-ai-demo-aoai-jii435hjlwyyc`.

### 1.5 CODEOWNERS
- `.github/CODEOWNERS` enruta cada path a `@aangell98` para la demo.
- En producción se sustituye por equipos reales (`@org/platform-team`, etc.).

---

## 2. Dashboard local — pestaña Gobernanza

Backend: `http://127.0.0.1:8000` · Dashboard: `http://localhost:5173`.

1. Abrir el dashboard → pestaña **Gobernanza** (icono Award).
2. Se muestra:
   - Hero card morada con descripción del pipeline.
   - 3 KPIs: APIM Gateway, Eval Gate, Modelo.
   - Lista de **políticas APIM activas** (managed-identity, content-safety,
     token-limit, audit, emit-token-metric, on-error).
   - Pass rate de la última corrida de evals.
   - Tabla parseada de **CODEOWNERS**.
   - Grid de **process checks** (PR template, deploy workflow, IaC, etc.).
3. Endpoint en vivo: `GET /api/governance/status`.

---

## 3. Azure / APIM — desplegado y verificable ahora ✅

> ✅ Deployment `apim-governance-deploy` completado (Succeeded).
> Recursos hijos creados sobre el APIM existente
> `ins-ai-demo-apim-jii435hjlwyyc` (SKU StandardV2).

### 3.1 Portal de Azure
Resource Group: `rg-insurance-ai-demo` → recurso APIM
`ins-ai-demo-apim-jii435hjlwyyc`.

### 3.2 Verificar la API y las políticas
1. APIM → **APIs** → `Azure OpenAI (governed)` (path `openai-gov`).
2. Operación `openai-passthrough` (POST `/*`).
3. Pestaña **Policies** → debe verse el XML de
   `infra/apim-policy.xml` cargado (managed-identity, content-safety,
   token-limit, etc.).
4. Pestaña **Test** → enviar un POST a
   `/openai-gov/deployments/gpt-4o/chat/completions?api-version=2024-12-01-preview`
   con `Ocp-Apim-Subscription-Key` y `X-Agent-Id: claims-intake` →
   se verá la respuesta y la traza de las políticas ejecutadas.

> ℹ️ El path es `openai-gov` (no `openai`) para no colisionar con la
> API legacy `azure-openai-api` ya existente en el servicio.

### 3.3 Subscriptions (claves por agente)
- APIM → **Subscriptions** → 3 activas (scope = product `insurance-agents`):
  - `sub-claims-intake` — *Claims Intake Agent*
  - `sub-risk-assessment` — *Risk & Fraud Agent*
  - `sub-compliance` — *Compliance Agent*
- Recuperar la clave (REST, vía `az rest`):
  ```powershell
  az rest --method post `
    --url "https://management.azure.com/subscriptions/<SUBID>/resourceGroups/rg-insurance-ai-demo/providers/Microsoft.ApiManagement/service/ins-ai-demo-apim-jii435hjlwyyc/subscriptions/sub-claims-intake/listSecrets?api-version=2023-09-01-preview" `
    --query primaryKey -o tsv
  ```

### 3.4 Métricas y telemetría
1. APIM → **Metrics** → ver “Total Requests”, “Successful Requests”,
   “Capacity”, “Failed Requests”.
2. APIM → **APIs** → `Azure OpenAI (governed)` → **Diagnose and solve
   problems** → trazas con los `<trace>` del policy (audit + correlation
   ID).
3. **Application Insights** vinculado:
   ```
   customMetrics
   | where name has "Tokens"
   | summarize sum(value) by name, bin(timestamp, 5m)
   ```
   muestra los tokens emitidos por `azure-openai-emit-token-metric`.

### 3.5 Switch en el cliente
- Cliente Python (`agents/shared/azure_client.py`) detecta
  `USE_APIM_GATEWAY=true` → enruta por APIM con
  `Ocp-Apim-Subscription-Key` + `X-Agent-Id`.
- Si `USE_APIM_GATEWAY=false` (modo local actual y CI), usa
  `DefaultAzureCredential` → AAD token directo a Azure OpenAI.

---

## 4. Resumen ejecutivo

| Pieza                           | Dónde verificarlo                                    | Estado    |
|---------------------------------|------------------------------------------------------|-----------|
| Eval Gate verde en PR           | PR #2 → Checks                                       | ✅ Verde  |
| Comentario automático con tabla | PR #2 → Conversation                                 | ✅ OK     |
| OIDC GitHub ↔ Azure             | Sin secretos largos; federated credentials          | ✅ OK     |
| CODEOWNERS                      | `.github/CODEOWNERS`                                 | ✅ OK     |
| IaC APIM + políticas            | `infra/main.bicep` + `infra/apim-policy.xml`         | ✅ Bicep validado |
| APIM en Azure (deployed)        | `rg-insurance-ai-demo` → API `azure-openai` + product `insurance-agents` + 3 subs | ✅ Desplegado |
| Dashboard Gobernanza            | http://localhost:5173 → tab Gobernanza               | ✅ OK     |
