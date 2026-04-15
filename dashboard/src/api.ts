const API_BASE = import.meta.env.VITE_API_URL || '';

export interface ClaimRequest {
  policy_id: string;
  customer_id: string;
  incident_type: string;
  description: string;
  estimated_amount: number;
  claim_id?: string;
}

export interface ClaimResult {
  claim_id: string;
  decision: 'approve' | 'human_review' | 'reject';
  confidence: number;
  reasoning: string;
  total_duration_ms: number;
  intake_result: Record<string, unknown>;
  risk_result: Record<string, unknown>;
  compliance_result: Record<string, unknown>;
  audit_trail: AuditEntry[];
  timestamp: string;
}

export interface AuditEntry {
  stage: string;
  status: string;
  timestamp: string;
  duration_ms: number;
  result_summary: string;
}

export interface PipelineUpdate {
  type: string;
  claim_id: string;
  stage: string;
  status: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface Scenario {
  policy_id: string;
  customer_id: string;
  incident_type: string;
  description: string;
  estimated_amount: number;
  expected_decision: string;
}

export async function getScenarios(): Promise<Record<string, Scenario>> {
  const res = await fetch(`${API_BASE}/api/scenarios`);
  if (!res.ok) throw new Error('Failed to fetch scenarios');
  return res.json();
}

export async function evaluateClaim(req: ClaimRequest): Promise<ClaimResult> {
  const res = await fetch(`${API_BASE}/api/claims/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Evaluation failed');
  }
  return res.json();
}

export function connectWebSocket(
  claimId: string,
  onUpdate: (update: PipelineUpdate) => void,
): { ws: WebSocket; ready: Promise<void> } {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = API_BASE ? new URL(API_BASE).host : window.location.host;
  const ws = new WebSocket(`${proto}//${host}/ws/claims/${claimId}`);
  const ready = new Promise<void>((resolve) => {
    ws.onopen = () => resolve();
  });
  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data.type !== 'pong') onUpdate(data);
    } catch { /* ignore parse errors */ }
  };
  return { ws, ready };
}
