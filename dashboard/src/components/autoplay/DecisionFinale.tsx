import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, Users, XCircle } from 'lucide-react';

export interface DecisionFinaleProps {
  decision: 'approve' | 'human_review' | 'reject';
  amount: number;
  scenarioLabel: string;
  onDone?: () => void;
}

interface DecisionMeta {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  tintClass: string;
  cardClass: string;
  badgeClass: string;
  iconShellClass: string;
  titleGradient: string;
}

interface ConfettiParticle {
  id: number;
  left: number;
  size: number;
  height: number;
  delay: number;
  duration: number;
  drift: number;
  rotate: number;
  colorClass: string;
  borderRadius: string;
}

const CONFETTI_COLORS = ['bg-green-400', 'bg-emerald-400', 'bg-teal-400', 'bg-lime-400', 'bg-yellow-400'] as const;

const DECISION_META: Record<DecisionFinaleProps['decision'], DecisionMeta> = {
  approve: {
    icon: CheckCircle2,
    title: 'APROBADO',
    subtitle: 'Resolución automática emitida correctamente.',
    tintClass: 'bg-emerald-500/20',
    cardClass: 'bg-gradient-to-br from-emerald-500/18 via-surface-950/92 to-teal-500/12 shadow-[0_0_90px_rgba(16,185,129,0.26)]',
    badgeClass: 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100',
    iconShellClass: 'border-emerald-300/30 bg-emerald-400/12 text-emerald-100 shadow-[0_0_80px_rgba(16,185,129,0.35)]',
    titleGradient: 'from-white via-emerald-100 to-teal-200',
  },
  human_review: {
    icon: Users,
    title: 'REVISIÓN HUMANA',
    subtitle: 'Supera umbral de aprobación automática.',
    tintClass: 'bg-amber-500/20',
    cardClass: 'bg-gradient-to-br from-amber-500/18 via-surface-950/92 to-orange-500/12 shadow-[0_0_90px_rgba(251,191,36,0.22)]',
    badgeClass: 'border-amber-300/20 bg-amber-400/10 text-amber-100',
    iconShellClass: 'border-amber-300/30 bg-amber-400/12 text-amber-100 shadow-[0_0_80px_rgba(251,191,36,0.3)]',
    titleGradient: 'from-white via-amber-100 to-orange-200',
  },
  reject: {
    icon: XCircle,
    title: 'RECHAZADO',
    subtitle: 'Posible fraude detectado.',
    tintClass: 'bg-rose-500/20',
    cardClass: 'bg-gradient-to-br from-rose-500/18 via-surface-950/92 to-orange-500/12 shadow-[0_0_90px_rgba(244,63,94,0.24)]',
    badgeClass: 'border-rose-300/20 bg-rose-400/10 text-rose-100',
    iconShellClass: 'border-rose-300/30 bg-rose-400/12 text-rose-100 shadow-[0_0_80px_rgba(244,63,94,0.34)]',
    titleGradient: 'from-white via-rose-100 to-orange-200',
  },
};

function formatAmount(amount: number) {
  return `${Math.max(0, Math.round(amount)).toLocaleString('es-ES')} €`;
}

function buildParticleStyle(particle: ConfettiParticle): CSSProperties {
  return {
    left: `${particle.left}%`,
    top: '-14%',
    width: `${particle.size}px`,
    height: `${particle.height}px`,
    borderRadius: particle.borderRadius,
    animationDelay: `${particle.delay}s`,
    animationDuration: `${particle.duration}s`,
    ['--confetti-drift' as string]: `${particle.drift}px`,
    ['--confetti-rotate' as string]: `${particle.rotate}deg`,
  };
}

export default function DecisionFinale({ decision, amount, scenarioLabel, onDone }: DecisionFinaleProps) {
  const meta = DECISION_META[decision];
  const Icon = meta.icon;
  const amountLabel = formatAmount(amount);
  const onDoneRef = useRef(onDone);

  const particles = useMemo<ConfettiParticle[]>(() => {
    if (decision !== 'approve') return [];

    return Array.from({ length: 30 }, (_, index) => ({
      id: index,
      left: 4 + Math.random() * 92,
      size: 6 + Math.random() * 6,
      height: 12 + Math.random() * 12,
      delay: Math.random() * 0.45,
      duration: 2.1 + Math.random() * 0.7,
      drift: -80 + Math.random() * 160,
      rotate: 300 + Math.random() * 320,
      colorClass: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      borderRadius: Math.random() > 0.5 ? '9999px' : '3px',
    }));
  }, [decision, amount, scenarioLabel]);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      onDoneRef.current?.();
    }, 2400);
    return () => window.clearTimeout(timerId);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[200] overflow-hidden">
      <div className={`absolute inset-0 backdrop-blur-sm ${meta.tintClass}`} />
      {decision === 'reject' ? <div className="absolute inset-0 bg-rose-500/10 animate-pulse-soft" /> : null}

      {decision === 'approve' ? (
        <div className="absolute inset-0 overflow-hidden">
          {particles.map((particle) => (
            <div
              key={particle.id}
              style={buildParticleStyle(particle)}
              className={`absolute opacity-0 animate-confetti-fall ${particle.colorClass}`}
            />
          ))}
        </div>
      ) : null}

      <div className="relative flex h-full items-center justify-center p-6 md:p-10">
        <div className={`relative w-full max-w-3xl overflow-hidden rounded-[36px] border border-white/10 px-8 py-12 text-center animate-pop-in ${meta.cardClass}`}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.09),transparent_44%)]" />

          {decision === 'human_review' ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {[0, 1, 2].map((ring) => (
                <div
                  key={ring}
                  className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-300/25 animate-ring-pulse"
                  style={{ animationDelay: `${ring * 0.35}s` }}
                />
              ))}
            </div>
          ) : null}

          <div className="relative">
            <div className={`mx-auto flex h-28 w-28 items-center justify-center rounded-full border ${meta.iconShellClass} ${decision === 'approve' ? 'animate-pulse-soft' : decision === 'reject' ? 'animate-shake' : ''}`}>
              <Icon className="h-16 w-16" />
            </div>

            <div className={`mx-auto mt-6 inline-flex items-center rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] ${meta.badgeClass}`}>
              {scenarioLabel}
            </div>

            <h2 className={`mt-8 bg-gradient-to-r ${meta.titleGradient} bg-clip-text text-4xl font-black uppercase tracking-[0.14em] text-transparent md:text-6xl`}>
              {`${meta.title} · ${amountLabel}`}
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-200 md:text-lg">{meta.subtitle}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
