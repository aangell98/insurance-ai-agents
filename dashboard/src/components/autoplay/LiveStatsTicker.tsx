import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, Clock3, Cpu, ShieldAlert, Wallet } from 'lucide-react';

export interface LiveStatsTickerProps {
  totalProcessed: number;
  casesCompleted: number;
  totalCases: number;
  automationRate: number;
  fraudsDetected: number;
  elapsedSeconds: number;
}

interface TickerStatProps {
  icon: LucideIcon;
  label: string;
  value: string;
  accentClasses: string;
}

function easeOutCubic(progress: number) {
  return 1 - Math.pow(1 - progress, 3);
}

function useAnimatedNumber(target: number, duration = 600) {
  const safeTarget = Number.isFinite(target) ? target : 0;
  const [displayValue, setDisplayValue] = useState(safeTarget);
  const frameRef = useRef<number | null>(null);
  const currentValueRef = useRef(safeTarget);

  useEffect(() => {
    currentValueRef.current = displayValue;
  }, [displayValue]);

  useEffect(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const from = currentValueRef.current;
    if (Math.abs(from - safeTarget) < 0.01) {
      currentValueRef.current = safeTarget;
      setDisplayValue(safeTarget);
      return;
    }

    let startTime: number | null = null;

    const step = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const nextValue = from + (safeTarget - from) * easeOutCubic(progress);
      currentValueRef.current = nextValue;
      setDisplayValue(nextValue);

      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(step);
        return;
      }

      currentValueRef.current = safeTarget;
      setDisplayValue(safeTarget);
      frameRef.current = null;
    };

    frameRef.current = window.requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [duration, safeTarget]);

  return displayValue;
}

function formatCurrency(value: number) {
  return `${Math.round(Math.max(0, value)).toLocaleString('es-ES')} €`;
}

function formatPercent(value: number) {
  const normalized = Math.max(0, Math.min(100, value));
  return `${Math.round(normalized).toLocaleString('es-ES')}%`;
}

function formatFraction(value: number, total: number) {
  const numerator = Math.max(0, Math.round(value)).toLocaleString('es-ES');
  const denominator = Math.max(0, Math.round(total)).toLocaleString('es-ES');
  return `${numerator} / ${denominator}`;
}

function formatElapsed(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function TickerStat({ icon: Icon, label, value, accentClasses }: TickerStatProps) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 lg:px-5">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border shadow-inner shadow-white/5 ${accentClasses}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">{label}</div>
        <div className="mt-1 bg-gradient-to-r from-white via-violet-200 to-teal-200 bg-clip-text text-2xl font-semibold leading-none text-transparent tabular-nums">
          {value}
        </div>
      </div>
    </div>
  );
}

export default function LiveStatsTicker({
  totalProcessed,
  casesCompleted,
  totalCases,
  automationRate,
  fraudsDetected,
  elapsedSeconds,
}: LiveStatsTickerProps) {
  const animatedProcessed = useAnimatedNumber(totalProcessed);
  const animatedCompleted = useAnimatedNumber(casesCompleted);
  const animatedAutomation = useAnimatedNumber(automationRate);
  const animatedFrauds = useAnimatedNumber(fraudsDetected);

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-r from-violet-500/10 via-blue-500/10 to-teal-400/10 shadow-[0_0_40px_rgba(2,6,23,0.45)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_left,rgba(139,92,246,0.14),transparent_30%),radial-gradient(circle_at_right,rgba(45,212,191,0.12),transparent_26%)]" />
      <div className="relative grid divide-y divide-white/10 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <TickerStat
          icon={Wallet}
          label="€ procesados"
          value={formatCurrency(animatedProcessed)}
          accentClasses="border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
        />
        <TickerStat
          icon={CheckCircle2}
          label="Casos completados"
          value={formatFraction(animatedCompleted, totalCases)}
          accentClasses="border-sky-400/20 bg-sky-500/10 text-sky-200"
        />
        <TickerStat
          icon={Cpu}
          label="% automatización"
          value={formatPercent(animatedAutomation)}
          accentClasses="border-violet-400/20 bg-violet-500/10 text-violet-200"
        />
        <TickerStat
          icon={ShieldAlert}
          label="Fraudes detectados"
          value={Math.max(0, Math.round(animatedFrauds)).toLocaleString('es-ES')}
          accentClasses="border-rose-400/20 bg-rose-500/10 text-rose-200"
        />

        <div className="flex items-center justify-center px-5 py-4 xl:min-w-[132px]">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-2 shadow-inner shadow-white/5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
              <Clock3 className="h-[18px] w-[18px]" />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">Tiempo</div>
              <div className="mt-1 bg-gradient-to-r from-white via-cyan-200 to-teal-200 bg-clip-text text-lg font-semibold leading-none text-transparent tabular-nums">
                {formatElapsed(elapsedSeconds)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px overflow-hidden bg-gradient-to-r from-transparent via-white/15 to-transparent">
        <div className="h-full w-24 rounded-full bg-gradient-to-r from-transparent via-cyan-300 to-transparent shadow-[0_0_20px_rgba(45,212,191,0.85)] animate-ticker-sweep" />
      </div>
    </div>
  );
}
