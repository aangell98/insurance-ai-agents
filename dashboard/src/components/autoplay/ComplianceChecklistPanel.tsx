import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Loader2, Scale, XCircle } from 'lucide-react';

export type RuleStatus = 'pending' | 'checking' | 'passed' | 'warning' | 'failed';

export interface ComplianceRule {
  id: string;
  label: string;
  status: RuleStatus;
  detail?: string;
}

export interface ComplianceChecklistPanelProps {
  active: boolean;
  rules: ComplianceRule[];
  phaseLabel?: string;
}

const COMPLIANCE_WARMING_MESSAGES = [
  'Revisando reglas regulatorias...',
  'Validando límites de cobertura...',
  'Comprobando documentación...',
] as const;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function getStatusStyles(status: RuleStatus) {
  switch (status) {
    case 'checking':
      return {
        icon: <Loader2 className="h-5 w-5 animate-spin text-sky-300" />,
        row: 'border-sky-400/20 bg-sky-500/10',
      };
    case 'passed':
      return {
        icon: <CheckCircle2 className="h-5 w-5 text-emerald-300" />,
        row: 'border-emerald-400/20 bg-emerald-500/10',
      };
    case 'warning':
      return {
        icon: <AlertTriangle className="h-5 w-5 text-amber-300" />,
        row: 'border-amber-400/20 bg-amber-500/10',
      };
    case 'failed':
      return {
        icon: <XCircle className="h-5 w-5 text-rose-300" />,
        row: 'border-rose-400/20 bg-rose-500/10',
      };
    default:
      return {
        icon: <Circle className="h-5 w-5 text-slate-500" />,
        row: 'border-white/10 bg-surface-800',
      };
  }
}

export default function ComplianceChecklistPanel({
  active,
  rules,
  phaseLabel,
}: ComplianceChecklistPanelProps) {
  const [animatedRuleIds, setAnimatedRuleIds] = useState<string[]>([]);
  const [warmingCheckingCount, setWarmingCheckingCount] = useState(0);
  const [warmingMessageIndex, setWarmingMessageIndex] = useState(0);
  const previousStatusesRef = useRef<Record<string, RuleStatus>>({});
  const timersRef = useRef<number[]>([]);
  const warmingTimersRef = useRef<number[]>([]);
  const allRulesPending = active && rules.length > 0 && rules.every((rule) => rule.status === 'pending');

  useEffect(() => {
    const previousStatuses = previousStatusesRef.current;
    const nextStatuses = Object.fromEntries(rules.map((rule) => [rule.id, rule.status]));

    rules.forEach((rule, index) => {
      const previousStatus = previousStatuses[rule.id];
      if (rule.status === 'pending' || previousStatus === rule.status) return;

      const startTimer = window.setTimeout(() => {
        setAnimatedRuleIds((current) => current.includes(rule.id) ? current : [...current, rule.id]);

        const endTimer = window.setTimeout(() => {
          setAnimatedRuleIds((current) => current.filter((item) => item !== rule.id));
        }, 600);

        timersRef.current.push(endTimer);
      }, active ? index * 140 : 0);

      timersRef.current.push(startTimer);
    });

    previousStatusesRef.current = nextStatuses;
  }, [active, rules]);

  useEffect(() => {
    warmingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    warmingTimersRef.current = [];

    if (!allRulesPending) {
      setWarmingCheckingCount(0);
      setWarmingMessageIndex(0);
      return;
    }

    setWarmingCheckingCount(1);

    for (let index = 1; index < rules.length; index += 1) {
      const timer = window.setTimeout(() => {
        setWarmingCheckingCount(index + 1);
      }, index * 800);

      warmingTimersRef.current.push(timer);
    }

    const messageInterval = window.setInterval(() => {
      setWarmingMessageIndex((current) => (current + 1) % COMPLIANCE_WARMING_MESSAGES.length);
    }, 1400);

    warmingTimersRef.current.push(messageInterval);

    return () => {
      warmingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      warmingTimersRef.current = [];
    };
  }, [allRulesPending, rules.length]);

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    warmingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return (
    <section className="rounded-[28px] border border-white/10 bg-surface-900/80 p-6 shadow-2xl shadow-black/20 backdrop-blur-sm">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 shadow-inner shadow-white/5">
          <Scale className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">Compliance agent</p>
          <h3 className="text-lg font-semibold text-white">Validación de cumplimiento</h3>
          {phaseLabel ? <p className="mt-1 text-xs text-slate-400">{phaseLabel}</p> : null}
        </div>
      </div>

      <div className="space-y-3">
        {allRulesPending ? (
          <div className="rounded-xl border border-sky-400/10 bg-sky-500/5 px-4 py-3 text-xs font-medium text-slate-300 transition-opacity duration-300">
            {COMPLIANCE_WARMING_MESSAGES[warmingMessageIndex]}
          </div>
        ) : null}

        {rules.map((rule, index) => {
          const visualStatus: RuleStatus = allRulesPending && index < warmingCheckingCount ? 'checking' : rule.status;
          const statusStyles = getStatusStyles(visualStatus);
          const shouldPulse = animatedRuleIds.includes(rule.id);

          return (
            <div
              key={rule.id}
              className={cx(
                'flex items-center gap-4 rounded-xl border p-4 transition-colors duration-300',
                statusStyles.row,
                visualStatus === 'pending' && 'text-slate-400',
                visualStatus === 'checking' && active && 'shadow-[0_0_24px_rgba(14,165,233,0.1)]',
              )}
              style={shouldPulse ? { animation: 'pulseRow 0.6s ease-out both' } : undefined}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/20">
                {statusStyles.icon}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-base font-medium text-white">{rule.label}</p>
                {rule.detail ? <p className="mt-1 text-xs text-slate-400">{rule.detail}</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
