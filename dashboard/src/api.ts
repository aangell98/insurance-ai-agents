import { acquireApiToken } from './auth/msalConfig';
import { OfflineClaimsTransport, type DemoSocket, type ClaimsTransport } from './offline/transport';

const API_BASE = import.meta.env.VITE_API_URL || '';
export const isOfflineMode = import.meta.env.VITE_OFFLINE_MODE === 'true';

export interface ClaimRequest { policy_id: string; customer_id: string; incident_type: string; description: string; estimated_amount: number; claim_id?: string; image_b64?: string; }
export interface AuditEntry { stage: string; status: string; timestamp: string; duration_ms: number; result_summary: string; }
export interface ClaimResult {
  claim_id: string; decision: 'approve' | 'human_review' | 'reject'; confidence: number; reasoning: string; total_duration_ms: number;
  intake_result: Record<string, any>; risk_result: Record<string, any>; compliance_result: Record<string, any>; audit_trail: AuditEntry[];
  security_flagged?: boolean; metadata?: Record<string, unknown>; timestamp: string;
}
export interface ProgressUpdate { type: 'progress'; claim_id: string; stage: string; status: 'processing' | 'completed' | 'failed'; data: Record<string, unknown>; timestamp: string; }
export interface TokenUpdate { type: 'token'; claim_id: string; agent: string; text: string; timestamp: string; }
export type PipelineUpdate = ProgressUpdate | TokenUpdate;
export interface Scenario { policy_id: string; customer_id: string; incident_type: string; description: string; estimated_amount: number; expected_decision: string; }
export interface StatsResponse { total_claims: number; approved: number; human_review: number; rejected: number; avg_duration_ms: number; total_amount: number; avg_risk_score: number; active_policies: number; decisions_breakdown: Record<string, number>; }
export interface ClaimSummary { claim_id: string; decision: string; confidence: number; timestamp: string; total_duration_ms: number; customer_id?: string; policy_id?: string; estimated_amount?: number; reasoning?: string; }
export interface Policy { policy_id: string; customer_id?: string; customer_name: string; vehicle: string; coverage_type: string; max_coverage: number; status?: string; start_date?: string; end_date?: string; }
export interface CustomerHistory { customer_id: string; name: string; years_as_customer: number; previous_claims: number; previous_claims_details: Array<{ year: number; type: string; amount: number; status: string }>; risk_profile: string; payment_history: string; }
export interface ClaimAuditDetail extends Omit<ClaimResult, 'security_flagged' | 'timestamp'> { metadata?: Record<string, any>; has_image?: boolean; policy?: Policy | null; customer_history?: CustomerHistory | null; }
export interface PolicyDetail extends Policy { customer_history?: CustomerHistory | null; }
export interface NewPolicyRequest { customer_id: string; vehicle: string; coverage_type: string; max_coverage: number; start_date?: string; end_date?: string; }
export interface NewCustomerRequest { name: string; years_as_customer: number; previous_claims: number; risk_profile: string; payment_history: string; }
export interface CustomerDetail extends CustomerHistory { policies?: Policy[]; }
export interface SecurityIncident { claim_id: string; policy_id: string; customer_id: string; incident_type: string; severity: string; detected_at: string; description: string; raw_payload_excerpt: string; status: string; }
export interface SecurityIncidentsResponse { total: number; open: number; incidents: SecurityIncident[]; }
export interface GovernancePolicy { id: string; name: string; active: boolean; }
export interface CodeOwnership { path: string; owners: string[]; }
export interface GovernanceStatus {
  pipeline_version: string; git_commit: string; model: string; deployed_at: string;
  apim: { enabled: boolean; gateway_url: string; policies: GovernancePolicy[] };
  evals: { dataset_path: string; workflow: string; latest: null | { timestamp: string; total: number; passed: number; failed: number; pass_rate: number; model: string; via_apim: boolean; } };
  code_ownership: CodeOwnership[]; checks: Record<string, boolean>;
}

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly detail: string) {
    super(detail);
    this.name = 'ApiError';
  }
}

async function networkFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  const token = await acquireApiToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}
async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await networkFetch(path, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    const detail = typeof body?.detail === 'string' ? body.detail : response.statusText;
    throw new ApiError(response.status, detail);
  }
  return response.json() as Promise<T>;
}

class NetworkClaimsTransport implements ClaimsTransport {
  async getScenarios() { return json<Record<string, Scenario>>('/api/scenarios'); }
  async evaluateClaim(request: ClaimRequest, signal?: AbortSignal) { return json<ClaimResult>('/api/claims/evaluate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal }); }
  async connect(claimId: string, listener: (update: PipelineUpdate) => void, customerId = '') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = API_BASE ? new URL(API_BASE).host : window.location.host;
    const ticket = await json<{ ticket: string }>('/api/ws-ticket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claim_id: claimId, customer_id: customerId }) });
    const ws = new WebSocket(`${proto}//${host}/ws/claims/${claimId}?ticket=${encodeURIComponent(ticket.ticket)}`);
    ws.onmessage = event => { try { const update = JSON.parse(event.data) as PipelineUpdate; listener(update); } catch { /* malformed messages are ignored */ } };
    return {
      ws,
      ready: new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          ws.close();
          reject(new Error('WebSocket connection timed out.'));
        }, 10000);
        ws.onopen = () => {
          window.clearTimeout(timeout);
          resolve();
        };
        ws.onerror = () => {
          window.clearTimeout(timeout);
          reject(new Error('WebSocket connection failed.'));
        };
        ws.onclose = event => {
          window.clearTimeout(timeout);
          if (!event.wasClean) reject(new Error('WebSocket closed before opening.'));
        };
      }),
    };
  }
  async getStats() { return json<StatsResponse>('/api/stats'); }
  async getClaims() { return json<ClaimSummary[]>('/api/claims'); }
  async getClaimsByCustomer(customerId: string) { return json<ClaimSummary[]>(`/api/claims/by-customer/${encodeURIComponent(customerId)}`); }
  async getPendingReview() { return json<ClaimSummary[]>('/api/claims/pending-review'); }
  async getClaimAudit(claimId: string) { return json<ClaimAuditDetail>(`/api/claims/${encodeURIComponent(claimId)}/audit`); }
  async getClaimImage(claimId: string) { const value = await json<{ image_b64?: string }>(`/api/claims/${encodeURIComponent(claimId)}/image`).catch((): { image_b64?: string } => ({})); return value.image_b64 || null; }
  async getPolicies() { return json<Policy[]>('/api/policies'); }
  async getPolicyDetail(policyId: string) { return json<PolicyDetail>(`/api/policies/${encodeURIComponent(policyId)}`); }
  async registerPolicy(request: NewPolicyRequest) { return json<Policy>('/api/policies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) }); }
  async getCustomers() { return json<CustomerHistory[]>('/api/customers'); }
  async getCustomerDetail(customerId: string) { return json<CustomerDetail>(`/api/customers/${encodeURIComponent(customerId)}`); }
  async registerCustomer(request: NewCustomerRequest) { return json<CustomerHistory>('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) }); }
  async getSecurityIncidents() { return json<SecurityIncidentsResponse>('/api/security/incidents'); }
  async getGovernanceStatus() { return json<GovernanceStatus>('/api/governance/status'); }
  reset() { /* Online mode retains server-owned state. */ }
}

const transport: ClaimsTransport = isOfflineMode ? new OfflineClaimsTransport() : new NetworkClaimsTransport();

export const getScenarios = () => transport.getScenarios() as Promise<Record<string, Scenario>>;
export const evaluateClaim = (request: ClaimRequest, signal?: AbortSignal) => transport.evaluateClaim(request, signal);
export const connectWebSocket = (claimId: string, listener: (update: PipelineUpdate) => void, customerId = '') => transport.connect(claimId, listener, customerId);
export const getStats = () => transport.getStats();
export const getClaims = () => transport.getClaims();
export const getClaimsByCustomer = (customerId: string) => transport.getClaimsByCustomer(customerId);
export const getPendingReview = () => transport.getPendingReview();
export const getClaimAudit = (claimId: string) => transport.getClaimAudit(claimId) as Promise<ClaimAuditDetail>;
export const getClaimImage = (claimId: string) => transport.getClaimImage(claimId);
export const getPolicies = () => transport.getPolicies();
export const getPolicyDetail = (policyId: string) => transport.getPolicyDetail(policyId);
export const registerPolicy = (request: NewPolicyRequest) => transport.registerPolicy(request);
export const getCustomers = () => transport.getCustomers();
export const getCustomerDetail = (customerId: string) => transport.getCustomerDetail(customerId);
export const registerCustomer = (request: NewCustomerRequest) => transport.registerCustomer(request);
export const getSecurityIncidents = () => transport.getSecurityIncidents();
export const getGovernanceStatus = () => transport.getGovernanceStatus();
export const resetOfflineDemo = () => transport.reset();
