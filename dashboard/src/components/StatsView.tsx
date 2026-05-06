import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Clock, ShieldCheck, AlertTriangle, XCircle, FileStack, DollarSign, Gauge, RefreshCw } from 'lucide-react';
import type { StatsResponse } from '../api';
import { getStats } from '../api';

function MetricCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-surface-800 rounded-xl border border-gray-800 p-5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className={`p-1.5 rounded-md ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <span className="text-2xl font-semibold text-white">{value}</span>
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
    </div>
  );
}

function DonutChart({ data }: { data: Record<string, number> }) {
  const total = Object.values(data).reduce((s, v) => s + v, 0) || 1;
  const colors: Record<string, string> = {
    approve: '#22c55e',
    human_review: '#eab308',
    reject: '#ef4444',
  };
  const labels: Record<string, string> = {
    approve: 'Aprobados',
    human_review: 'Revisión',
    reject: 'Rechazados',
  };

  let cumulative = 0;
  const segments = Object.entries(data).map(([key, val]) => {
    const pct = (val / total) * 100;
    const start = cumulative;
    cumulative += pct;
    return { key, pct, start, color: colors[key] || '#6b7280' };
  });

  // Build conic-gradient
  const gradient = segments
    .map(s => `${s.color} ${s.start}% ${s.start + s.pct}%`)
    .join(', ');

  return (
    <div className="bg-surface-800 rounded-xl border border-gray-800 p-5">
      <h3 className="text-xs text-gray-400 mb-4">Distribución de Decisiones</h3>
      <div className="flex items-center gap-6">
        <div
          className="w-28 h-28 rounded-full shrink-0"
          style={{
            background: `conic-gradient(${gradient})`,
            maskImage: 'radial-gradient(circle, transparent 40%, black 41%)',
            WebkitMaskImage: 'radial-gradient(circle, transparent 40%, black 41%)',
          }}
        />
        <div className="space-y-2">
          {segments.map(s => (
            <div key={s.key} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
              <span className="text-gray-300">{labels[s.key] || s.key}</span>
              <span className="text-gray-500 ml-auto">{data[s.key]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function StatsView() {
  const [stats, setStats] = useState<StatsResponse | null>(null);

  const fetchStats = useCallback(() => {
    getStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (!stats) {
    return (
      <div className="bg-surface-900 rounded-xl border border-gray-800 p-6 text-center text-gray-500 text-sm">
        Cargando estadísticas…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary-400" />
          <h2 className="text-lg font-semibold text-white">Estadísticas</h2>
        </div>
        <button onClick={fetchStats} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard icon={FileStack} label="Total Siniestros" value={stats.total_claims} color="bg-primary-600/20 text-primary-400" />
        <MetricCard icon={ShieldCheck} label="Aprobados" value={stats.approved} color="bg-green-600/20 text-green-400" />
        <MetricCard icon={AlertTriangle} label="Revisión Manual" value={stats.human_review} color="bg-yellow-600/20 text-yellow-400" />
        <MetricCard icon={XCircle} label="Rechazados" value={stats.rejected} color="bg-red-600/20 text-red-400" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard icon={Clock} label="Duración Media" value={`${(stats.avg_duration_ms / 1000).toFixed(2)}s`} color="bg-primary-600/20 text-primary-400" />
        <MetricCard icon={Gauge} label="Riesgo Medio" value={stats.avg_risk_score.toFixed(2)} color="bg-accent-600/20 text-accent-400" />
        <MetricCard icon={FileStack} label="Pólizas Activas" value={stats.active_policies} color="bg-primary-600/20 text-primary-400" />
        <MetricCard icon={DollarSign} label="Monto Procesado" value={`€${stats.total_amount.toLocaleString('es-ES')}`} color="bg-accent-600/20 text-accent-400" />
      </div>

      <DonutChart data={stats.decisions_breakdown} />
    </div>
  );
}
