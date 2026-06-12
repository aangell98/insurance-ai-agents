# Insurance Claims Orchestrator — Foundry Hosted Agent

Runs the existing multi-agent pipeline (**Intake → Risk & Fraud → Compliance → Decision**,
Microsoft Agent Framework `SequentialBuilder` with automatic fallback to the legacy
orchestrator) as an **Azure AI Foundry hosted agent** over the `invocations` protocol.

It is a thin hosting wrapper around `agents/orchestrator/agent.py::process_claim` — the same
agent instructions, tools, response schemas, compliance rules and deterministic
prompt-injection guard are reused unchanged. The React dashboard and FastAPI backend are
**not** modified: the backend can call this agent and re-emit progress over its existing
WebSocket.

## Endpoint contract — `POST /invocations` (port 8088)

```jsonc
// request
{
  "claim": {
    "policy_id": "POL-1001",
    "customer_id": "CUST-001",
    "incident_type": "collision",
    "description": "Colisión leve en parking, paragolpes rayado. Hay un testigo.",
    "estimated_amount": 1200,
    "image_b64": "<optional>"
  },
  "stream": false
}
```

- `stream: false` → JSON response: the full decision object
  (`decision`, `confidence`, `reasoning`, `intake_result`, `risk_result`,
  `compliance_result`, `audit_trail`, `security_flagged`, …).
- `stream: true` → Server-Sent Events: one `progress` event per pipeline stage
  (`processing` / `token` / `completed`), then a final `result` event. Mirrors the backend
  WebSocket so the dashboard's real-time view is preserved.

Claim fields may also be passed at the top level instead of nested under `claim`.

## Run locally

```powershell
cd agents/hosted
Copy-Item .env.example .env   # then edit values
py -3.12 -m venv .venv ; .\.venv\Scripts\Activate.ps1   # 3.10–3.14 all supported
pip install -r requirements.txt
# from the REPO ROOT so `agents.*` imports resolve:
cd ..\..
.\agents\hosted\.venv\Scripts\python.exe agents\hosted\app.py
```

Smoke test (another shell):

```powershell
curl -X POST http://localhost:8088/invocations -H "Content-Type: application/json" `
  -d '{"claim":{"policy_id":"POL-1001","customer_id":"CUST-001","incident_type":"collision","description":"Colision leve en parking, hay testigo.","estimated_amount":1200}}'
```

> Without Azure credentials you may get auth errors from the model — that is expected.
> The key local check is that the server starts and `/invocations` accepts the request.

## Versioning note

The Foundry hosting adapter requires `agent-framework-core>=1.8.1`, so `requirements.txt`
here is newer than `backend/requirements.txt` (which pins 1.4.x). `maf_agent.py::_build_workflow`
is written to work on **both** lines (`intermediate_output_from="all"` with a 1.4.x fallback),
so the backend is unaffected.

## Deployed to Foundry ✅ (direct-code, no Docker/ACR)

This agent is deployed on **Azure AI Foundry Agent Service** via *direct-code deployment*:
the source is uploaded as a zip and Foundry **remote-builds** it from `requirements.txt`
(`python_3_14`). No Docker image or ACR is involved.

| | |
|---|---|
| Project | `insurance-agents` (under account `ins-ai-demo-ais-jii435hjlwyyc`, swedencentral) |
| Project endpoint | `https://ins-ai-demo-ais-jii435hjlwyyc.services.ai.azure.com/api/projects/insurance-agents` |
| Agent | `insurance-claims-orchestrator` (protocol `invocations` 1.0.0) |
| Model | `gpt-5.4-mini` on `ins-ai-demo-aoai-jii435hjlwyyc` (agent's managed identity has `Cognitive Services OpenAI User`) |
| Portal | https://ai.azure.com → project **insurance-agents** → Agents |

### Redeploy (after code changes)

```powershell
# Creates the agent if missing, else adds a new active version. Builds the zip,
# uploads via the Foundry direct-code REST API, polls until active.
./agents/hosted/scripts/deploy.ps1
```

The committed deployment descriptor is [`.foundry/direct-code/metadata.json`](.foundry/direct-code/metadata.json);
the zip is rebuilt from source by [`scripts/build_package.py`](scripts/build_package.py).

### Invoke the deployed agent

Invocations route: `{projectEndpoint}/agents/{agentName}/endpoint/protocols/invocations`.
Auth is Entra: get a token for `https://ai.azure.com`. Send the claim as the raw body.

```powershell
$ep  = "https://ins-ai-demo-ais-jii435hjlwyyc.services.ai.azure.com/api/projects/insurance-agents/agents/insurance-claims-orchestrator/endpoint/protocols/invocations"
$tok = az account get-access-token --resource https://ai.azure.com --query accessToken -o tsv
$body = '{"claim":{"policy_id":"POL-1001","customer_id":"CUST-001","incident_type":"collision","description":"Colision leve en parking, hay un testigo.","estimated_amount":1200},"stream":false}'
# non-stream → full decision JSON
curl.exe -s -X POST "$ep?api-version=2025-11-15-preview&agent_session_id=demo-session-1" -H "Authorization: Bearer $tok" -H "Content-Type: application/json" --data $body
# real-time stages → set "stream":true and use curl.exe -N to see the SSE progress events
```

The backend can call this endpoint and re-emit the `progress`/`result` events over its
existing WebSocket, so the React dashboard keeps its live multi-agent view unchanged.

### Cost & cleanup

Hosted-agent compute spins up per session and deprovisions when idle. To stop all costs:
delete the agent (`DELETE {projectEndpoint}/agents/insurance-claims-orchestrator?api-version=2025-11-15-preview`)
or the project (`az cognitiveservices account project delete -n ins-ai-demo-ais-jii435hjlwyyc -g rg-insurance-ai-demo --project-name insurance-agents`).

### Multi-brand parity (white-label / Helix and Santander)

Both brands are the **same app**, differentiated only by branding. The claims pipeline is
**brand-agnostic** — `BRAND_NAME` (`agents/shared/brand.py`) is read *only* by the voice and
content-understanding agents, **not** by the orchestrator/intake/risk/compliance pipeline.
So the parity rule with Foundry is simple:

> **Both brand backends call the one shared `insurance-claims-orchestrator` agent.**
> Behavior is identical *by construction* (one agent, one version, one model); branding
> stays 100% in the frontend (`dashboard/src/brand.ts`).

This is *stronger* parity than running a separate orchestrator copy per backend (no drift).
It is wired through a non-breaking dispatch flag in `agents/orchestrator/agent.py`
(mirrors `USE_MAF_ORCHESTRATOR`): set these identically on **both** backends —

```
USE_FOUNDRY_AGENT=true
FOUNDRY_AGENT_ENDPOINT=https://ins-ai-demo-ais-jii435hjlwyyc.services.ai.azure.com/api/projects/insurance-agents/agents/insurance-claims-orchestrator/endpoint/protocols/invocations
```

`process_claim` then routes to the deployed agent (`agents/orchestrator/foundry_client.py`,
streaming the same `progress_callback` stages → the dashboard WebSocket is unchanged), and
falls back to the in-process orchestrator on any error. The backend's managed identity needs
`Azure AI User` on the Foundry project. Leave the flag unset to keep the current in-process behavior.

> Voice / content-understanding agents *are* brand-coupled. If/when they move to Foundry,
> deploy one per brand with a distinct `BRAND_NAME`, or pass the brand per request.

### Tracing (App Insights) — working via the backend

Traces are exported to `ins-ai-demo-ai-jii435hjlwyyc` from the **backend** Container Apps
(long-running → reliable export). `backend/main.py` calls `configure_azure_monitor` and
instruments FastAPI + httpx when `APPLICATIONINSIGHTS_CONNECTION_STRING` is set, with a
per-brand role via `OTEL_SERVICE_NAME` (`insurance-backend-santander` / `insurance-backend-helix`).
View in the Application Insights portal (Application Map / Transaction search / Logs) or via KQL
against the Log Analytics workspace `ins-ai-demo-law-jii435hjlwyyc`:

```kusto
AppDependencies | where TimeGenerated > ago(1h)
| summarize count(), avg(DurationMs) by AppRoleName, Target
```

`deploy.ps1` also injects the connection string into the hosted agent, **but** the ephemeral
hosted-agent sandbox does not reliably surface those spans, and the Foundry **portal** Tracing
tab needs a project↔App Insights *connection* (ApiKey) that currently 500s on this lite
AIServices-account project (no backing Key Vault). Use the portal's **Connect Application
Insights** action or a hub-based project to light up the portal tab + the agent's internal
intake/risk/compliance spans. Meanwhile the real-time per-stage flow is fully visible via the
`stream: true` SSE response (and the dashboard).

### Evaluation — passing

The existing golden-dataset gate runs against the **deployed agent**:

```powershell
$env:FOUNDRY_TOKEN = az account get-access-token --resource https://ai.azure.com --query accessToken -o tsv
python evals/run_evals.py --target foundry   # default --target local stays in-process for CI
```

Latest run: **4/4 pass** (approve, approve, reject, reject — prompt-injection correctly flagged).

See the `microsoft-foundry` skill (`foundry-agent/deploy`, `invoke`, `observe`) for the
full deploy → invoke → evaluate workflow.
