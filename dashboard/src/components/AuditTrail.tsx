import { Clock, CheckCircle2, XCircle, FileSearch, ShieldAlert, Scale, Gavel } from 'lucide-react';
import type { ClaimResult, AuditEntry } from '../api';

interface Props {
  result: ClaimResult;
}

const stageIcons: Record<string, typeof FileSearch> = {
  intake: FileSearch,
  risk_assessment: ShieldAlert,
  compliance: Scale,
  decision: Gavel,
};

const stageLabels: Record<string, string> = {
  intake: 'Claims Intake Agent',
  risk_assessment: 'Risk & Fraud Agent',
  compliance: 'Compliance Agent',
  decision: 'Decisión Final',
};

export default function AuditTrail({ result }: Props) {
  return (
    <div className="bg-surface-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Audit Trail</h3>
        <span className="text-xs text-gray-600">ID: {result.claim_id}</span>
      </div>

      <div className="space-y-1">
        {result.audit_trail.map((entry: AuditEntry, i: number) => {
          const Icon = stageIcons[entry.stage] || Clock;
          const isCompleted = entry.status === 'completed';
          return (
            <div key={i} className="flex gap-3">
              {/* Timeline line */}
              <div className="flex flex-col items-center">
                <div className={`p-1.5 rounded-full ${isCompleted ? 'bg-green-900/40' : 'bg-red-900/40'}`}>
                  {isCompleted ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                  )}
                </div>
                {i < result.audit_trail.length - 1 && (
                  <div className="w-px flex-1 bg-gray-800 my-1" />
                )}
              </div>
              {/* Content */}
              <div className="flex-1 pb-4">
                <div className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-sm font-medium text-gray-300">
                    {stageLabels[entry.stage] || entry.stage}
                  </span>
                  <span className="text-[10px] text-gray-600 ml-auto">
                    {entry.duration_ms}ms
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{entry.result_summary}</p>
                <p className="text-[10px] text-gray-700 mt-0.5">{new Date(entry.timestamp).toLocaleTimeString('es-ES')}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Metadata */}
      <div className="mt-4 pt-4 border-t border-gray-800">
        <h4 className="text-[10px] text-gray-600 uppercase mb-2">Metadata</h4>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <span className="text-gray-600">Modelo: </span>
            <span className="text-gray-400">{(result as Record<string, unknown>).metadata ? ((result as Record<string, unknown>).metadata as Record<string, unknown>).model as string : 'gpt-4o'}</span>
          </div>
          <div>
            <span className="text-gray-600">Pipeline: </span>
            <span className="text-gray-400">{(result as Record<string, unknown>).metadata ? ((result as Record<string, unknown>).metadata as Record<string, unknown>).pipeline_version as string : '1.0.0'}</span>
          </div>
          <div>
            <span className="text-gray-600">Duración total: </span>
            <span className="text-gray-400">{result.total_duration_ms}ms</span>
          </div>
          <div>
            <span className="text-gray-600">Timestamp: </span>
            <span className="text-gray-400">{new Date(result.timestamp).toLocaleString('es-ES')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
