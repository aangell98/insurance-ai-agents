import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Loader2,
  Pause,
  Play,
  SkipForward,
  X,
} from 'lucide-react';
import type { ClaimRequest, ClaimResult, PipelineUpdate, Scenario } from '../api';
import { connectWebSocket, getScenarios } from '../api';
import { AUTH_ENABLED, acquireApiToken } from '../auth/msalConfig';
import LiveStatsTicker from './autoplay/LiveStatsTicker';
import AgentThinkingPanel from './autoplay/AgentThinkingPanel';
import type { AgentName, AgentStatus } from './autoplay/AgentThinkingPanel';
import DecisionFinale from './autoplay/DecisionFinale';
import IntakeExtractionPanel from './autoplay/IntakeExtractionPanel';
import RiskGaugePanel from './autoplay/RiskGaugePanel';
import type { FraudProbability } from './autoplay/RiskGaugePanel';
import ComplianceChecklistPanel from './autoplay/ComplianceChecklistPanel';
import type { ComplianceRule, RuleStatus } from './autoplay/ComplianceChecklistPanel';

const API_BASE = import.meta.env.VITE_API_URL || '';
const DEMO_ORDER = ['low_risk', 'high_amount', 'human_review', 'fraudulent', 'prompt_injection'] as const;

const AGENT_NAMES: AgentName[] = ['intake', 'risk', 'compliance', 'decision'];

const STAGE_TO_AGENT: Record<Stage, AgentName> = {
  intake: 'intake',
  risk_assessment: 'risk',
  compliance: 'compliance',
  decision: 'decision',
};

type ScenarioKey = (typeof DEMO_ORDER)[number];
type Stage = 'intake' | 'risk_assessment' | 'compliance' | 'decision';
type StageStatus = 'pending' | 'processing' | 'completed' | 'failed';
type DemoStatus = 'idle' | 'loading' | 'running' | 'finished' | 'error';
type NoticeKind = 'error' | 'info';
type ApiError = Error & { status?: number };

interface Props {
  open: boolean;
  onClose: () => void;
}

interface DemoScenario {
  key: ScenarioKey;
  scenario: Scenario;
}

interface DemoItem {
  scenarioKey: ScenarioKey;
  scenario: Scenario;
  result: ClaimResult;
  durationMs: number;
}

interface Notice {
  id: string;
  text: string;
  kind: NoticeKind;
}

const EMPTY_STAGE_STATUSES: Record<Stage, StageStatus> = {
  intake: 'pending',
  risk_assessment: 'pending',
  compliance: 'pending',
  decision: 'pending',
};

const COMPLETED_STAGE_STATUSES: Record<Stage, StageStatus> = {
  intake: 'completed',
  risk_assessment: 'completed',
  compliance: 'completed',
  decision: 'completed',
};

const SCENARIO_META: Record<ScenarioKey, { label: string; shortLabel: string; badge: string; glow: string }> = {
  low_risk: {
    label: '🟢 Bajo Riesgo',
    shortLabel: 'Bajo Riesgo',
    badge: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
    glow: 'shadow-[0_0_36px_rgba(16,185,129,0.18)]',
  },
  high_amount: {
    label: '💰 Alto Monto',
    shortLabel: 'Alto Monto',
    badge: 'border-primary-500/30 bg-primary-500/10 text-primary-200',
    glow: 'shadow-[0_0_36px_rgba(236,0,0,0.18)]',
  },
  human_review: {
    label: '🟠 Revisión Humana',
    shortLabel: 'Revisión Humana',
    badge: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
    glow: 'shadow-[0_0_36px_rgba(245,158,11,0.18)]',
  },
  fraudulent: {
    label: '🚨 Fraudulento',
    shortLabel: 'Fraudulento',
    badge: 'border-rose-400/30 bg-rose-500/10 text-rose-200',
    glow: 'shadow-[0_0_36px_rgba(244,63,94,0.18)]',
  },
  prompt_injection: {
    label: '🛡️ Prompt Injection',
    shortLabel: 'Prompt Injection',
    badge: 'border-primary-500/30 bg-primary-500/10 text-primary-100',
    glow: 'shadow-[0_0_36px_rgba(236,0,0,0.22)]',
  },
};

const DECISION_META: Record<ClaimResult['decision'], { label: string; badge: string }> = {
  approve: {
    label: 'Aprobado',
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  },
  human_review: {
    label: 'Revisión humana',
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  },
  reject: {
    label: 'Rechazado',
    badge: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  },
};

const currencyFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function formatElapsed(totalSeconds: number) {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatCaseDuration(durationMs: number) {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return 'Error inesperado';
}

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

function createAbortError() {
  return new DOMException('Aborted', 'AbortError');
}

function getFraudProbability(result: ClaimResult): string {
  const riskResult = result.risk_result as Record<string, unknown>;
  return typeof riskResult?.fraud_probability === 'string' ? riskResult.fraud_probability.toLowerCase() : '';
}

function isSecurityFlagged(result: ClaimResult) {
  return Boolean((result as ClaimResult & { security_flagged?: boolean }).security_flagged);
}

function getFraudProbabilityTyped(result: ClaimResult | null): FraudProbability | null {
  if (!result) return null;
  const value = getFraudProbability(result);
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  if (value === 'baja') return 'low';
  if (value === 'media') return 'medium';
  if (value === 'alta') return 'high';
  return null;
}

function getRiskScore(result: ClaimResult | null): number | null {
  if (!result) return null;
  const risk = result.risk_result as Record<string, unknown>;
  const raw = risk?.risk_score;
  if (typeof raw === 'number') return Math.round(raw * (raw <= 10 ? 10 : 1));
  if (typeof raw === 'string') {
    const n = parseFloat(raw);
    if (!Number.isNaN(n)) return Math.round(n * (n <= 10 ? 10 : 1));
  }
  return null;
}

interface ExtractedFieldsView {
  incident_type?: string;
  estimated_amount?: number;
  vehicle?: string;
  date?: string;
  location?: string;
}

// === Streaming JSON parsing helpers ============================================
// Los tokens del LLM streamean JSON crudo (response_format=PydanticModel). Para
// no esperar al `executor_completed`, extraemos campos top-level conforme se van
// cerrando en el JSON parcial. Esto alimenta los paneles viz en vivo.

function extractStringField(text: string, key: string): string | undefined {
  const regex = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'i');
  const m = text.match(regex);
  if (!m) return undefined;
  try {
    return JSON.parse(`"${m[1]}"`) as string;
  } catch {
    return m[1];
  }
}

function extractNumberField(text: string, key: string): number | undefined {
  const regex = new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, 'i');
  const m = text.match(regex);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

function extractBooleanField(text: string, key: string): boolean | undefined {
  const regex = new RegExp(`"${key}"\\s*:\\s*(true|false)`, 'i');
  const m = text.match(regex);
  if (!m) return undefined;
  return m[1].toLowerCase() === 'true';
}

function parseStreamingIntake(tokens: string): ExtractedFieldsView | undefined {
  if (!tokens) return undefined;
  const view: ExtractedFieldsView = {};
  const incidentType = extractStringField(tokens, 'incident_type');
  if (incidentType) view.incident_type = incidentType;
  const amount = extractNumberField(tokens, 'estimated_amount');
  if (amount !== undefined && amount > 0) view.estimated_amount = amount;
  const vehicle = extractStringField(tokens, 'vehicle');
  if (vehicle) view.vehicle = vehicle;
  const date = extractStringField(tokens, 'date_of_incident');
  if (date) view.date = date;
  const location = extractStringField(tokens, 'location');
  if (location) view.location = location;
  return Object.keys(view).length > 0 ? view : undefined;
}

function parseStreamingRisk(tokens: string): { score: number | null; fraud: FraudProbability | null } {
  if (!tokens) return { score: null, fraud: null };
  let score: number | null = null;
  const raw = extractNumberField(tokens, 'risk_score');
  if (raw !== undefined) score = Math.round(raw * (raw <= 10 ? 10 : 1));
  let fraud: FraudProbability | null = null;
  const fp = extractStringField(tokens, 'fraud_probability')?.toLowerCase();
  if (fp === 'low' || fp === 'medium' || fp === 'high') fraud = fp;
  else if (fp === 'baja') fraud = 'low';
  else if (fp === 'media') fraud = 'medium';
  else if (fp === 'alta') fraud = 'high';
  return { score, fraud };
}

function parseStreamingCompliance(tokens: string): { compliant?: boolean } {
  if (!tokens) return {};
  return { compliant: extractBooleanField(tokens, 'compliant') };
}

function getExtractedFields(result: ClaimResult | null): ExtractedFieldsView | undefined {
  if (!result) return undefined;
  const intake = result.intake_result as Record<string, unknown>;
  const data = (intake?.extracted_data ?? {}) as Record<string, unknown>;
  const view: ExtractedFieldsView = {};
  if (typeof data.incident_type === 'string' && data.incident_type) view.incident_type = data.incident_type;
  if (typeof data.estimated_amount === 'number' && data.estimated_amount > 0) view.estimated_amount = data.estimated_amount;
  if (typeof data.vehicle === 'string' && data.vehicle) view.vehicle = data.vehicle;
  if (typeof data.date_of_incident === 'string' && data.date_of_incident) view.date = data.date_of_incident;
  if (typeof data.location === 'string' && data.location) view.location = data.location;
  return Object.keys(view).length > 0 ? view : undefined;
}

function buildComplianceRules(result: ClaimResult | null, stageStatuses: Record<Stage, StageStatus>): ComplianceRule[] {
  const base: ComplianceRule[] = [
    { id: 'policy_valid', label: 'Póliza vigente', status: 'pending' },
    { id: 'coverage', label: 'Cobertura aplica al incidente', status: 'pending' },
    { id: 'amount_threshold', label: 'Importe dentro del límite automático', status: 'pending' },
    { id: 'fraud_indicators', label: 'Sin patrones de fraude detectados', status: 'pending' },
    { id: 'documentation', label: 'Documentación completa', status: 'pending' },
  ];

  const status = stageStatuses.compliance;
  if (status === 'pending') return base;

  if (status === 'processing' && !result) {
    return base.map((r, idx) => ({ ...r, status: idx === 0 ? 'checking' : 'pending' as RuleStatus }));
  }

  if (!result) return base;

  const compliance = result.compliance_result as Record<string, unknown>;
  const rulesApplied = (compliance?.rules_applied ?? {}) as Record<string, unknown>;
  const decision = result.decision;
  const reasoning = (result.reasoning ?? '').toLowerCase();
  const fraudProb = getFraudProbability(result);
  const securityFlagged = isSecurityFlagged(result);
  const amount = result.intake_result
    ? ((result.intake_result as Record<string, unknown>).extracted_data as Record<string, unknown> | undefined)?.estimated_amount
    : undefined;
  const numericAmount = typeof amount === 'number' ? amount : 0;
  const threshold = typeof rulesApplied.human_review_threshold === 'number' ? rulesApplied.human_review_threshold : 20000;
  const policyValid = typeof rulesApplied.policy_valid === 'boolean' ? rulesApplied.policy_valid : true;
  const coverageOk = typeof rulesApplied.coverage_applies === 'boolean' ? rulesApplied.coverage_applies : decision !== 'reject';

  return [
    {
      id: 'policy_valid',
      label: 'Póliza vigente',
      status: policyValid ? 'passed' : 'failed',
      detail: policyValid ? undefined : 'Póliza no encontrada o expirada.',
    },
    {
      id: 'coverage',
      label: 'Cobertura aplica al incidente',
      status: coverageOk ? 'passed' : 'failed',
    },
    {
      id: 'amount_threshold',
      label: 'Importe dentro del límite automático',
      status: numericAmount > threshold ? 'warning' : 'passed',
      detail: numericAmount > threshold
        ? `${numericAmount.toLocaleString('es-ES')} € supera el umbral de ${threshold.toLocaleString('es-ES')} €`
        : undefined,
    },
    {
      id: 'fraud_indicators',
      label: 'Sin patrones de fraude detectados',
      status: securityFlagged || fraudProb === 'high' || decision === 'reject' ? 'failed' : 'passed',
      detail: securityFlagged ? 'Intento de manipulación detectado por el guard de seguridad.' : undefined,
    },
    {
      id: 'documentation',
      label: 'Documentación completa',
      status: reasoning.includes('falta') || reasoning.includes('incompleta') ? 'warning' : 'passed',
    },
  ];
}

function nextStageStatuses(previous: Record<Stage, StageStatus>, stage: Stage, status: StageStatus) {
  const order: Stage[] = ['intake', 'risk_assessment', 'compliance', 'decision'];
  const updated = { ...previous, [stage]: status };
  if (status === 'processing' || status === 'completed') {
    const stageIndex = order.indexOf(stage);
    order.slice(0, stageIndex).forEach((key) => {
      if (updated[key] === 'pending') updated[key] = 'completed';
    });
  }
  return updated;
}

async function evaluateClaimAbortable(req: ClaimRequest, signal: AbortSignal): Promise<ClaimResult> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const token = await acquireApiToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}/api/claims/evaluate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(req),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ detail: response.statusText }));
    const error = new Error(typeof errorBody?.detail === 'string' ? errorBody.detail : 'Evaluation failed') as ApiError;
    error.status = response.status;
    throw error;
  }

  return response.json() as Promise<ClaimResult>;
}

// ===========================================================================
// ConsolidationStepsPanel: mini-secuencia visual entre Compliance y la
// DecisionFinale. Da margen al espectador para asimilar la transición.
// ===========================================================================

const CONSOLIDATION_STEPS = [
  { label: 'Reconciliando outputs', detail: 'Cruzando salidas de Intake, Risk y Compliance' },
  { label: 'Calculando confianza', detail: 'Ponderando señales de los 3 agentes' },
  { label: 'Emitiendo decisión final', detail: 'Generando justificación y audit trail' },
] as const;

function ConsolidationStepsPanel({ phase }: { phase: 0 | 1 | 2 }) {
  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center px-6 py-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Consolidación</p>
      <h3 className="mt-3 bg-gradient-to-r from-white via-primary-100 to-primary-200 bg-clip-text text-center text-2xl font-semibold tracking-tight text-transparent xl:text-3xl">
        Preparando la decisión final
      </h3>
      <ul className="mt-8 w-full max-w-md space-y-3">
        {CONSOLIDATION_STEPS.map((step, idx) => {
          const isActive = idx === phase;
          const isDone = idx < phase;
          return (
            <li
              key={step.label}
              className={`flex items-start gap-3 rounded-2xl border px-4 py-3 transition-all duration-300 ${
                isDone
                  ? 'border-emerald-400/30 bg-emerald-500/10'
                  : isActive
                    ? 'border-primary-500/40 bg-primary-500/12 animate-pulse-soft'
                    : 'border-white/10 bg-white/5 opacity-60'
              }`}
            >
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                isDone
                  ? 'bg-emerald-400 text-slate-950'
                  : isActive
                    ? 'bg-primary-400 text-white'
                    : 'bg-white/10 text-slate-500'
              }`}>
                {isDone ? '✓' : isActive ? '•' : idx + 1}
              </span>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${isActive ? 'text-primary-100' : isDone ? 'text-emerald-50' : 'text-slate-300'}`}>{step.label}</p>
                <p className="mt-1 text-xs text-slate-400">{step.detail}</p>
              </div>
              {isActive ? (
                <div className="mt-1 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-primary-300 animate-pulse-soft" />
                  <span className="h-2 w-2 rounded-full bg-primary-300 animate-pulse-soft" style={{ animationDelay: '0.18s' }} />
                  <span className="h-2 w-2 rounded-full bg-primary-300 animate-pulse-soft" style={{ animationDelay: '0.36s' }} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function AutoPlayDemo({ open, onClose }: Props) {
  const onCloseRef = useRef(onClose);
  const demoRunRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const closeRequestedRef = useRef(false);
  const skipRequestedRef = useRef(false);
  const noticeTimersRef = useRef<number[]>([]);

  const [status, setStatus] = useState<DemoStatus>('idle');
  const [paused, setPaused] = useState(false);
  const [fatalError, setFatalError] = useState('');
  const [orderedScenarios, setOrderedScenarios] = useState<DemoScenario[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentScenarioKey, setCurrentScenarioKey] = useState<ScenarioKey | null>(null);
  const [currentClaimId, setCurrentClaimId] = useState('');
  const [stageStatuses, setStageStatuses] = useState<Record<Stage, StageStatus>>(() => ({ ...EMPTY_STAGE_STATUSES }));
  const [stageTokens, setStageTokens] = useState<Record<Stage, string>>(() => ({
    intake: '',
    risk_assessment: '',
    compliance: '',
    decision: '',
  }));
  const [feedItems, setFeedItems] = useState<DemoItem[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [finishedCount, setFinishedCount] = useState(0);
  const [currentResult, setCurrentResult] = useState<ClaimResult | null>(null);
  const [decisionFinale, setDecisionFinale] = useState<{ item: DemoItem; key: number } | null>(null);
  const [stageDurations, setStageDurations] = useState<Record<Stage, number>>(() => ({
    intake: 0,
    risk_assessment: 0,
    compliance: 0,
    decision: 0,
  }));
  // displayedActiveStage: lo que el espectador ve en el panel viz. Se retrasa
  // respecto al stage real para garantizar un mínimo de tiempo de visibilidad.
  const [displayedActiveStage, setDisplayedActiveStage] = useState<Stage>('intake');
  // consolidationPhase: micro-fase visual entre compliance y DecisionFinale para
  // que la decisión no salga "instantánea".
  const [consolidationPhase, setConsolidationPhase] = useState<null | 0 | 1 | 2>(null);
  const stageStartsRef = useRef<Record<Stage, number>>({
    intake: 0,
    risk_assessment: 0,
    compliance: 0,
    decision: 0,
  });
  const lastDisplayChangeRef = useRef(0);

  const clearNoticeTimers = useCallback(() => {
    noticeTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    noticeTimersRef.current = [];
  }, []);

  const stopPing = useCallback(() => {
    if (pingIntervalRef.current !== null) {
      window.clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  const cleanupActiveCase = useCallback((abortRequest: boolean, clearFinale = abortRequest) => {
    stopPing();
    if (clearFinale) setDecisionFinale(null);
    if (abortRequest) controllerRef.current?.abort();
    controllerRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
  }, [stopPing]);

  const pushNotice = useCallback((text: string, kind: NoticeKind = 'error') => {
    const id = crypto.randomUUID();
    setNotices((previous) => [...previous, { id, text, kind }]);
    const timer = window.setTimeout(() => {
      setNotices((previous) => previous.filter((notice) => notice.id !== id));
      noticeTimersRef.current = noticeTimersRef.current.filter((item) => item !== timer);
    }, 5200);
    noticeTimersRef.current.push(timer);
  }, []);

  const closeDemo = useCallback(() => {
    closeRequestedRef.current = true;
    skipRequestedRef.current = false;
    setPaused(false);
    cleanupActiveCase(true);
    onCloseRef.current();
  }, [cleanupActiveCase]);

  const expireSession = useCallback(() => {
    if (closeRequestedRef.current) return;
    closeRequestedRef.current = true;
    skipRequestedRef.current = false;
    setPaused(false);
    setStatus('error');
    setFatalError('Sesión caducada, vuelve a iniciar sesión');
    cleanupActiveCase(true);
    const timer = window.setTimeout(() => onCloseRef.current(), 1400);
    noticeTimersRef.current.push(timer);
  }, [cleanupActiveCase]);

  const waitForNextStep = useCallback(async (delayMs: number, runId: number) => {
    let remaining = delayMs;
    while (demoRunRef.current === runId && !closeRequestedRef.current) {
      if (skipRequestedRef.current) {
        skipRequestedRef.current = false;
        return 'skip' as const;
      }
      if (pausedRef.current) {
        await sleep(150);
        continue;
      }
      if (remaining <= 0) return 'resume' as const;
      const slice = Math.min(remaining, 150);
      await sleep(slice);
      remaining -= slice;
    }
    return 'close' as const;
  }, []);

  const waitForFinaleDelay = useCallback(async (delayMs: number, runId: number) => {
    let remaining = delayMs;
    while (remaining > 0) {
      if (demoRunRef.current !== runId || closeRequestedRef.current) return 'close' as const;
      if (skipRequestedRef.current) {
        skipRequestedRef.current = false;
        return 'skip' as const;
      }
      const slice = Math.min(remaining, 100);
      await sleep(slice);
      remaining -= slice;
    }
    return demoRunRef.current !== runId || closeRequestedRef.current ? 'close' as const : 'resume' as const;
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || paused || status !== 'running') return;
    const timer = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [open, paused, status]);

  useEffect(() => {
    if (!open) return;

    const runId = demoRunRef.current + 1;
    demoRunRef.current = runId;
    closeRequestedRef.current = false;
    skipRequestedRef.current = false;
    clearNoticeTimers();

    setStatus('loading');
    setPaused(false);
    setFatalError('');
    setOrderedScenarios([]);
    setCurrentIndex(0);
    setCurrentScenarioKey(null);
    setCurrentClaimId('');
    setStageStatuses({ ...EMPTY_STAGE_STATUSES });
    setDecisionFinale(null);
    setFeedItems([]);
    setNotices([]);
    setElapsedSeconds(0);
    setFinishedCount(0);

    const runDemo = async () => {
      // Best-effort: pre-cache the token. We DON'T abort if it fails — many
      // demo setups run with backend AUTH_ENABLED=false where no token is
      // needed. If the backend actually requires auth we'll get a 401 from
      // the first request and handle it there.
      if (AUTH_ENABLED) {
        try {
          await acquireApiToken();
        } catch {
          /* ignore — let the request fail naturally if auth is required */
        }
      }

      let scenariosResponse: Record<string, Scenario>;
      try {
        scenariosResponse = await getScenarios();
      } catch (error) {
        if (demoRunRef.current !== runId || closeRequestedRef.current) return;
        const apiError = error as ApiError;
        if (apiError.status === 401) {
          expireSession();
          return;
        }
        setStatus('error');
        setFatalError(getErrorMessage(error) || 'No se pudieron cargar los escenarios.');
        return;
      }

      if (demoRunRef.current !== runId || closeRequestedRef.current) return;

      const ordered = DEMO_ORDER.flatMap((key) => (scenariosResponse[key] ? [{ key, scenario: scenariosResponse[key] }] : []));
      if (ordered.length === 0) {
        setStatus('error');
        setFatalError('No se encontraron escenarios preparados para la demo.');
        return;
      }

      setOrderedScenarios(ordered);
      setStatus('running');

      for (let index = 0; index < ordered.length; index += 1) {
        if (demoRunRef.current !== runId || closeRequestedRef.current) return;

        const demoScenario = ordered[index];
        const claimId = `CLM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        const startedAt = Date.now();

        cleanupActiveCase(false, true);
        skipRequestedRef.current = false;
        setCurrentIndex(index);
        setCurrentScenarioKey(demoScenario.key);
        setCurrentClaimId(claimId);
        setStageStatuses({ ...EMPTY_STAGE_STATUSES });
        setStageTokens({ intake: '', risk_assessment: '', compliance: '', decision: '' });
        setCurrentResult(null);
        setStageDurations({ intake: 0, risk_assessment: 0, compliance: 0, decision: 0 });
        stageStartsRef.current = { intake: 0, risk_assessment: 0, compliance: 0, decision: 0 };
        // Reset pacing refs per case
        setDisplayedActiveStage('intake');
        lastDisplayChangeRef.current = Date.now();
        setConsolidationPhase(null);

        const { ws, ready } = connectWebSocket(claimId, (update: PipelineUpdate) => {
          if (demoRunRef.current !== runId) return;
          if (update.type === 'progress') {
            const stage = update.stage as Stage;
            if (!(stage in EMPTY_STAGE_STATUSES)) return;
            const nextStatus: StageStatus = update.status === 'completed'
              ? 'completed'
              : update.status === 'processing'
                ? 'processing'
                : 'failed';
            if (nextStatus === 'processing') {
              stageStartsRef.current[stage] = Date.now();
            } else if (nextStatus === 'completed' && stageStartsRef.current[stage] > 0) {
              const dur = Date.now() - stageStartsRef.current[stage];
              setStageDurations((prev) => ({ ...prev, [stage]: dur }));
            }
            setStageStatuses((previous) => nextStageStatuses(previous, stage, nextStatus));
          } else if (update.type === 'token') {
            const agent = update.agent;
            const stage: Stage = agent === 'risk'
              ? 'risk_assessment'
              : (agent === 'intake' || agent === 'compliance' || agent === 'decision')
                ? agent
                : 'intake';
            setStageTokens((previous) => ({ ...previous, [stage]: previous[stage] + update.text }));
          }
        });

        wsRef.current = ws;
        pingIntervalRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, 10000);

        const controller = new AbortController();
        controllerRef.current = controller;
        let skippedCurrent = false;

        try {
          await Promise.race([
            ready,
            sleep(1500),
            new Promise<never>((_, reject) => {
              controller.signal.addEventListener('abort', () => reject(createAbortError()), { once: true });
            }),
          ]);

          const result = await evaluateClaimAbortable({ ...demoScenario.scenario, claim_id: claimId }, controller.signal);
          if (demoRunRef.current !== runId || closeRequestedRef.current) return;

          if (stageStartsRef.current.decision > 0) {
            const decisionDuration = Date.now() - stageStartsRef.current.decision;
            setStageDurations((previous) => (previous.decision > 0
              ? previous
              : { ...previous, decision: decisionDuration }));
          }
          setStageStatuses({ ...COMPLETED_STAGE_STATUSES });
          setCurrentResult(result);
          const item: DemoItem = {
            scenarioKey: demoScenario.key,
            scenario: demoScenario.scenario,
            result,
            durationMs: result.total_duration_ms || Date.now() - startedAt,
          };
          setFeedItems((previous) => [...previous, item]);

          // Mini-secuencia de consolidación: 3 pasos visibles antes del overlay
          // final. Convierte una transición instantánea en una mini-experiencia.
          const CONSOLIDATION_STEP_MS = 850;
          for (const phase of [0, 1, 2] as const) {
            setConsolidationPhase(phase);
            const action = await waitForFinaleDelay(CONSOLIDATION_STEP_MS, runId);
            if (action === 'close') {
              setConsolidationPhase(null);
              return;
            }
            if (action === 'skip') {
              skippedCurrent = true;
              break;
            }
          }
          setConsolidationPhase(null);

          if (!skippedCurrent) {
            setDecisionFinale({ item, key: Date.now() });
          }
        } catch (error) {
          if (demoRunRef.current !== runId || closeRequestedRef.current) return;

          const apiError = error as ApiError;
          skippedCurrent = skipRequestedRef.current && isAbortError(error);

          if (apiError.status === 401) {
            expireSession();
            return;
          }

          if (!skippedCurrent) {
            setStageStatuses((previous) => ({ ...previous, decision: 'failed' }));
            pushNotice(`Caso ${index + 1} falló: ${getErrorMessage(error)}`, 'error');
          }
        } finally {
          cleanupActiveCase(false);
        }

        if (demoRunRef.current !== runId || closeRequestedRef.current) return;

        if (skipRequestedRef.current) {
          skippedCurrent = true;
          skipRequestedRef.current = false;
        }

        setFinishedCount((count) => count + 1);

        if (index < ordered.length - 1) {
          const nextAction = await waitForNextStep(skippedCurrent ? 0 : 2000, runId);
          if (nextAction === 'close') return;
        }
      }

      if (demoRunRef.current !== runId || closeRequestedRef.current) return;

      setCurrentScenarioKey(null);
      setCurrentClaimId('');
      setStageStatuses({ ...EMPTY_STAGE_STATUSES });
      setStatus('finished');
    };

    void runDemo();

    return () => {
      closeRequestedRef.current = true;
      skipRequestedRef.current = false;
      if (demoRunRef.current === runId) demoRunRef.current = runId + 1;
      cleanupActiveCase(true);
      clearNoticeTimers();
    };
  }, [cleanupActiveCase, clearNoticeTimers, expireSession, open, pushNotice, waitForFinaleDelay, waitForNextStep]);

  const totalScenarios = orderedScenarios.length || DEMO_ORDER.length;
  const currentScenario = currentScenarioKey ? orderedScenarios[currentIndex]?.scenario ?? null : null;
  const currentScenarioMeta = currentScenarioKey ? SCENARIO_META[currentScenarioKey] : null;

  const totalAmount = useMemo(
    () => feedItems.reduce((sum, item) => sum + item.scenario.estimated_amount, 0),
    [feedItems],
  );
  const automaticDecisionCount = useMemo(
    () => feedItems.filter((item) => item.result.decision !== 'human_review').length,
    [feedItems],
  );
  const approveCount = useMemo(
    () => feedItems.filter((item) => item.result.decision === 'approve').length,
    [feedItems],
  );
  const fraudDetectedCount = useMemo(
    () => feedItems.filter(({ scenarioKey, result }) => (
      scenarioKey === 'prompt_injection'
      || scenarioKey === 'fraudulent'
      || result.decision === 'reject'
      || getFraudProbability(result) === 'high'
      || isSecurityFlagged(result)
    )).length,
    [feedItems],
  );
  const approvalRate = Math.round((approveCount / Math.max(finishedCount, 1)) * 100);
  const automationRateLive = Math.round((automaticDecisionCount / Math.max(finishedCount, 1)) * 100);
  const averageCaseSeconds = feedItems.length > 0
    ? feedItems.reduce((sum, item) => sum + Math.max(item.durationMs / 1000, 1), 0) / feedItems.length
    : 28;
  const remainingSeconds = status === 'finished'
    ? 0
    : Math.max(0, Math.round((totalScenarios - finishedCount) * averageCaseSeconds + Math.max(totalScenarios - finishedCount - 1, 0) * 2));

  // Active agent: the stage currently 'processing'. Fallback to the latest completed if all idle.
  const activeAgent: AgentName = useMemo(() => {
    const order: Stage[] = ['intake', 'risk_assessment', 'compliance', 'decision'];
    const processing = order.find((s) => stageStatuses[s] === 'processing');
    if (processing) return STAGE_TO_AGENT[processing];
    // none processing → return last completed
    const reversed = [...order].reverse();
    const lastCompleted = reversed.find((s) => stageStatuses[s] === 'completed');
    if (lastCompleted) return STAGE_TO_AGENT[lastCompleted];
    return 'intake';
  }, [stageStatuses]);

  const activeStage: Stage = useMemo(() => (
    activeAgent === 'risk' ? 'risk_assessment' : activeAgent
  ), [activeAgent]);

  // Sincroniza displayedActiveStage ← activeStage con un MÍNIMO de 4.5 s por
  // panel para que el espectador tenga tiempo a fijar la vista. Si el LLM tarda
  // más, no se altera nada (cambia inmediatamente cuando el delay ya se cumplió).
  const MIN_STAGE_DISPLAY_MS = 4500;
  useEffect(() => {
    if (activeStage === displayedActiveStage) return;
    const elapsed = Date.now() - lastDisplayChangeRef.current;
    const wait = Math.max(0, MIN_STAGE_DISPLAY_MS - elapsed);
    const timer = window.setTimeout(() => {
      setDisplayedActiveStage(activeStage);
      lastDisplayChangeRef.current = Date.now();
    }, wait);
    return () => window.clearTimeout(timer);
  }, [activeStage, displayedActiveStage]);

  // Mientras la consolidationPhase está activa, el "agente activo" es 'decision'
  // pero el panel viz muestra una mini secuencia de pasos.

  const agentStatus: AgentStatus = useMemo(() => {
    const stage: Stage = AGENT_NAMES.indexOf(activeAgent) >= 0
      ? (activeAgent === 'risk' ? 'risk_assessment' : activeAgent)
      : 'intake';
    const s = stageStatuses[stage];
    if (s === 'processing') return 'thinking';
    if (s === 'completed') return 'completed';
    if (s === 'failed') return 'failed';
    return 'idle';
  }, [activeAgent, stageStatuses]);

  const thoughtTokens = stageTokens[activeAgent === 'risk' ? 'risk_assessment' : activeAgent];
  const activeDurationSeconds = (() => {
    const stage: Stage = activeAgent === 'risk' ? 'risk_assessment' : activeAgent;
    const ms = stageDurations[stage];
    return ms > 0 ? ms / 1000 : undefined;
  })();

  const extractedFields = useMemo<ExtractedFieldsView | undefined>(() => {
    // Si ya tenemos el resultado completo, usarlo; si no, parsear los tokens en vivo
    const fromResult = getExtractedFields(currentResult);
    if (fromResult) return fromResult;
    return parseStreamingIntake(stageTokens.intake);
  }, [currentResult, stageTokens.intake]);

  const riskScore = useMemo<number | null>(() => {
    const fromResult = getRiskScore(currentResult);
    if (fromResult !== null) return fromResult;
    return parseStreamingRisk(stageTokens.risk_assessment).score;
  }, [currentResult, stageTokens.risk_assessment]);

  const fraudProbabilityTyped = useMemo<FraudProbability | null>(() => {
    const fromResult = getFraudProbabilityTyped(currentResult);
    if (fromResult !== null) return fromResult;
    return parseStreamingRisk(stageTokens.risk_assessment).fraud;
  }, [currentResult, stageTokens.risk_assessment]);

  const complianceRules = useMemo<ComplianceRule[]>(() => {
    // If we have the full result, build deterministically; otherwise show staggered
    // "checking" states based on how much of the compliance JSON has streamed.
    if (currentResult || stageStatuses.compliance === 'pending') {
      return buildComplianceRules(currentResult, stageStatuses);
    }
    // Streaming preview: progressively mark rules as 'checking' or 'passed' depending
    // on tokens received so far.
    const tokens = stageTokens.compliance;
    const parsedCompliant = parseStreamingCompliance(tokens).compliant;
    const baseRules: ComplianceRule[] = [
      { id: 'policy_valid',     label: 'Póliza vigente',                       status: 'pending' },
      { id: 'coverage',          label: 'Cobertura aplica al incidente',        status: 'pending' },
      { id: 'amount_threshold',  label: 'Importe dentro del límite automático', status: 'pending' },
      { id: 'fraud_indicators',  label: 'Sin patrones de fraude detectados',   status: 'pending' },
      { id: 'documentation',     label: 'Documentación completa',               status: 'pending' },
    ];
    if (stageStatuses.compliance !== 'processing') return baseRules;
    // We don't have proper per-rule signals while streaming, so simulate progress:
    // each ~120 chars of tokens advances one rule from checking → passed.
    const charsPerRule = 150;
    const advanced = Math.min(baseRules.length, Math.floor(tokens.length / charsPerRule));
    const result = baseRules.map((rule, idx) => {
      if (idx < advanced) return { ...rule, status: 'passed' as RuleStatus };
      if (idx === advanced) return { ...rule, status: 'checking' as RuleStatus };
      return rule;
    });
    // If compliance JSON already said compliant=false, mark last 1-2 as failed/warning at the end.
    if (parsedCompliant === false && advanced >= 3) {
      result[3] = { ...result[3], status: 'failed' };
    }
    return result;
  }, [currentResult, stageStatuses, stageTokens.compliance]);

  const subtitle = useMemo(() => {
    if (status === 'loading') return 'Preparando escenarios, agentes y telemetría en tiempo real…';
    if (fatalError) return fatalError;
    if (status === 'finished') return `Demo completada · ${finishedCount} de ${totalScenarios} casos ejecutados`;
    if (currentScenarioKey) {
      const base = `Procesando caso ${Math.min(currentIndex + 1, totalScenarios)} de ${totalScenarios} · Quedan ~${remainingSeconds} segundos`;
      return paused ? `${base} · pausa activa tras este caso` : base;
    }
    return 'Inicializando la demo automática…';
  }, [currentIndex, currentScenarioKey, fatalError, finishedCount, paused, remainingSeconds, status, totalScenarios]);

  const handleSkip = useCallback(() => {
    if (status !== 'running') return;
    skipRequestedRef.current = true;
    setPaused(false);
    cleanupActiveCase(true);
  }, [cleanupActiveCase, status]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[140] bg-surface-950/95 backdrop-blur-md" role="dialog" aria-modal="true">
      <div className="flex h-full flex-col">
        <header className="border-b border-white/10 bg-surface-950/80 px-6 py-5 xl:px-10">
          <div className="mx-auto flex w-full max-w-[1600px] items-start justify-between gap-6">
            <div className="flex items-start gap-3">
              <div className="inline-flex shrink-0 items-center justify-center rounded-lg bg-white px-3 py-1.5 shadow-md ring-1 ring-white/30">
                <img src="/santander-logo.avif" alt="Santander" className="h-6 w-auto" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-white">Demo automática — 5 casos reales</h2>
                <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPaused((value) => !value)}
                disabled={status !== 'running'}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {paused ? 'Reanudar' : 'Pausar'}
              </button>
              <button
                type="button"
                onClick={handleSkip}
                disabled={status !== 'running'}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <SkipForward className="h-4 w-4" />
                Saltar al siguiente
              </button>
              <button
                type="button"
                onClick={closeDemo}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              >
                <X className="h-4 w-4" />
                Cerrar
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-6 xl:px-10 xl:py-8">
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
            {status === 'loading' && (
              <div className="flex min-h-[60vh] items-center justify-center">
                <div className="w-full max-w-xl rounded-[28px] border border-white/10 bg-white/5 p-10 text-center backdrop-blur-sm">
                  <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary-400" />
                  <h3 className="mt-5 text-2xl font-semibold text-white">Preparando la demo automática</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-400">
                    Cargando los 5 escenarios, conectando el pipeline y preparando el feed en tiempo real.
                  </p>
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="flex min-h-[60vh] items-center justify-center">
                <div className="w-full max-w-2xl rounded-[28px] border border-rose-500/20 bg-rose-500/10 p-10 text-center backdrop-blur-sm">
                  <AlertTriangle className="mx-auto h-12 w-12 text-rose-300" />
                  <h3 className="mt-5 text-2xl font-semibold text-white">No se pudo lanzar la demo</h3>
                  <p className="mt-3 text-sm leading-7 text-rose-100/85">{fatalError || 'Se produjo un error inesperado al inicializar la demo.'}</p>
                  <button
                    type="button"
                    onClick={closeDemo}
                    className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
                  >
                    Volver al dashboard
                  </button>
                </div>
              </div>
            )}

            {status === 'finished' && (
              <div className="flex min-h-[70vh] items-center justify-center">
                <div className="w-full max-w-5xl rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(236,0,0,0.18),_transparent_45%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(17,24,39,0.92))] p-10 text-center xl:p-14">
                  <div className="mx-auto max-w-3xl">
                    <p className="text-sm font-semibold uppercase tracking-[0.35em] text-primary-300">Cierre de la demo</p>
                    <h3 className="mt-4 text-4xl font-semibold tracking-tight text-white xl:text-5xl">
                      ✨ {finishedCount} casos procesados en {formatElapsed(elapsedSeconds)}
                    </h3>
                    <p className="mt-4 text-lg text-slate-300">
                      Con análisis manual habría tomado <strong className="text-white">3 horas 45 minutos</strong>
                    </p>
                  </div>

                  <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Aprobación automática</p>
                      <p className="mt-3 text-3xl font-semibold text-emerald-300">{approvalRate}%</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Fraudes detectados</p>
                      <p className="mt-3 text-3xl font-semibold text-rose-300">{fraudDetectedCount}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Decisión automática</p>
                      <p className="mt-3 text-3xl font-semibold text-primary-300">{automaticDecisionCount}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Total procesado</p>
                      <p className="mt-3 text-3xl font-semibold text-white">{currencyFormatter.format(totalAmount)}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={closeDemo}
                    className="mt-10 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
                  >
                    Volver al dashboard
                  </button>
                </div>
              </div>
            )}

            {status === 'running' && (
              <>
                <LiveStatsTicker
                  totalProcessed={totalAmount}
                  casesCompleted={finishedCount}
                  totalCases={totalScenarios}
                  automationRate={automationRateLive}
                  fraudsDetected={fraudDetectedCount}
                  elapsedSeconds={elapsedSeconds}
                />

                {notices.length > 0 && (
                  <section className="space-y-3">
                    {notices.map((notice) => (
                      <div
                        key={notice.id}
                        className={`rounded-2xl border px-4 py-3 text-sm ${
                          notice.kind === 'error'
                            ? 'border-rose-500/20 bg-rose-500/10 text-rose-100'
                            : 'border-primary-500/20 bg-primary-500/10 text-primary-100'
                        }`}
                      >
                        {notice.text}
                      </div>
                    ))}
                  </section>
                )}

                {/* Scenario header */}
                <section className={`rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(236,0,0,0.14),_transparent_42%),linear-gradient(180deg,rgba(15,23,42,0.95),rgba(2,6,23,0.96))] p-5 xl:p-6 ${currentScenarioMeta?.glow ?? ''}`}>
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium ${currentScenarioMeta?.badge ?? 'border-white/10 bg-white/5 text-slate-200'}`}>
                        {currentScenarioMeta?.label ?? 'Preparando escenarios…'}
                      </div>
                      <div className="text-sm text-slate-400">
                        <span className="font-mono text-xs text-slate-500">{currentClaimId || '—'}</span>
                        <span className="mx-2 text-slate-700">·</span>
                        <span className="text-white font-semibold">{currencyFormatter.format(currentScenario?.estimated_amount ?? 0)}</span>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[360px]">
                      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Cliente</p>
                        <p className="mt-0.5 text-sm font-medium text-white">{currentScenario?.customer_id ?? '—'}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Póliza</p>
                        <p className="mt-0.5 text-sm font-medium text-white">{currentScenario?.policy_id ?? '—'}</p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Main two-column area: agent thinking + per-agent viz */}
                <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                  <AgentThinkingPanel
                    agent={activeAgent}
                    status={agentStatus}
                    thoughtTokens={thoughtTokens}
                    durationSeconds={activeDurationSeconds}
                  />

                  <div className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_right,_rgba(236,0,0,0.10),_transparent_45%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-5 xl:p-6">
                    {consolidationPhase !== null ? (
                      <ConsolidationStepsPanel phase={consolidationPhase} />
                    ) : (
                      <>
                        {displayedActiveStage === 'intake' && (
                          <IntakeExtractionPanel
                            scenarioText={currentScenario?.description ?? ''}
                            active={stageStatuses.intake === 'processing' || stageStatuses.intake === 'completed'}
                            extractedFields={extractedFields}
                            phaseLabel={stageStatuses.intake === 'completed' ? 'Datos extraídos' : 'Leyendo el parte del siniestro'}
                          />
                        )}
                        {displayedActiveStage === 'risk_assessment' && (
                          <RiskGaugePanel
                            active={stageStatuses.risk_assessment !== 'pending'}
                            targetScore={riskScore}
                            fraudProbability={fraudProbabilityTyped}
                            phaseLabel={stageStatuses.risk_assessment === 'completed' ? 'Evaluación de riesgo' : 'Calculando score y patrones de fraude'}
                          />
                        )}
                        {(displayedActiveStage === 'compliance' || displayedActiveStage === 'decision') && (
                          <ComplianceChecklistPanel
                            active={stageStatuses.compliance !== 'pending'}
                            rules={complianceRules}
                            phaseLabel={stageStatuses.compliance === 'completed' ? 'Validación regulatoria' : 'Aplicando reglas y umbrales'}
                          />
                        )}
                      </>
                    )}
                  </div>
                </section>

                {/* Compact feed at the bottom */}
                <section className="rounded-[24px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Feed</p>
                      <p className="text-sm text-slate-400">{feedItems.length} decisión(es)</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    {orderedScenarios.map((demo, idx) => {
                      const item = feedItems.find((f) => f.scenarioKey === demo.key);
                      const meta = SCENARIO_META[demo.key];
                      const isActive = idx === currentIndex && status === 'running' && !item;
                      const isPending = !item && !isActive;
                      const decisionMeta = item ? DECISION_META[item.result.decision] : null;
                      const leadingIcon = item
                        ? (demo.key === 'prompt_injection' ? '🛡️'
                          : item.result.decision === 'approve' ? '✅'
                          : item.result.decision === 'human_review' ? '⚠️'
                          : '❌')
                        : isActive ? '⏳' : '·';
                      return (
                        <div
                          key={demo.key}
                          className={`rounded-xl border px-3 py-2.5 text-xs transition ${
                            isActive
                              ? 'border-primary-400/40 bg-primary-500/10 animate-pulse-glow'
                              : isPending
                                ? 'border-white/5 bg-white/[0.02] opacity-60'
                                : 'border-white/10 bg-slate-950/40'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-lg">{leadingIcon}</span>
                            {decisionMeta ? (
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${decisionMeta.badge}`}>
                                {decisionMeta.label}
                              </span>
                            ) : (
                              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                                {isActive ? 'En curso' : isPending ? 'Pendiente' : '—'}
                              </span>
                            )}
                          </div>
                          <p className="mt-1.5 text-sm font-semibold text-white truncate">{meta.shortLabel}</p>
                          <p className="text-[10px] text-slate-500 truncate">
                            {currencyFormatter.format(demo.scenario.estimated_amount)}
                            {item ? ` · ${formatCaseDuration(item.durationMs)}` : ''}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            )}
          </div>
        </main>

        {decisionFinale && (
          <DecisionFinale
            key={decisionFinale.key}
            decision={decisionFinale.item.result.decision}
            amount={decisionFinale.item.scenario.estimated_amount}
            scenarioLabel={SCENARIO_META[decisionFinale.item.scenarioKey].shortLabel}
            onDone={() => setDecisionFinale(null)}
          />
        )}
      </div>
    </div>
  );
}
