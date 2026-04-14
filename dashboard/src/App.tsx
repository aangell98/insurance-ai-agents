import { useState, useCallback } from 'react';
import { Shield, Activity } from 'lucide-react';
import ClaimForm from './components/ClaimForm';
import Pipeline from './components/Pipeline';
import DecisionPanel from './components/DecisionPanel';
import AuditTrail from './components/AuditTrail';
import type { ClaimRequest, ClaimResult, PipelineUpdate } from './api';
import { evaluateClaim, connectWebSocket } from './api';

type Stage = 'intake' | 'risk_assessment' | 'compliance' | 'decision';
type StageStatus = 'pending' | 'processing' | 'completed' | 'failed';

export default function App() {
  const [stageStatuses, setStageStatuses] = useState<Record<Stage, StageStatus>>({
    intake: 'pending',
    risk_assessment: 'pending',
    compliance: 'pending',
    decision: 'pending',
  });
  const [stageData, setStageData] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const resetPipeline = useCallback(() => {
    setStageStatuses({ intake: 'pending', risk_assessment: 'pending', compliance: 'pending', decision: 'pending' });
    setStageData({});
    setResult(null);
    setError('');
  }, []);

  const handleSubmit = useCallback(async (req: ClaimRequest) => {
    resetPipeline();
    setLoading(true);

    // Generate a temporary claim ID for WebSocket
    const tempId = `CLM-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    // Connect WebSocket for real-time updates
    const ws = connectWebSocket(tempId, (update: PipelineUpdate) => {
      const stage = update.stage as Stage;
      const status = update.status === 'processing' ? 'processing' : update.status === 'completed' ? 'completed' : 'failed';
      setStageStatuses(prev => ({ ...prev, [stage]: status as StageStatus }));
      if (update.data && Object.keys(update.data).length > 0) {
        setStageData(prev => ({ ...prev, [stage]: update.data }));
      }
    });

    try {
      const res = await evaluateClaim(req);
      setResult(res);
      setStageStatuses({ intake: 'completed', risk_assessment: 'completed', compliance: 'completed', decision: 'completed' });
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
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Claim Submission */}
        <section>
          <ClaimForm onSubmit={handleSubmit} loading={loading} />
        </section>

        {/* Pipeline Visualization */}
        {(loading || result) && (
          <section className="animate-slide-in">
            <Pipeline statuses={stageStatuses} />
          </section>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 rounded-lg bg-red-900/30 border border-red-800 text-red-300">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Decision + Audit */}
        {result && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-slide-in">
            <DecisionPanel result={result} />
            <AuditTrail result={result} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-12 py-6 text-center text-xs text-gray-600">
        Powered by Azure AI Foundry • Governed by GitHub • Secured by APIM AI Gateway
      </footer>
    </div>
  );
}
