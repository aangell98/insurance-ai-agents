import { useState, useCallback } from 'react';
import { Shield, Activity, UserCircle, ClipboardList, BarChart3, ScrollText, Users, ShieldAlert } from 'lucide-react';
import ClaimForm from './components/ClaimForm';
import Pipeline from './components/Pipeline';
import DecisionPanel from './components/DecisionPanel';
import AuditTrail from './components/AuditTrail';
import ActivityFeed from './components/ActivityFeed';
import OperatorView from './components/OperatorView';
import StatsView from './components/StatsView';
import PolicyView from './components/PolicyView';
import CustomerView from './components/CustomerView';
import SecurityView from './components/SecurityView';
import type { ActivityEvent } from './components/ActivityFeed';
import type { ClaimRequest, ClaimResult, PipelineUpdate } from './api';
import { evaluateClaim, connectWebSocket } from './api';

type Stage = 'intake' | 'risk_assessment' | 'compliance' | 'decision';
type StageStatus = 'pending' | 'processing' | 'completed' | 'failed';
type Tab = 'cliente' | 'operario' | 'estadisticas' | 'clientes' | 'polizas' | 'seguridad';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'cliente', label: 'Cliente', icon: UserCircle },
  { id: 'operario', label: 'Operario', icon: ClipboardList },
  { id: 'estadisticas', label: 'Estadísticas', icon: BarChart3 },
  { id: 'clientes', label: 'Clientes', icon: Users },
  { id: 'polizas', label: 'Pólizas', icon: ScrollText },
  { id: 'seguridad', label: 'Seguridad', icon: ShieldAlert },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('cliente');
  const [stageStatuses, setStageStatuses] = useState<Record<Stage, StageStatus>>({
    intake: 'pending',
    risk_assessment: 'pending',
    compliance: 'pending',
    decision: 'pending',
  });
  const [stageData, setStageData] = useState<Record<string, unknown>>({});
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const resetPipeline = useCallback(() => {
    setStageStatuses({ intake: 'pending', risk_assessment: 'pending', compliance: 'pending', decision: 'pending' });
    setStageData({});
    setActivityEvents([]);
    setResult(null);
    setError('');
  }, []);

  const handleSubmit = useCallback(async (req: ClaimRequest) => {
    resetPipeline();
    setLoading(true);

    // Generate claim ID shared between WebSocket and REST call
    const claimId = `CLM-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

    // Connect WebSocket FIRST for real-time stage updates
    const { ws, ready } = connectWebSocket(claimId, (update: PipelineUpdate) => {
      const stage = update.stage as Stage;
      const status = update.status === 'processing' ? 'processing' : update.status === 'completed' ? 'completed' : 'failed';
      setStageStatuses(prev => ({ ...prev, [stage]: status as StageStatus }));
      if (update.data && Object.keys(update.data).length > 0) {
        setStageData(prev => ({ ...prev, [stage]: update.data }));
      }
      // Add to activity feed
      setActivityEvents(prev => [...prev, {
        stage: update.stage,
        status: update.status,
        timestamp: update.timestamp || new Date().toISOString(),
        data: update.data,
      }]);
    });

    try {
      // Wait for WebSocket to be ready before sending the HTTP request
      await ready;
      // Send claim_id so backend uses the same ID as the WebSocket
      const res = await evaluateClaim({ ...req, claim_id: claimId });
      setResult(res);
      // Ensure all stages show completed (WebSocket may have already set most)
      setStageStatuses(prev => ({ ...prev, decision: 'completed' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
      ws.close();
    }
  }, [resetPipeline]);

  return (
    <div className="min-h-screen bg-surface-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-surface-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary-600/20">
              <Shield className="w-6 h-6 text-primary-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white tracking-tight">
                Insurance AI <span className="text-primary-400">Claims Intelligence</span>
              </h1>
              <p className="text-xs text-gray-500">Multi-Agent Decision Platform — Governed & Auditable</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Activity className="w-3.5 h-3.5 text-green-400" />
            <span>Pipeline Active</span>
            <span className="mx-2 text-gray-700">|</span>
            <span>v1.0.0</span>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-1 -mb-px">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === id
                    ? 'border-primary-500 text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* ── Cliente View ── */}
        {activeTab === 'cliente' && (
          <>
            <section>
              <ClaimForm onSubmit={handleSubmit} loading={loading} />
            </section>

            {(loading || result) && (
              <section className="animate-slide-in">
                <Pipeline statuses={stageStatuses} />
              </section>
            )}

            {activityEvents.length > 0 && (
              <section>
                <ActivityFeed events={activityEvents} />
              </section>
            )}

            {error && (
              <div className="p-4 rounded-lg bg-red-900/30 border border-red-800 text-red-300">
                <strong>Error:</strong> {error}
              </div>
            )}

            {result && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-slide-in">
                <DecisionPanel result={result} />
                <AuditTrail result={result} />
              </div>
            )}
          </>
        )}

        {/* ── Operario View ── */}
        {activeTab === 'operario' && <OperatorView />}

        {/* ── Estadísticas View ── */}
        {activeTab === 'estadisticas' && <StatsView />}

        {/* ── Clientes View ── */}
        {activeTab === 'clientes' && <CustomerView />}

        {/* ── Pólizas View ── */}
        {activeTab === 'polizas' && <PolicyView />}

        {/* ── Seguridad View ── */}
        {activeTab === 'seguridad' && <SecurityView />}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-12 py-6 text-center text-xs text-gray-600">
        Powered by Azure AI Foundry • Governed by GitHub • Secured by APIM AI Gateway
      </footer>
    </div>
  );
}
