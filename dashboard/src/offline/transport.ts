import type {
  ClaimRequest, ClaimResult, ClaimSummary, CustomerDetail, CustomerHistory, GovernanceStatus,
  NewCustomerRequest, NewPolicyRequest, PipelineUpdate, Policy, PolicyDetail, SecurityIncident,
  SecurityIncidentsResponse, StatsResponse,
} from '../api';
import {
  buildOfflineClaim, buildOfflineIncident, OFFLINE_CUSTOMERS, OFFLINE_POLICIES, OFFLINE_SCENARIOS,
} from './fixtures';

type StreamListener = (update: PipelineUpdate) => void;

export interface DemoSocket {
  readonly readyState: number;
  close(): void;
  send(message: string): void;
}

export interface ClaimsTransport {
  getScenarios(): Promise<Record<string, typeof OFFLINE_SCENARIOS[keyof typeof OFFLINE_SCENARIOS]>>;
  evaluateClaim(request: ClaimRequest, signal?: AbortSignal): Promise<ClaimResult>;
  connect(claimId: string, listener: StreamListener, customerId?: string): Promise<{ ws: DemoSocket; ready: Promise<void> }>;
  getStats(): Promise<StatsResponse>;
  getClaims(): Promise<ClaimSummary[]>;
  getClaimsByCustomer(customerId: string): Promise<ClaimSummary[]>;
  getPendingReview(): Promise<ClaimSummary[]>;
  getClaimAudit(claimId: string): Promise<any>;
  getClaimImage(claimId: string): Promise<string | null>;
  getPolicies(): Promise<Policy[]>;
  getPolicyDetail(policyId: string): Promise<PolicyDetail>;
  registerPolicy(request: NewPolicyRequest): Promise<Policy>;
  getCustomers(): Promise<CustomerHistory[]>;
  getCustomerDetail(customerId: string): Promise<CustomerDetail>;
  registerCustomer(request: NewCustomerRequest): Promise<CustomerHistory>;
  getSecurityIncidents(): Promise<SecurityIncidentsResponse>;
  getGovernanceStatus(): Promise<GovernanceStatus>;
  reset(): void;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(new DOMException('Request aborted', 'AbortError'));
  const timer = window.setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => {
    window.clearTimeout(timer);
    reject(new DOMException('Request aborted', 'AbortError'));
  }, { once: true });
});

export class OfflineClaimsTransport implements ClaimsTransport {
  private claims: Array<ClaimResult & { request: ClaimRequest }> = [];
  private incidents: SecurityIncident[] = [];
  private policies = clone(OFFLINE_POLICIES);
  private customers = clone(OFFLINE_CUSTOMERS);
  private listeners = new Map<string, StreamListener>();

  constructor() { this.reset(); }

  reset() {
    this.claims = [];
    this.incidents = [];
    this.policies = clone(OFFLINE_POLICIES);
    this.customers = clone(OFFLINE_CUSTOMERS);
    this.listeners.clear();
  }

  async getScenarios() { return clone(OFFLINE_SCENARIOS); }

  async connect(claimId: string, listener: StreamListener, _customerId = '') {
    this.listeners.set(claimId, listener);
    let open = true;
    const ws: DemoSocket = {
      get readyState() { return open ? WebSocket.OPEN : WebSocket.CLOSED; },
      close: () => { open = false; this.listeners.delete(claimId); },
      send: () => undefined,
    };
    return { ws, ready: Promise.resolve() };
  }

  async evaluateClaim(request: ClaimRequest, signal?: AbortSignal) {
    const claim = buildOfflineClaim(request, { policies: this.policies, customers: this.customers });
    const listener = this.listeners.get(claim.claim_id);
    const emit = async (stage: 'intake' | 'risk_assessment' | 'compliance' | 'decision', data: Record<string, unknown>) => {
      listener?.({ type: 'progress', claim_id: claim.claim_id, stage, status: 'processing', data: {}, timestamp: claim.timestamp });
      await wait(90, signal);
      listener?.({ type: 'token', claim_id: claim.claim_id, agent: stage === 'risk_assessment' ? 'risk' : stage, text: JSON.stringify(data), timestamp: claim.timestamp });
      await wait(90, signal);
      listener?.({ type: 'progress', claim_id: claim.claim_id, stage, status: 'completed', data, timestamp: claim.timestamp });
    };
    await emit('intake', claim.intake_result);
    await emit('risk_assessment', claim.risk_result);
    await emit('compliance', claim.compliance_result);
    await emit('decision', { decision: claim.decision, confidence: claim.confidence, reasoning: claim.reasoning });
    this.claims.unshift({ ...claim, request: clone(request) });
    const incident = buildOfflineIncident(claim, request);
    if (incident) this.incidents.unshift(incident);
    return clone(claim);
  }

  private summary(claim: ClaimResult & { request: ClaimRequest }): ClaimSummary {
    return { claim_id: claim.claim_id, customer_id: claim.request.customer_id, policy_id: claim.request.policy_id, decision: claim.decision, confidence: claim.confidence, timestamp: claim.timestamp, total_duration_ms: claim.total_duration_ms, estimated_amount: claim.request.estimated_amount, reasoning: claim.reasoning };
  }
  async getClaims() { return this.claims.map(c => this.summary(c)); }
  async getClaimsByCustomer(customerId: string) { return this.claims.filter(c => c.request.customer_id === customerId).map(c => this.summary(c)); }
  async getPendingReview() { return this.claims.filter(c => c.decision === 'human_review').map(c => this.summary(c)); }
  async getClaimAudit(claimId: string) {
    const claim = this.claims.find(c => c.claim_id === claimId);
    if (!claim) throw new Error('Claim not found');
    const policy = this.policies.find(p => p.policy_id === claim.request.policy_id) || null;
    const customer_history = this.customers.find(c => c.customer_id === claim.request.customer_id) || null;
    return clone({ ...claim, policy, customer_history, has_image: false });
  }
  async getClaimImage() { return null; }
  async getPolicies() { return clone(this.policies); }
  async getPolicyDetail(policyId: string) {
    const policy = this.policies.find(p => p.policy_id === policyId);
    if (!policy) throw new Error('Policy not found');
    return clone({ ...policy, customer_history: this.customers.find(c => c.customer_id === policy.customer_id) || null });
  }
  async registerPolicy(request: NewPolicyRequest) {
    const customer = this.customers.find(c => c.customer_id === request.customer_id);
    if (!customer) throw new Error('Customer not found');
    const policy: Policy = { ...request, policy_id: `POL-OFFLINE-${String(this.policies.length + 1).padStart(3, '0')}`, customer_name: customer.name, status: 'active' };
    this.policies.push(policy);
    return clone(policy);
  }
  async getCustomers() { return clone(this.customers); }
  async getCustomerDetail(customerId: string) {
    const customer = this.customers.find(c => c.customer_id === customerId);
    if (!customer) throw new Error('Customer not found');
    return clone({ ...customer, policies: this.policies.filter(p => p.customer_id === customerId) });
  }
  async registerCustomer(request: NewCustomerRequest) {
    const customer: CustomerHistory = { ...request, customer_id: `CUST-OFFLINE-${String(this.customers.length + 1).padStart(3, '0')}`, previous_claims_details: [] };
    this.customers.push(customer);
    return clone(customer);
  }
  async getSecurityIncidents() { return { total: this.incidents.length, open: this.incidents.filter(i => i.status === 'open').length, incidents: clone(this.incidents) }; }
  async getStats() {
    const claims = this.claims;
    const count = (decision: string) => claims.filter(c => c.decision === decision).length;
    return { total_claims: claims.length, approved: count('approve'), human_review: count('human_review'), rejected: count('reject'), avg_duration_ms: claims.length ? 850 : 0, total_amount: claims.reduce((sum, c) => sum + c.request.estimated_amount, 0), avg_risk_score: claims.length ? claims.reduce((sum, c) => sum + Number((c.risk_result as any).risk_score || 0), 0) / claims.length : 0, active_policies: this.policies.filter(p => p.status === 'active').length, decisions_breakdown: { approve: count('approve'), human_review: count('human_review'), reject: count('reject') } };
  }
  async getGovernanceStatus(): Promise<GovernanceStatus> {
    return {
      pipeline_version: 'preservation-1.0.0', git_commit: 'offline-fixtures', model: 'deterministic-fixture', deployed_at: '2026-07-29T12:00:00.000Z',
      apim: { enabled: false, gateway_url: 'Offline simulation — no gateway call', policies: [
        { id: 'managed-identity', name: 'Managed identity (production)', active: true }, { id: 'content-safety', name: 'Prompt-injection guard (deterministic)', active: true }, { id: 'audit-log', name: 'Immutable-style audit fixture', active: true },
      ] },
      evals: { dataset_path: 'evals/golden_dataset.json', workflow: '.github/workflows/eval-on-pr.yml', latest: { timestamp: '2026-07-29T12:00:00.000Z', total: 5, passed: 5, failed: 0, pass_rate: 1, model: 'deterministic-fixture', via_apim: false } },
      code_ownership: [{ path: '/agents/compliance/', owners: ['@aangell98'] }, { path: '/infra/', owners: ['@aangell98'] }],
      checks: { pull_request_template: true, codeowners: true, deploy_workflow: true, eval_workflow: true, infra_as_code: true, apim_policy_xml: true },
    };
  }
}
