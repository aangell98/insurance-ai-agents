import { CheckCircle2, AlertTriangle, XCircle, Clock, Gauge } from 'lucide-react';
import type { ClaimResult } from '../api';

interface Props {
  result: ClaimResult;
}

const decisionConfig = {
  approve: {
    icon: CheckCircle2,
    label: 'APROBADO',
    sublabel: 'Aprobación Automática',
    bg: 'bg-green-900/30',
    border: 'border-green-700',
    text: 'text-green-300',
    badge: 'bg-green-600',
  },
  human_review: {
    icon: AlertTriangle,
    label: 'REVISIÓN HUMANA',
    sublabel: 'Requiere Validación Manual',
    bg: 'bg-amber-900/30',
    border: 'border-amber-700',
    text: 'text-amber-300',
    badge: 'bg-amber-600',
  },
  reject: {
    icon: XCircle,
    label: 'RECHAZADO',
    sublabel: 'Siniestro Denegado',
    bg: 'bg-red-900/30',
    border: 'border-red-700',
    text: 'text-red-300',
    badge: 'bg-red-600',
  },
};

export default function DecisionPanel({ result }: Props) {
  const cfg = decisionConfig[result.decision] || decisionConfig.human_review;
  const Icon = cfg.icon;
  const riskScore = (result.risk_result as Record<string, unknown>)?.risk_score as number;
  const fraudProb = (result.risk_result as Record<string, unknown>)?.fraud_probability as string;

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-6 space-y-6`}>
      {/* Decision Badge */}
      <div className="text-center">
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-surface-800/50">
          <Icon className={`w-8 h-8 ${cfg.text}`} />
          <div className="text-left">
            <p className={`text-2xl font-bold tracking-wide ${cfg.text}`}>{cfg.label}</p>
            <p className="text-xs text-gray-500">{cfg.sublabel}</p>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface-800/50 rounded-lg p-3 text-center">
          <Gauge className="w-4 h-4 text-gray-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-white">{riskScore ?? '—'}<span className="text-xs text-gray-500">/10</span></p>
          <p className="text-[10px] text-gray-500 uppercase">Risk Score</p>
        </div>
        <div className="bg-surface-800/50 rounded-lg p-3 text-center">
          <AlertTriangle className="w-4 h-4 text-gray-500 mx-auto mb-1" />
          <p className={`text-sm font-bold ${fraudProb === 'high' ? 'text-red-400' : fraudProb === 'medium' ? 'text-amber-400' : 'text-green-400'}`}>
            {fraudProb === 'high' ? 'ALTO' : fraudProb === 'medium' ? 'MEDIO' : 'BAJO'}
          </p>
          <p className="text-[10px] text-gray-500 uppercase">Fraude</p>
        </div>
        <div className="bg-surface-800/50 rounded-lg p-3 text-center">
          <Clock className="w-4 h-4 text-gray-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-white">{(result.total_duration_ms / 1000).toFixed(1)}<span className="text-xs text-gray-500">s</span></p>
          <p className="text-[10px] text-gray-500 uppercase">Duración</p>
        </div>
      </div>

      {/* Confidence */}
      <div>
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>Confianza</span>
          <span>{(result.confidence * 100).toFixed(0)}%</span>
        </div>
        <div className="w-full h-2 bg-surface-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${cfg.badge} transition-all duration-1000`}
            style={{ width: `${result.confidence * 100}%` }}
          />
        </div>
      </div>

      {/* Reasoning */}
      <div>
        <h4 className="text-xs font-medium text-gray-400 uppercase mb-2">Razonamiento</h4>
        <p className="text-sm text-gray-300 leading-relaxed">{result.reasoning}</p>
      </div>
    </div>
  );
}
