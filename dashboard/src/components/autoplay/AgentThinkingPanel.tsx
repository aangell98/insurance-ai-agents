import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, FileSearch, Scale, ShieldAlert } from 'lucide-react';

export type AgentName = 'intake' | 'risk' | 'compliance' | 'decision';
export type AgentStatus = 'idle' | 'thinking' | 'completed' | 'failed';

export interface AgentThinkingPanelProps {
  agent: AgentName;
  status: AgentStatus;
  thoughtTokens: string;
  durationSeconds?: number;
}

interface AgentMeta {
  icon: LucideIcon;
  title: string;
  role: string;
  accentClasses: string;
  haloClasses: string;
}

interface ParseSuccess {
  ok: true;
  value: unknown;
}

interface ParseFailure {
  ok: false;
}

type ParseResult = ParseSuccess | ParseFailure;

interface DetectedField {
  key: string;
  path: string;
  depth: 0 | 1;
  label: string;
  value: unknown;
  rawValue: string;
}

const AGENT_META: Record<AgentName, AgentMeta> = {
  intake: {
    icon: FileSearch,
    title: 'Agente de Extracción',
    role: 'Extrae y estructura datos del parte.',
    accentClasses: 'text-primary-200',
    haloClasses: 'from-primary-500/18 via-primary-400/14 to-primary-600/18',
  },
  risk: {
    icon: ShieldAlert,
    title: 'Agente de Riesgo',
    role: 'Evalúa probabilidad de fraude y riesgo.',
    accentClasses: 'text-primary-100',
    haloClasses: 'from-primary-600/18 via-primary-500/14 to-primary-700/18',
  },
  compliance: {
    icon: Scale,
    title: 'Agente de Compliance',
    role: 'Verifica cobertura, reglas y cumplimiento regulatorio.',
    accentClasses: 'text-primary-200',
    haloClasses: 'from-primary-500/16 via-primary-400/12 to-primary-600/16',
  },
  decision: {
    icon: CheckCircle2,
    title: 'Decisión Final',
    role: 'Consolida señales y emite la resolución final del caso.',
    accentClasses: 'text-primary-100',
    haloClasses: 'from-primary-400/18 via-primary-500/12 to-primary-600/18',
  },
};

const STATUS_CLASSES: Record<AgentStatus, string> = {
  idle: 'border-white/10 bg-white/5 text-slate-300',
  thinking: 'border-primary-300/30 bg-primary-500/12 text-primary-100',
  completed: 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100',
  failed: 'border-rose-300/20 bg-rose-400/10 text-rose-100',
};

const EMPTY_THINKING_MESSAGES = [
  'Consultando Azure OpenAI…',
  'Cargando contexto del caso…',
  'Razonando sobre el siniestro…',
] as const;

const EXPANDABLE_FIELDS = new Set(['extracted_data', 'rules_applied']);

const JSON_KEY_PATTERN = /"([a-z0-9_]+)"\s*:/i;

const FIELD_LABELS: Record<string, string> = {
  claim_id: 'ID de siniestro',
  policy_valid: 'Póliza válida',
  policy_number: 'Nº de póliza',
  severity: 'Severidad',
  extracted_data: 'Datos extraídos',
  incident_type: 'Tipo de incidente',
  vehicle: 'Vehículo',
  date_of_incident: 'Fecha',
  location: 'Ubicación',
  damages_described: 'Daños',
  estimated_amount: 'Monto estimado',
  witnesses: 'Testigos',
  risk_score: 'Risk Score',
  fraud_probability: 'Prob. de fraude',
  risk_factors: 'Factores',
  reasoning: 'Razonamiento',
  compliant: 'Cumple normativa',
  decision: 'Decisión',
  regulations_checked: 'Regulaciones',
  rules_applied: 'Reglas aplicadas',
  coverage_status: 'Cobertura',
  summary: 'Resumen',
  confidence: 'Confianza',
  payout_recommendation: 'Pago recomendado',
  next_action: 'Siguiente acción',
  claim_type: 'Tipo de reclamación',
};

function formatDuration(durationSeconds?: number) {
  if (typeof durationSeconds !== 'number' || Number.isNaN(durationSeconds)) return null;
  return `${durationSeconds.toFixed(1)}s`;
}

function getStatusLabel(status: AgentStatus, durationSeconds?: number) {
  if (status === 'thinking') return '💭 Pensando...';
  if (status === 'completed') {
    const durationLabel = formatDuration(durationSeconds);
    return durationLabel ? `✓ Completado en ${durationLabel}` : '✓ Completado';
  }
  if (status === 'failed') return '⚠ Error';
  return 'Listo para arrancar';
}

function getPlaceholder(status: AgentStatus) {
  if (status === 'failed') return 'El razonamiento del agente no pudo completarse.';
  if (status === 'completed') return 'El agente terminó sin emitir trazas adicionales.';
  return 'Esperando tokens del orquestador para comenzar el razonamiento.';
}

function humanizeKey(key: string) {
  return key
    .split('_')
    .filter(Boolean)
    .map((part, index) => {
      if (index === 0) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      }

      return part;
    })
    .join(' ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeParseJson(text: string): ParseResult {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function looksLikeJsonStream(text: string) {
  const trimmed = text.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[') || JSON_KEY_PATTERN.test(text);
}

function skipWhitespace(source: string, startIndex: number) {
  let index = startIndex;
  while (index < source.length && /\s/.test(source[index] ?? '')) {
    index += 1;
  }

  return index;
}

function trimEndIndex(source: string) {
  let index = source.length;
  while (index > 0 && /\s/.test(source[index - 1] ?? '')) {
    index -= 1;
  }

  return index;
}

function readJsonString(source: string, startIndex: number) {
  if (source[startIndex] !== '"') return null;

  let escaped = false;
  for (let index = startIndex + 1; index < source.length; index += 1) {
    const char = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      const parsed = safeParseJson(source.slice(startIndex, index + 1));
      if (parsed.ok && typeof parsed.value === 'string') {
        return {
          end: index + 1,
          value: parsed.value,
        };
      }

      return null;
    }
  }

  return null;
}

function findJsonValueEnd(source: string, startIndex: number) {
  let inString = false;
  let escaped = false;
  let objectDepth = 0;
  let arrayDepth = 0;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];

    if (!inString && objectDepth === 0 && arrayDepth === 0 && (char === ',' || char === '}')) {
      return {
        complete: true,
        end: index,
      };
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      objectDepth += 1;
      continue;
    }

    if (char === '}') {
      if (objectDepth > 0) {
        objectDepth -= 1;
      }
      continue;
    }

    if (char === '[') {
      arrayDepth += 1;
      continue;
    }

    if (char === ']') {
      if (arrayDepth > 0) {
        arrayDepth -= 1;
      }
    }
  }

  const end = trimEndIndex(source);
  const candidate = source.slice(startIndex, end).trim();
  if (!inString && objectDepth === 0 && arrayDepth === 0 && candidate.length > 0 && safeParseJson(candidate).ok) {
    return {
      complete: true,
      end,
    };
  }

  return {
    complete: false,
    end: startIndex,
  };
}

function buildField(path: string, key: string, depth: 0 | 1, rawValue: string, value: unknown): DetectedField {
  return {
    depth,
    key,
    label: FIELD_LABELS[key] ?? humanizeKey(key),
    path,
    rawValue,
    value,
  };
}

function expandObjectField(parentKey: string, value: unknown): DetectedField[] {
  if (!EXPANDABLE_FIELDS.has(parentKey) || !isRecord(value)) return [];

  return Object.entries(value).map(([childKey, childValue]) =>
    buildField(
      `${parentKey}.${childKey}`,
      childKey,
      1,
      JSON.stringify(childValue),
      childValue,
    ),
  );
}

function extractDetectedFields(text: string): DetectedField[] {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith('{')) return [];

  const fields: DetectedField[] = [];
  let index = skipWhitespace(trimmed, 1);

  while (index < trimmed.length) {
    if (trimmed[index] === '}') {
      break;
    }

    const keyToken = readJsonString(trimmed, index);
    if (!keyToken) {
      break;
    }

    index = skipWhitespace(trimmed, keyToken.end);
    if (trimmed[index] !== ':') {
      break;
    }

    index = skipWhitespace(trimmed, index + 1);

    const valueBoundary = findJsonValueEnd(trimmed, index);
    if (!valueBoundary.complete) {
      break;
    }

    const rawValue = trimmed.slice(index, valueBoundary.end).trim();
    const parsedValue = safeParseJson(rawValue);
    const value = parsedValue.ok ? parsedValue.value : rawValue;

    fields.push(buildField(keyToken.value, keyToken.value, 0, rawValue, value));
    fields.push(...expandObjectField(keyToken.value, value));

    index = skipWhitespace(trimmed, valueBoundary.end);
    if (trimmed[index] === ',') {
      index = skipWhitespace(trimmed, index + 1);
      continue;
    }

    if (trimmed[index] === '}') {
      break;
    }
  }

  return fields;
}

function formatNumericValue(value: number) {
  return new Intl.NumberFormat('es-ES', {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatDetectedValue(field: DetectedField) {
  const { value, rawValue } = field;

  if (typeof value === 'string') return value;
  if (typeof value === 'number') return formatNumericValue(value);
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  if (value === null) return '—';
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? 'item' : 'items'}`;
  if (isRecord(value)) return `${Object.keys(value).length} campos`;

  const compact = rawValue.replace(/\s+/g, ' ').trim();
  return compact.length > 72 ? `${compact.slice(0, 69)}…` : compact;
}

function getSummaryValue(parsedJson: ParseResult, fields: DetectedField[], key: string) {
  if (parsedJson.ok && isRecord(parsedJson.value) && key in parsedJson.value) {
    return parsedJson.value[key];
  }

  return fields.find((field) => field.depth === 0 && field.key === key)?.value;
}

function formatRiskScore(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value.toFixed(1).replace(/\.0$/, '')}/10`;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value.includes('/10') ? value : `${value}/10`;
  }

  return null;
}

function buildCompletedSummary(parsedJson: ParseResult, fields: DetectedField[]) {
  const lines: string[] = [];
  const decision = getSummaryValue(parsedJson, fields, 'decision');
  const riskScore = getSummaryValue(parsedJson, fields, 'risk_score');
  const compliant = getSummaryValue(parsedJson, fields, 'compliant');

  if (typeof decision === 'string' && decision.trim().length > 0) {
    lines.push(`Decisión: ${decision}`);
  }

  const formattedRiskScore = formatRiskScore(riskScore);
  if (formattedRiskScore) {
    lines.push(`Risk score: ${formattedRiskScore}`);
  }

  if (typeof compliant === 'boolean') {
    lines.push(`Cumple normativa ${compliant ? '✓' : '✗'}`);
  }

  return lines;
}

export default function AgentThinkingPanel({
  agent,
  status,
  thoughtTokens,
  durationSeconds,
}: AgentThinkingPanelProps) {
  const { icon: Icon, title, role, accentClasses, haloClasses } = AGENT_META[agent];
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showTopFade, setShowTopFade] = useState(false);
  const [thinkingMessageIndex, setThinkingMessageIndex] = useState(0);
  const hasThoughts = thoughtTokens.trim().length > 0;

  const isJsonMode = useMemo(() => looksLikeJsonStream(thoughtTokens), [thoughtTokens]);
  const parsedJson = useMemo(() => {
    if (!isJsonMode) return { ok: false } satisfies ParseFailure;
    return safeParseJson(thoughtTokens.trim());
  }, [isJsonMode, thoughtTokens]);
  const detectedFields = useMemo(() => (isJsonMode ? extractDetectedFields(thoughtTokens) : []), [isJsonMode, thoughtTokens]);
  const completedSummary = useMemo(
    () => (status === 'completed' ? buildCompletedSummary(parsedJson, detectedFields) : []),
    [detectedFields, parsedJson, status],
  );
  const durationLabel = formatDuration(durationSeconds);
  const showJsonFields = isJsonMode && detectedFields.length > 0;
  const showJsonLoading = isJsonMode && hasThoughts && status === 'thinking' && detectedFields.length === 0;

  const updateOverflow = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const hasOverflow = container.scrollHeight > container.clientHeight + 2;
    setShowTopFade(hasOverflow && container.scrollTop > 4);
  }, []);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const frameId = window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
      updateOverflow();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [detectedFields.length, thoughtTokens, status, updateOverflow]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => updateOverflow();
    handleScroll();
    container.addEventListener('scroll', handleScroll);

    if (typeof ResizeObserver === 'undefined') {
      return () => container.removeEventListener('scroll', handleScroll);
    }

    const resizeObserver = new ResizeObserver(() => handleScroll());
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
    };
  }, [updateOverflow]);

  useEffect(() => {
    if (status !== 'thinking' || hasThoughts) {
      setThinkingMessageIndex(0);
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setThinkingMessageIndex((current) => (current + 1) % EMPTY_THINKING_MESSAGES.length);
    }, 1500);

    return () => window.clearInterval(intervalId);
  }, [hasThoughts, status]);

  const scrollMaskStyle = useMemo<CSSProperties | undefined>(() => {
    if (!showTopFade) return undefined;

    return {
      WebkitMaskImage: 'linear-gradient(to bottom, transparent 0px, black 28px, black 100%)',
      maskImage: 'linear-gradient(to bottom, transparent 0px, black 28px, black 100%)',
    };
  }, [showTopFade]);

  return (
    <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-surface-900 via-surface-900/95 to-surface-950 p-7 shadow-2xl shadow-black/35 md:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_42%)]" />
      <div className={`pointer-events-none absolute -left-20 top-0 h-56 w-56 rounded-full bg-gradient-to-br blur-3xl ${haloClasses}`} />

      <div className="relative flex flex-col gap-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-5">
            <div
              className={[
                'flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-surface-800/95 via-surface-900 to-surface-950 shadow-[0_0_42px_rgba(15,23,42,0.45)]',
                status === 'thinking' ? 'animate-agent-glow' : '',
              ].join(' ')}
            >
              <div className={`flex h-[4.3rem] w-[4.3rem] items-center justify-center rounded-full bg-gradient-to-br ${haloClasses} ${accentClasses}`}>
                <Icon className="h-9 w-9" />
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Agente activo</p>
              <h2 className="mt-3 bg-gradient-to-r from-white via-primary-100 to-primary-200 bg-clip-text text-3xl font-semibold tracking-tight text-transparent md:text-4xl">
                {title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{role}</p>
            </div>
          </div>

          {status === 'completed' ? (
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-emerald-50 shadow-inner shadow-white/5 lg:min-w-[260px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-100/70">Resumen</p>
              <div className="mt-2 space-y-1.5 text-sm font-medium leading-6">
                {completedSummary.length > 0 ? (
                  completedSummary.map((line) => <p key={line}>{line}</p>)
                ) : (
                  <p>✓ Completado</p>
                )}
              </div>
              <p className="mt-3 text-xs text-emerald-100/70">{durationLabel ? `Completado en ${durationLabel}` : 'Completado'}</p>
            </div>
          ) : (
            <div className={`inline-flex items-center self-start rounded-full border px-4 py-2 text-sm font-medium shadow-inner shadow-white/5 ${STATUS_CLASSES[status]}`}>
              {getStatusLabel(status, durationSeconds)}
            </div>
          )}
        </div>

        <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-surface-800/70 shadow-inner shadow-black/25">
          <div
            ref={scrollRef}
            style={scrollMaskStyle}
            className="scrollbar-clean min-h-[180px] max-h-[400px] overflow-y-auto px-6 py-6"
          >
            {!hasThoughts && status === 'thinking' ? (
              <div className="flex min-h-[132px] flex-col justify-center gap-4 text-primary-100">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">{EMPTY_THINKING_MESSAGES[thinkingMessageIndex]}</span>
                  <div className="flex items-center gap-2 text-primary-200">
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        className="h-2.5 w-2.5 rounded-full bg-primary-300/90 animate-pulse-soft"
                        style={{ animationDelay: `${dot * 0.18}s` }}
                      />
                    ))}
                  </div>
                </div>
                <p className="max-w-xl text-sm leading-6 text-slate-400">
                  Mostraremos la traza del agente en cuanto empiecen a llegar tokens útiles.
                </p>
              </div>
            ) : showJsonFields ? (
              <div className="space-y-3">
                {detectedFields.map((field) => (
                  <div
                    key={field.path}
                    className={[
                      'animate-slide-in-right rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 shadow-[0_10px_30px_rgba(2,6,23,0.18)]',
                      field.depth === 1 ? 'ml-7 border-primary-500/20 bg-primary-500/5' : 'border-white/8',
                    ].join(' ')}
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className={field.depth === 1 ? 'text-[13px] font-medium text-primary-100' : 'text-sm font-semibold text-slate-100'}>
                            {field.label}
                          </span>
                          <span className="break-words text-[13px] leading-6 text-slate-300">{formatDetectedValue(field)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {status === 'thinking' ? (
                  <div className="flex items-center gap-2 px-1 pt-1 text-xs font-medium text-primary-200/85">
                    <span className="h-2 w-2 rounded-full bg-primary-300 animate-pulse-soft" />
                    Recibiendo más campos del análisis…
                  </div>
                ) : null}
              </div>
            ) : showJsonLoading ? (
              <div className="flex min-h-[132px] flex-col justify-center gap-3 text-primary-100">
                <div className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-primary-300 animate-pulse-soft" />
                  <span className="text-sm font-medium">Transformando salida estructurada en un resumen legible…</span>
                </div>
                <p className="max-w-xl text-sm leading-6 text-slate-400">
                  Los tokens ya están entrando. Iremos mostrando cada campo cuando quede cerrado.
                </p>
              </div>
            ) : hasThoughts ? (
              <p className="whitespace-pre-wrap text-[15px] leading-7 text-slate-100">
                {thoughtTokens}
                {status === 'thinking' ? <span className="ml-1 animate-blink text-primary-400">▌</span> : null}
              </p>
            ) : (
              <div className="flex min-h-[132px] items-center text-sm leading-6 text-slate-500">
                {getPlaceholder(status)}
              </div>
            )}
          </div>

          {showTopFade ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-surface-900 via-surface-900/70 to-transparent" />
          ) : null}
        </div>
      </div>
    </section>
  );
}
