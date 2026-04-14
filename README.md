# Insurance AI Agents — Governed Multi-Agent Claims Processing

> **Demo**: Cómo una entidad financiera puede crear, gobernar y operar agentes de IA para procesos críticos como gestión de siniestros, sin perder el control ni la trazabilidad.

## Arquitectura

```
┌─────────────────────────────────────┐
│         GitHub Enterprise           │
│ (Gobierno: CODEOWNERS, PRs, CI/CD)  │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│         Azure AI Foundry            │
│  ┌──────────┐ ┌──────────┐ ┌──────┐│
│  │ Claims   │→│ Risk &   │→│Compl.││
│  │ Intake   │ │ Fraud    │ │Agent ││
│  └──────────┘ └──────────┘ └──────┘│
│         Orchestrator Agent          │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│     APIM AI Gateway (Seguridad)     │
│ Token Limits │ Content Safety       │
│ Audit Logs   │ Token Metrics        │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Azure OpenAI (GPT-4o)             │
└─────────────────────────────────────┘
```

## Quick Start

### 1. Deploy Infrastructure
```powershell
.\scripts\deploy-infra.ps1 -ResourceGroup rg-insurance-ai-demo -Location swedencentral
```

### 2. Start Backend
```bash
cd backend
pip install -r requirements.txt
python main.py
```

### 3. Start Dashboard
```bash
cd dashboard
npm install
npm run dev
```

### 4. Run Demo
```bash
python scripts/run_demo.py
```

## Project Structure

| Path | Description |
|------|-------------|
| `agents/claims-intake/` | Analiza y estructura el siniestro reportado |
| `agents/risk-assessment/` | Evalúa riesgo y detecta fraude |
| `agents/compliance/` | Valida normativa y reglas de negocio |
| `agents/orchestrator/` | Coordina el workflow multi-agente |
| `backend/` | FastAPI API + WebSocket para el dashboard |
| `dashboard/` | React dashboard con pipeline visualization |
| `infra/` | Bicep templates para toda la infraestructura |
| `.github/` | CODEOWNERS, PR templates, CI/CD workflows |
| `scripts/` | Scripts de deploy y demo |

## Key File: `agents/compliance/rules.py`

Este es el archivo que se modifica durante el **WOW moment** de la demo para demostrar cómo un cambio regulatorio se gestiona con el mismo control que software bancario crítico.

## Technologies

- **GitHub Enterprise** — Gobierno de agentes (CODEOWNERS, branch protection, PR reviews)
- **Azure AI Foundry** — Hosted agents, multi-agent workflow
- **Azure API Management** — AI Gateway (content safety, token limits, audit logging)
- **Azure OpenAI (GPT-4o)** — Modelo de lenguaje
- **React + Tailwind** — Dashboard profesional
- **FastAPI** — Backend API con WebSocket
