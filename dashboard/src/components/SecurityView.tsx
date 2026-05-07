import { useEffect, useState, useCallback } from 'react';
import { Shield, AlertTriangle, RefreshCw, FileWarning } from 'lucide-react';
import { getSecurityIncidents } from '../api';
import type { SecurityIncident } from '../api';

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-900/40 text-red-400 border-red-800',
  high: 'bg-orange-900/40 text-orange-400 border-orange-800',
  medium: 'bg-yellow-900/40 text-yellow-400 border-yellow-800',
  low: 'bg-blue-900/40 text-blue-400 border-blue-800',
};

const STATUS_BADGE: Record<string, string> = {
  open: 'bg-red-900/40 text-red-400 border-red-800',
  closed: 'bg-gray-800 text-gray-400 border-gray-700',
};

const TYPE_BADGE: Record<string, { label: string; classes: string }> = {
  prompt_injection: {
    label: 'Prompt injection',
    classes: 'bg-purple-900/30 border-purple-800 text-purple-300',
  },
  fraud_suspected: {
    label: 'Posible fraude',
    classes: 'bg-orange-900/30 border-orange-800 text-orange-300',
  },
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function SecurityView() {
  const [incidents, setIncidents] = useState<SecurityIncident[]>([]);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    getSecurityIncidents()
      .then((res) => {
        setIncidents(res.incidents);
        setTotal(res.total);
        setOpen(res.open);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-surface-900 rounded-xl border border-gray-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-900/30 border border-red-800 flex items-center justify-center">
              <Shield className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Incidentes de Seguridad</h2>
              <p className="text-xs text-gray-400">
                Intentos de manipulación del sistema detectados por los agentes
              </p>
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="px-3 py-1.5 text-xs rounded-md border border-gray-700 text-gray-400 hover:text-white hover:border-primary-500 transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-surface-800/60 rounded-lg border border-gray-800 p-4">
            <div className="text-xs text-gray-500 mb-1">Total detectados</div>
            <div className="text-2xl font-semibold text-white">{total}</div>
          </div>
          <div className="bg-surface-800/60 rounded-lg border border-red-900/40 p-4">
            <div className="text-xs text-gray-500 mb-1">Abiertos</div>
            <div className="text-2xl font-semibold text-red-400">{open}</div>
          </div>
          <div className="bg-surface-800/60 rounded-lg border border-gray-800 p-4">
            <div className="text-xs text-gray-500 mb-1">Cerrados</div>
            <div className="text-2xl font-semibold text-gray-400">{total - open}</div>
          </div>
        </div>
      </div>

      {/* Incidents list */}
      {incidents.length === 0 ? (
        <div className="bg-surface-900 rounded-xl border border-gray-800 p-12 text-center">
          <Shield className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <p className="text-gray-500 text-sm">
            No se han detectado incidentes de seguridad.
          </p>
          <p className="text-gray-600 text-xs mt-1">
            El sistema está monitorizando intentos de manipulación en tiempo real.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map((inc) => (
            <div
              key={`${inc.claim_id}-${inc.detected_at}`}
              className="bg-surface-900 rounded-xl border border-red-900/40 p-5"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-red-900/30 border border-red-800 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">
                      {inc.claim_id}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] border ${
                        SEVERITY_BADGE[inc.severity] ?? SEVERITY_BADGE.medium
                      }`}
                    >
                      {inc.severity.toUpperCase()}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] border ${
                        STATUS_BADGE[inc.status] ?? STATUS_BADGE.open
                      }`}
                    >
                      {inc.status === 'open' ? 'ABIERTO' : 'CERRADO'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] border ${(TYPE_BADGE[inc.incident_type] ?? { classes: 'bg-purple-900/30 border-purple-800 text-purple-300' }).classes}`}>
                      {(TYPE_BADGE[inc.incident_type]?.label) ?? inc.incident_type}
                    </span>
                    <span className="text-[10px] text-gray-500 ml-auto">
                      {formatDate(inc.detected_at)}
                    </span>
                  </div>

                  <p className="text-sm text-gray-300 mb-3">{inc.description}</p>

                  <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
                    <div className="bg-surface-800/60 rounded-md px-3 py-2 border border-gray-800">
                      <div className="text-gray-500 text-[10px] mb-0.5">Póliza</div>
                      <div className="text-gray-200 font-mono">{inc.policy_id}</div>
                    </div>
                    <div className="bg-surface-800/60 rounded-md px-3 py-2 border border-gray-800">
                      <div className="text-gray-500 text-[10px] mb-0.5">Cliente</div>
                      <div className="text-gray-200 font-mono">{inc.customer_id}</div>
                    </div>
                  </div>

                  <div className="bg-surface-800/60 rounded-md border border-gray-800 p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <FileWarning className="w-3.5 h-3.5 text-yellow-500" />
                      <span className="text-[10px] uppercase text-gray-500 tracking-wide">
                        Extracto de la carga maliciosa
                      </span>
                    </div>
                    <pre className="text-[11px] text-gray-400 whitespace-pre-wrap font-mono leading-relaxed max-h-40 overflow-y-auto">
                      {inc.raw_payload_excerpt}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
