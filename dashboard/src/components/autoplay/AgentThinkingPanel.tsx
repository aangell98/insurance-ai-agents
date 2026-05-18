import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const AGENT_META: Record<AgentName, AgentMeta> = {
  intake: {
    icon: FileSearch,
    title: 'Agente de Extracción',
    role: 'Extrae y estructura datos del parte.',
    accentClasses: 'text-sky-200',
    haloClasses: 'from-sky-500/18 via-violet-500/14 to-teal-400/18',
  },
  risk: {
    icon: ShieldAlert,
    title: 'Agente de Riesgo',
    role: 'Evalúa probabilidad de fraude y riesgo.',
    accentClasses: 'text-rose-200',
    haloClasses: 'from-rose-500/18 via-violet-500/12 to-orange-400/14',
  },
  compliance: {
    icon: Scale,
    title: 'Agente de Compliance',
    role: 'Verifica cobertura, reglas y cumplimiento regulatorio.',
    accentClasses: 'text-amber-200',
    haloClasses: 'from-amber-500/18 via-violet-500/12 to-cyan-400/16',
  },
  decision: {
    icon: CheckCircle2,
    title: 'Decisión Final',
    role: 'Consolida señales y emite la resolución final del caso.',
    accentClasses: 'text-emerald-200',
    haloClasses: 'from-emerald-500/18 via-sky-500/12 to-teal-400/16',
  },
};

const STATUS_CLASSES: Record<AgentStatus, string> = {
  idle: 'border-white/10 bg-white/5 text-slate-300',
  thinking: 'border-cyan-300/20 bg-cyan-400/10 text-cyan-100',
  completed: 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100',
  failed: 'border-rose-300/20 bg-rose-400/10 text-rose-100',
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

export default function AgentThinkingPanel({
  agent,
  status,
  thoughtTokens,
  durationSeconds,
}: AgentThinkingPanelProps) {
  const { icon: Icon, title, role, accentClasses, haloClasses } = AGENT_META[agent];
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showTopFade, setShowTopFade] = useState(false);
  const hasThoughts = thoughtTokens.trim().length > 0;

  const updateOverflow = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const hasOverflow = container.scrollHeight > container.clientHeight + 2;
    setShowTopFade(hasOverflow && container.scrollTop > 4);
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const frameId = window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
      updateOverflow();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [thoughtTokens, status, updateOverflow]);

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
              <h2 className="mt-3 bg-gradient-to-r from-white via-violet-100 to-teal-100 bg-clip-text text-3xl font-semibold tracking-tight text-transparent md:text-4xl">
                {title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{role}</p>
            </div>
          </div>

          <div className={`inline-flex items-center self-start rounded-full border px-4 py-2 text-sm font-medium shadow-inner shadow-white/5 ${STATUS_CLASSES[status]}`}>
            {getStatusLabel(status, durationSeconds)}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-surface-800/70 shadow-inner shadow-black/25">
          <div
            ref={scrollRef}
            style={scrollMaskStyle}
            className="min-h-[180px] max-h-[400px] overflow-y-auto px-6 py-6"
          >
            {!hasThoughts && status === 'thinking' ? (
              <div className="flex min-h-[132px] items-center gap-2 text-cyan-200">
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="h-3 w-3 rounded-full bg-cyan-300/90 animate-pulse-soft"
                    style={{ animationDelay: `${dot * 0.18}s` }}
                  />
                ))}
              </div>
            ) : hasThoughts ? (
              <p className="whitespace-pre-wrap text-[15px] leading-7 text-slate-100">
                {thoughtTokens}
                {status === 'thinking' ? <span className="ml-1 animate-blink text-cyan-300">▌</span> : null}
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
