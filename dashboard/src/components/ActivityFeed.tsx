import { useEffect, useRef } from 'react';
import { Bot, Brain, CheckCircle2, Clock, AlertTriangle, Search, ShieldAlert, Scale, Gavel } from 'lucide-react';

export interface ActivityEvent {
  stage: string;
  status: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

interface Props {
  events: ActivityEvent[];
}

const stageConfig: Record<string, { label: string; icon: typeof Bot; thinkingMsg: string }> = {
  intake: {
    label: 'Claims Intake Agent',
    icon: Search,
    thinkingMsg: 'Leyendo la descripción del siniestro, verificando la póliza en el sistema, extrayendo datos clave y clasificando la severidad...',
  },
  risk_assessment: {
    label: 'Risk & Fraud Agent',
    icon: ShieldAlert,
    thinkingMsg: 'Consultando el historial de reclamaciones del cliente, comparando con patrones de fraude conocidos, calculando el score de riesgo...',
  },
  compliance: {
    label: 'Compliance Agent',
    icon: Scale,
    thinkingMsg: 'Verificando contra la normativa vigente (EU Insurance Directive, DGS, EU AI Act), validando umbrales regulatorios...',
  },
  decision: {
    label: 'Decisión Final',
    icon: Gavel,
    thinkingMsg: 'Agregando el análisis de los tres agentes especializados y aplicando las reglas de negocio...',
  },
};

function formatTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

/** Extract the real AI reasoning from agent results */
function extractInsight(stage: string, data: Record<string, unknown>): { summary: string; details: string[] } | null {
  if (!data || Object.keys(data).length === 0) return null;

  if (stage === 'intake') {
    const details: string[] = [];
    if (data.policy_valid !== undefined) details.push(data.policy_valid ? '✓ Póliza verificada y activa' : '✗ Póliza no válida');
    if (data.severity) details.push(`Severidad: ${data.severity === 'high' ? 'alta' : data.severity === 'medium' ? 'media' : 'baja'}`);
    const extracted = data.extracted_data as Record<string, unknown> | undefined;
    if (extracted?.incident_type) details.push(`Tipo: ${extracted.incident_type}`);
    if (extracted?.estimated_amount) details.push(`Monto: ${Number(extracted.estimated_amount).toLocaleString('es-ES')}€`);
    const summary = (data.summary as string) || '';
    return { summary, details };
  }

  if (stage === 'risk_assessment') {
    const details: string[] = [];
    const score = data.risk_score as number;
    const fraud = data.fraud_probability as string;
    if (score !== undefined) details.push(`Risk score: ${score}/10 ${score <= 4 ? '(bajo)' : score <= 7 ? '(medio)' : '(alto)'}`);
    if (fraud) {
      const label = { low: 'baja', medium: 'media', high: 'alta' }[fraud] || fraud;
      details.push(`Probabilidad de fraude: ${label}`);
    }
    const factors = data.risk_factors as Array<Record<string, unknown>> | undefined;
    if (factors?.length) {
      const negatives = factors.filter(f => f.impact === 'negative').map(f => f.factor as string);
      const positives = factors.filter(f => f.impact === 'positive').map(f => f.factor as string);
      if (positives.length) details.push(`Factores positivos: ${positives.join(', ')}`);
      if (negatives.length) details.push(`Factores de riesgo: ${negatives.join(', ')}`);
    }
    const reasoning = (data.reasoning as string) || '';
    return { summary: reasoning, details };
  }

  if (stage === 'compliance') {
    const details: string[] = [];
    const decision = data.decision as string;
    if (decision) {
      const label = { approve: 'Aprobación automática', human_review: 'Revisión humana requerida', reject: 'Rechazo' }[decision] || decision;
      details.push(`Recomendación: ${label}`);
    }
    const regs = data.regulations_checked as string[] | undefined;
    if (regs?.length) details.push(`Regulaciones verificadas: ${regs.join(', ')}`);
    const reasoning = (data.reasoning as string) || '';
    return { summary: reasoning, details };
  }

  if (stage === 'decision') {
    const decision = data.decision as string;
    const confidence = data.confidence as number;
    const reasoning = (data.reasoning as string) || '';
    const details: string[] = [];
    if (decision) {
      const label = { approve: '✅ APROBADO', human_review: '⚠️ REVISIÓN HUMANA', reject: '❌ RECHAZADO' }[decision] || decision;
      details.push(`${label} — ${((confidence || 0) * 100).toFixed(0)}% confianza`);
    }
    return { summary: reasoning, details };
  }

  return null;
}

export default function ActivityFeed({ events }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  if (events.length === 0) return null;

  return (
    <div className="bg-surface-900 rounded-xl border border-gray-800 p-5 animate-slide-in">
      <div className="flex items-center gap-2 mb-4">
        <Brain className="w-4 h-4 text-primary-400" />
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Razonamiento de los Agentes</h3>
      </div>
      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
        {events.map((ev, i) => {
          const config = stageConfig[ev.stage] || { label: ev.stage, icon: Bot, thinkingMsg: 'Procesando...' };
          const Icon = config.icon;
          const isProcessing = ev.status === 'processing';
          const isCompleted = ev.status === 'completed';
          const insight = isCompleted && ev.data ? extractInsight(ev.stage, ev.data) : null;

          return (
            <div key={i} className={`rounded-lg transition-all duration-500 ${isProcessing ? 'bg-primary-900/20 border border-primary-800/50' : isCompleted ? 'bg-surface-800/60 border border-gray-700/50' : 'bg-red-900/20 border border-red-800/50'}`}>
              {/* Header */}
              <div className="flex items-center gap-2 px-4 py-2.5">
                <div className={`p-1 rounded ${isProcessing ? 'bg-primary-800/40' : isCompleted ? 'bg-green-800/30' : 'bg-red-800/30'}`}>
                  <Icon className={`w-3.5 h-3.5 ${isProcessing ? 'text-primary-400' : isCompleted ? 'text-green-400' : 'text-red-400'}`} />
                </div>
                <span className={`text-xs font-semibold ${isProcessing ? 'text-primary-300' : isCompleted ? 'text-green-300' : 'text-red-300'}`}>
                  {config.label}
                </span>
                <span className="text-[10px] text-gray-600 ml-auto">{formatTime(ev.timestamp)}</span>
                {isProcessing && <Clock className="w-3 h-3 text-primary-400 animate-pulse" />}
                {isCompleted && <CheckCircle2 className="w-3 h-3 text-green-400" />}
              </div>

              {/* Body — thinking or results */}
              <div className="px-4 pb-3">
                {isProcessing && (
                  <p className="text-xs text-gray-400 italic animate-pulse">{config.thinkingMsg}</p>
                )}

                {isCompleted && insight && (
                  <div className="space-y-2">
                    {/* Key findings as tags */}
                    {insight.details.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {insight.details.map((d, j) => (
                          <span key={j} className="inline-flex items-center px-2 py-0.5 text-[11px] rounded-md bg-surface-900/80 text-gray-300 border border-gray-700/50">
                            {d}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* AI reasoning text */}
                    {insight.summary && (
                      <p className="text-xs text-gray-400 leading-relaxed border-l-2 border-gray-700 pl-3 mt-1">
                        {insight.summary}
                      </p>
                    )}
                  </div>
                )}

                {!isProcessing && !isCompleted && (
                  <p className="text-xs text-red-400">Error en el procesamiento del agente</p>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
