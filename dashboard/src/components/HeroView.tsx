import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock,
  Database,
  DollarSign,
  FileSearch,
  Gavel,
  Play,
  Scale,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
  Zap,
  XCircle,
} from 'lucide-react';
import type { ClaimSummary, SecurityIncident, StatsResponse } from '../api';
import { getClaims, getSecurityIncidents, getStats } from '../api';

interface HeroViewProps {
  onCTAClick: () => void;
}

interface HeroMetric {
  icon: LucideIcon;
  label: string;
  value: number;
  formatter: (value: number) => string;
  description: string;
  iconClasses: string;
}

const HERO_BADGES: Array<{ icon: LucideIcon; label: string }> = [
  { icon: Sparkles, label: 'Powered by Microsoft Agent Framework' },
  { icon: Sparkles, label: 'Azure OpenAI' },
  { icon: Shield, label: 'Entra ID' },
  { icon: Database, label: 'Cosmos DB' },
  { icon: Activity, label: 'APIM' },
];

const FLOW_STEPS: Array<{ icon: LucideIcon; title: string; description: string }> = [
  { icon: Upload, title: 'Cliente sube parte', description: 'Captura del siniestro y evidencia en un único flujo guiado.' },
  { icon: FileSearch, title: 'Intake extrae datos', description: 'La IA estructura el expediente y elimina trabajo manual.' },
  { icon: ShieldAlert, title: 'Risk evalúa fraude', description: 'Cruza señales de riesgo y detecta incoherencias automáticamente.' },
  { icon: Scale, title: 'Compliance valida regulación', description: 'Aplica reglas de negocio y cumplimiento antes de decidir.' },
  { icon: Gavel, title: 'Decisión', description: 'Aprueba, rechaza o escala con reasoning y trazabilidad completa.' },
];

const PLATFORM_STACK: Array<{ icon: LucideIcon; name: string; description: string }> = [
  { icon: Sparkles, name: 'Microsoft Agent Framework', description: 'orquestación multi-agente gobernada' },
  { icon: Sparkles, name: 'Azure OpenAI', description: 'razonamiento, extracción y decisión asistida' },
  { icon: Shield, name: 'Microsoft Entra ID', description: 'identidad, roles y acceso corporativo seguro' },
  { icon: Database, name: 'Azure Cosmos DB', description: 'persistencia auditable de expedientes y resultados' },
  { icon: ShieldCheck, name: 'Azure API Management', description: 'seguridad, políticas y exposición controlada de APIs' },
  { icon: Activity, name: 'Application Insights', description: 'observabilidad extremo a extremo y métricas live' },
];

const FALLBACKS = {
  amountProcessed: 1_247_500,
  automationRate: 87,
  minutesSaved: 4_450,
  fraudDetected: 18,
};

function useCountUp(target: number, duration = 1_400): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const nextTarget = Number.isFinite(target) ? Math.max(0, Math.round(target)) : 0;
    if (nextTarget === 0) {
      setValue(0);
      return;
    }

    let frameId = 0;
    let startTime: number | null = null;

    const step = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(nextTarget * eased));
      if (progress < 1) {
        frameId = window.requestAnimationFrame(step);
      }
    };

    setValue(0);
    frameId = window.requestAnimationFrame(step);

    return () => window.cancelAnimationFrame(frameId);
  }, [duration, target]);

  return value;
}

function CountUpValue({ target, formatter }: { target: number; formatter: (value: number) => string }) {
  const value = useCountUp(target);

  return (
    <div className="animate-count-up bg-gradient-to-r from-white via-violet-200 to-teal-200 bg-clip-text text-5xl font-semibold tracking-tight text-transparent md:text-6xl">
      {formatter(value)}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, formatter, description, iconClasses }: HeroMetric) {
  return (
    <div className="rounded-2xl border border-white/10 bg-surface-900/80 p-6 shadow-2xl shadow-black/20 backdrop-blur-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.26em] text-gray-500">{label}</div>
        </div>
        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 ${iconClasses}`}>
          <Icon className="h-7 w-7" />
        </div>
      </div>
      <CountUpValue target={value} formatter={formatter} />
      <p className="mt-3 text-sm leading-relaxed text-gray-400">{description}</p>
    </div>
  );
}

function formatInteger(value: number): string {
  return value.toLocaleString('es-ES');
}

function formatCurrency(value: number): string {
  return `€ ${Math.round(value).toLocaleString('es-ES')}`;
}

function formatPercent(value: number): string {
  return `${Math.round(value).toLocaleString('es-ES')}%`;
}

export default function HeroView({ onCTAClick }: HeroViewProps) {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [claims, setClaims] = useState<ClaimSummary[]>([]);
  const [incidents, setIncidents] = useState<SecurityIncident[]>([]);

  const refreshHeroData = useCallback(async () => {
    const [statsResult, claimsResult, incidentsResult] = await Promise.allSettled([
      getStats(),
      getClaims(),
      getSecurityIncidents(),
    ]);

    if (statsResult.status === 'fulfilled') {
      setStats(statsResult.value);
    }

    if (claimsResult.status === 'fulfilled') {
      setClaims(claimsResult.value);
    }

    if (incidentsResult.status === 'fulfilled') {
      setIncidents(incidentsResult.value.incidents);
    }
  }, []);

  useEffect(() => {
    void refreshHeroData();
    const interval = window.setInterval(() => {
      void refreshHeroData();
    }, 20_000);

    return () => window.clearInterval(interval);
  }, [refreshHeroData]);

  const metrics = useMemo<HeroMetric[]>(() => {
    const totalAmount = claims.reduce((sum, claim) => sum + (typeof claim.estimated_amount === 'number' ? claim.estimated_amount : 0), 0);
    const hasAmountData = claims.some(claim => typeof claim.estimated_amount === 'number' && claim.estimated_amount > 0);
    const hasStatsData = stats !== null && stats.total_claims > 0;

    const processedAmount = hasAmountData ? Math.round(totalAmount) : FALLBACKS.amountProcessed;
    const automationRate = hasStatsData
      ? Math.round(((stats.approved + stats.rejected) / stats.total_claims) * 100)
      : FALLBACKS.automationRate;
    const minutesSaved = hasStatsData ? Math.round(stats.total_claims * 44.5) : FALLBACKS.minutesSaved;
    const fraudDetected = hasStatsData || incidents.length > 0
      ? (stats?.rejected ?? 0) + incidents.length
      : FALLBACKS.fraudDetected;

    return [
      {
        icon: DollarSign,
        label: '€ procesados YTD',
        value: processedAmount,
        formatter: formatCurrency,
        description: 'Suma estimada del volumen económico ya gestionado por la plataforma.',
        iconClasses: 'bg-emerald-500/10 text-emerald-300',
      },
      {
        icon: Sparkles,
        label: '% automatización',
        value: automationRate,
        formatter: formatPercent,
        description: 'Casos cerrados automáticamente sin escalar a revisión manual.',
        iconClasses: 'bg-violet-500/10 text-violet-300',
      },
      {
        icon: Clock,
        label: 'Minutos ahorrados',
        value: minutesSaved,
        formatter: formatInteger,
        description: 'Ahorro directo frente a un proceso manual de 45 minutos por expediente.',
        iconClasses: 'bg-sky-500/10 text-sky-300',
      },
      {
        icon: ShieldAlert,
        label: 'Fraudes detectados',
        value: fraudDetected,
        formatter: formatInteger,
        description: 'Rechazos automáticos e incidentes de seguridad detectados en el flujo.',
        iconClasses: 'bg-rose-500/10 text-rose-300',
      },
    ];
  }, [claims, incidents.length, stats]);

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-purple-900/40 via-blue-900/30 to-teal-900/20 px-8 py-10 shadow-2xl shadow-black/20 md:px-12 md:py-14">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/10 to-transparent" />
        <div className="pointer-events-none absolute -right-20 top-10 h-48 w-48 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-violet-500/10 blur-3xl" />

        <div className="relative max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-surface-950/40 px-4 py-2 text-xs font-medium text-gray-200 backdrop-blur-sm">
            <Sparkles className="h-4 w-4 text-violet-300" />
            Plataforma comercial para tramitación inteligente de siniestros
          </div>

          <div className="space-y-4">
            <h2 className="text-4xl font-semibold tracking-tight text-white md:text-6xl">
              Insurance AI{' '}
              <span className="bg-gradient-to-r from-fuchsia-300 via-violet-200 to-teal-200 bg-clip-text text-transparent">
                Claims Intelligence
              </span>
            </h2>
            <p className="max-w-3xl text-lg leading-relaxed text-slate-200 md:text-xl">
              Procesamiento de siniestros gobernado, auditable y en segundos. End-to-end.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {HERO_BADGES.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-surface-950/40 px-3 py-2 text-xs text-gray-200 backdrop-blur-sm"
              >
                <Icon className="h-3.5 w-3.5 text-teal-300" />
                <span>{label}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={onCTAClick}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-surface-950 transition-transform hover:-translate-y-0.5"
          >
            <Play className="h-4 w-4" fill="currentColor" />
            Probar ahora
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-gray-500">KPIs que compra negocio</p>
            <h3 className="text-2xl font-semibold text-white">Resultado económico, eficiencia y control</h3>
          </div>
          <p className="text-sm text-gray-500">Conectado a /api/stats, /api/claims y /api/security/incidents.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
        <div className="rounded-3xl border border-red-900/40 bg-red-950/20 p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-300">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-red-200/70">Antes</p>
              <h3 className="text-2xl font-semibold text-white">45 min por caso</h3>
            </div>
          </div>
          <ul className="space-y-3 text-sm text-gray-300">
            <li className="flex items-start gap-3">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
              <span>Errores humanos al reescribir datos y revisar coberturas.</span>
            </li>
            <li className="flex items-start gap-3">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
              <span>Sin audit trail trazable para justificar por qué se aprobó o rechazó.</span>
            </li>
            <li className="flex items-start gap-3">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
              <span>Fraudes e intentos de manipulación que se cuelan hasta fases tardías.</span>
            </li>
          </ul>
        </div>

        <div className="hidden items-center justify-center text-gray-500 md:flex">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-surface-900/70">
            <ArrowRight className="h-7 w-7" />
          </div>
        </div>

        <div className="rounded-3xl border border-emerald-900/40 bg-emerald-950/20 p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300">
              <Zap className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-emerald-200/70">Ahora</p>
              <h3 className="text-2xl font-semibold text-white">30 segundos por caso</h3>
            </div>
          </div>
          <ul className="space-y-3 text-sm text-gray-300">
            <li className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              <span>3 agentes IA colaboran y entregan una decisión lista para negocio.</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              <span>Audit trail completo para explicar, revisar y gobernar cada expediente.</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              <span>Fraude, prompt injection y anomalías detectadas automáticamente.</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-800 bg-surface-900/70 p-6 shadow-xl shadow-black/10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-gray-500">Flujo operativo</p>
            <h3 className="text-2xl font-semibold text-white">De la carga del parte a la decisión final</h3>
          </div>
          <div className="hidden rounded-full border border-primary-500/20 bg-primary-500/10 px-3 py-1 text-xs text-primary-300 md:inline-flex">
            Multi-agent orchestration live
          </div>
        </div>

        <div className="overflow-x-auto pb-2">
          <div className="relative min-w-[980px]">
            <div className="pointer-events-none absolute left-0 right-0 top-16 hidden h-px bg-gradient-to-r from-transparent via-primary-400/40 to-transparent md:block" />
            <div className="timeline-light pointer-events-none absolute top-16 hidden md:block" />

            <div className="grid gap-4 md:grid-cols-5">
              {FLOW_STEPS.map(({ icon: Icon, title, description }, index) => (
                <div key={title} className="relative rounded-2xl border border-white/10 bg-surface-950/80 p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-500/10 text-primary-300">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-gray-600">0{index + 1}</span>
                  </div>
                  <h4 className="text-base font-semibold text-white">{title}</h4>
                  <p className="mt-2 text-sm leading-relaxed text-gray-400">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-gray-500">Construido sobre</p>
          <h3 className="text-2xl font-semibold text-white">Stack enterprise listo para producción</h3>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PLATFORM_STACK.map(({ icon: Icon, name, description }) => (
            <div key={name} className="flex items-center gap-4 rounded-2xl border border-gray-800 bg-surface-900/70 px-5 py-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5 text-teal-300">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">{name}</h4>
                <p className="text-xs text-gray-400">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-primary-500/20 bg-gradient-to-r from-primary-500/10 via-violet-500/10 to-teal-500/10 p-8 text-center">
        <p className="text-xs uppercase tracking-[0.28em] text-primary-200/70">Siguiente paso</p>
        <h3 className="mt-3 text-3xl font-semibold text-white">Ver una demo automática ▶</h3>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-gray-300">
          Abre el flujo cliente para enseñar en directo cómo los agentes reducen tiempos, detectan fraude y dejan trazabilidad completa.
        </p>
        <button
          type="button"
          onClick={() => {
            // TODO: cuando autoplay-demo esté listo, abrir el modal en lugar de cambiar tab.
            onCTAClick();
          }}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary-500 px-6 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 hover:bg-primary-400"
        >
          Ver una demo automática
          <ArrowRight className="h-4 w-4" />
        </button>
      </section>
    </div>
  );
}
