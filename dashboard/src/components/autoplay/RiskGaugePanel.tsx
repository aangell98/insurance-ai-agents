import { ShieldAlert } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

export type FraudProbability = 'low' | 'medium' | 'high';

export interface RiskGaugePanelProps {
  active: boolean;
  targetScore: number | null;
  fraudProbability: FraudProbability | null;
  phaseLabel?: string;
}

const GAUGE_RADIUS = 102;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;
const GAUGE_HALF = Math.PI * GAUGE_RADIUS;
const GAUGE_SEGMENTS = [
  { length: GAUGE_HALF * 0.33, color: '#4ade80' },
  { length: GAUGE_HALF * 0.33, color: '#facc15' },
  { length: GAUGE_HALF * 0.34, color: '#ef4444' },
] as const;

const FRAUD_META: Record<FraudProbability, { scale: number; label: string; color: string; pill: string }> = {
  low: {
    scale: 0.2,
    label: 'BAJA',
    color: '#4ade80',
    pill: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200',
  },
  medium: {
    scale: 0.55,
    label: 'MEDIA',
    color: '#facc15',
    pill: 'border-amber-400/20 bg-amber-500/10 text-amber-200',
  },
  high: {
    scale: 0.9,
    label: 'ALTA',
    color: '#ef4444',
    pill: 'border-rose-400/20 bg-rose-500/10 text-rose-200',
  },
};

const RISK_WARMING_MESSAGES = [
  'Calculando risk score...',
  'Analizando histórico del cliente...',
  'Cruzando patrones de fraude...',
] as const;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function getNeedleAngle(score: number | null, active: boolean) {
  if (!active || score === null) return 90;
  const clampedScore = Math.max(0, Math.min(100, score));
  return 180 - (clampedScore * 1.8);
}

function getScoreTone(score: number | null, active: boolean) {
  if (!active || score === null) return 'text-slate-400';
  if (score <= 33) return 'text-emerald-300';
  if (score <= 66) return 'text-amber-300';
  return 'text-rose-300';
}

export default function RiskGaugePanel({
  active,
  targetScore,
  fraudProbability,
  phaseLabel,
}: RiskGaugePanelProps) {
  const clipPathId = useId().replace(/:/g, '');
  const [warmingMessageIndex, setWarmingMessageIndex] = useState(0);
  const score = typeof targetScore === 'number' ? Math.max(0, Math.min(100, targetScore)) : null;
  const displayScore = active ? score : null;
  const needleAngle = getNeedleAngle(displayScore, active);
  const scoreTone = getScoreTone(displayScore, active);
  const scoreLabel = displayScore === null ? '—' : Math.round(displayScore).toString();
  const riskPending = active && displayScore === null;
  const fraudPending = active && fraudProbability === null;
  const warmingUp = active && targetScore === null && fraudProbability === null;
  const fraudMeta = active && fraudProbability ? FRAUD_META[fraudProbability] : null;
  const fillScale = fraudMeta?.scale ?? (fraudPending ? 0.14 : 0);
  const fillColor = fraudMeta?.color ?? (warmingUp ? '#f87171' : fraudPending ? '#38bdf8' : '#64748b');
  const pillLabel = fraudMeta?.label ?? (fraudPending ? 'CALCULANDO' : '—');
  const pillTone = fraudMeta?.pill ?? (fraudPending
    ? `border-sky-400/20 bg-sky-500/10 text-sky-200${warmingUp ? '' : ' animate-pulse'}`
    : 'border-white/10 bg-white/5 text-slate-400');

  useEffect(() => {
    if (!warmingUp) {
      setWarmingMessageIndex(0);
      return;
    }

    const interval = window.setInterval(() => {
      setWarmingMessageIndex((current) => (current + 1) % RISK_WARMING_MESSAGES.length);
    }, 1400);

    return () => {
      window.clearInterval(interval);
    };
  }, [warmingUp]);

  return (
    <section className="rounded-[28px] border border-white/10 bg-surface-900/80 p-6 shadow-2xl shadow-black/20 backdrop-blur-sm">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 shadow-inner shadow-white/5">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">Risk agent</p>
          <h3 className="text-lg font-semibold text-white">Scoring y fraude</h3>
          {phaseLabel ? <p className="mt-1 text-xs text-slate-400">{phaseLabel}</p> : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-surface-800/90 p-5">
          {warmingUp ? (
            <p className="mb-3 text-center text-xs font-medium text-slate-400 transition-opacity duration-300">
              {RISK_WARMING_MESSAGES[warmingMessageIndex]}
            </p>
          ) : null}

          <svg viewBox="0 0 300 190" className="mx-auto h-[180px] w-full max-w-[300px] overflow-visible">
            <circle
              cx="150"
              cy="150"
              r={GAUGE_RADIUS}
              fill="none"
              stroke="#1e293b"
              strokeWidth="18"
              strokeLinecap="round"
              strokeDasharray={`${GAUGE_HALF} ${GAUGE_CIRCUMFERENCE}`}
              transform="rotate(180 150 150)"
            />
            {GAUGE_SEGMENTS.map((segment, index) => {
              const offset = -GAUGE_SEGMENTS.slice(0, index).reduce((total, item) => total + item.length, 0);
              return (
                <circle
                  key={`zone-${segment.color}`}
                  cx="150"
                  cy="150"
                  r={GAUGE_RADIUS}
                  fill="none"
                  stroke={active ? segment.color : '#334155'}
                  strokeWidth="18"
                  strokeLinecap="round"
                  strokeDasharray={`${segment.length} ${GAUGE_CIRCUMFERENCE}`}
                  strokeDashoffset={offset}
                  transform="rotate(180 150 150)"
                  className={riskPending && !warmingUp ? 'animate-pulse' : undefined}
                />
              );
            })}

            <text x="38" y="166" fill="#64748b" fontSize="12" fontWeight="600">0</text>
            <text x="144" y="44" fill="#64748b" fontSize="12" fontWeight="600">50</text>
            <text x="245" y="166" fill="#64748b" fontSize="12" fontWeight="600">100</text>

            <circle
              cx="150"
              cy="150"
              r="18"
              fill={riskPending ? 'rgba(56, 189, 248, 0.18)' : 'rgba(15, 23, 42, 0.92)'}
              className={riskPending && !warmingUp ? 'animate-pulse' : undefined}
            />
            <g
              style={warmingUp
                ? {
                    transformBox: 'view-box',
                    transformOrigin: '150px 150px',
                    animation: 'radarSweep 3s ease-in-out infinite',
                  }
                : {
                    transformBox: 'view-box',
                    transformOrigin: '150px 150px',
                    transform: `rotate(${-needleAngle}deg)`,
                    transition: 'transform 1.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}
            >
              <line
                x1="150"
                y1="150"
                x2="236"
                y2="150"
                stroke={active ? '#f8fafc' : '#94a3b8'}
                strokeWidth="6"
                strokeLinecap="round"
              />
            </g>
            <circle cx="150" cy="150" r="11" fill={active ? '#e2e8f0' : '#64748b'} />
            <circle cx="150" cy="150" r="4" fill="#0f172a" />
          </svg>

          <div className={cx('mt-4 text-center', riskPending && !warmingUp && 'animate-pulse')}>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Risk Score</p>
            <p className={cx('mt-2 text-4xl font-semibold tracking-tight', scoreTone)}>
              {scoreLabel}
              <span className="ml-2 text-xl text-slate-500">/ 100</span>
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-surface-800/90 p-5">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Fraud signal</p>
            <h3 className="mt-2 text-base font-semibold text-white">Probabilidad de fraude</h3>
          </div>

          <div className="mt-4 flex flex-col items-center">
            <svg viewBox="0 0 80 240" className="h-[240px] w-[80px] overflow-visible">
              <defs>
                <clipPath id={clipPathId}>
                  <rect x="24" y="18" width="32" height="154" rx="16" />
                  <circle cx="40" cy="198" r="28" />
                </clipPath>
              </defs>

              <rect x="24" y="18" width="32" height="154" rx="16" fill="#0f172a" stroke="#475569" strokeWidth="3" />
              <circle cx="40" cy="198" r="28" fill="#0f172a" stroke="#475569" strokeWidth="3" />

              <g clipPath={`url(#${clipPathId})`}>
                <rect x="24" y="18" width="32" height="208" fill="#111827" opacity="0.68" />
                <g
                  style={warmingUp
                    ? {
                        transformBox: 'view-box',
                        transformOrigin: '40px 226px',
                        animation: 'thermoBreathe 2.5s ease-in-out infinite',
                      }
                    : {
                        transformBox: 'view-box',
                        transformOrigin: '40px 226px',
                        transform: `scaleY(${fillScale})`,
                        transition: 'transform 1s',
                      }}
                  className={fraudPending && !warmingUp ? 'animate-pulse' : undefined}
                >
                  <rect x="24" y="18" width="32" height="208" fill={fillColor} style={{ transition: 'fill 1s' }} />
                </g>
              </g>
            </svg>

            <div className={cx('mt-3 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em]', pillTone)}>
              {pillLabel}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
