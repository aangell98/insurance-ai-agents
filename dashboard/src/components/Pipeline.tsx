import { FileSearch, ShieldAlert, Scale, Gavel } from 'lucide-react';

type Stage = 'intake' | 'risk_assessment' | 'compliance' | 'decision';
type StageStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface Props {
  statuses: Record<Stage, StageStatus>;
}

const stages: { key: Stage; label: string; icon: typeof FileSearch }[] = [
  { key: 'intake', label: 'Claims Intake', icon: FileSearch },
  { key: 'risk_assessment', label: 'Risk & Fraud', icon: ShieldAlert },
  { key: 'compliance', label: 'Compliance', icon: Scale },
  { key: 'decision', label: 'Decisión Final', icon: Gavel },
];

const statusStyles: Record<StageStatus, { ring: string; bg: string; text: string; dot: string }> = {
  pending: { ring: 'ring-gray-700', bg: 'bg-surface-800', text: 'text-gray-500', dot: 'bg-gray-600' },
  processing: { ring: 'ring-primary-500', bg: 'bg-primary-900/30', text: 'text-primary-300', dot: 'bg-primary-400 animate-progress-pulse' },
  completed: { ring: 'ring-green-500', bg: 'bg-green-900/20', text: 'text-green-300', dot: 'bg-green-400' },
  failed: { ring: 'ring-red-500', bg: 'bg-red-900/20', text: 'text-red-300', dot: 'bg-red-400' },
};

export default function Pipeline({ statuses }: Props) {
  return (
    <div className="bg-surface-900 rounded-xl border border-gray-800 p-6">
      <h3 className="text-sm font-medium text-gray-400 mb-4 uppercase tracking-wider">Pipeline Multi-Agente</h3>
      <div className="flex items-center gap-2">
        {stages.map((stage, i) => {
          const st = statuses[stage.key];
          const s = statusStyles[st];
          const Icon = stage.icon;
          return (
            <div key={stage.key} className="flex items-center flex-1">
              <div className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-lg ring-1 ${s.ring} ${s.bg} transition-all duration-500`}>
                <Icon className={`w-5 h-5 ${s.text}`} />
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${s.text}`}>{stage.label}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                    <span className="text-[10px] text-gray-500 uppercase">
                      {st === 'processing' ? 'Analizando...' : st === 'completed' ? 'Completado' : st === 'failed' ? 'Error' : 'Pendiente'}
                    </span>
                  </div>
                </div>
              </div>
              {i < stages.length - 1 && (
                <div className={`w-8 h-px mx-1 ${st === 'completed' ? 'bg-green-500' : 'bg-gray-700'} transition-colors duration-500`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
