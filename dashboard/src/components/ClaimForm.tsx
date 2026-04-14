import { useState, useEffect } from 'react';
import { Send, FileText, Loader2 } from 'lucide-react';
import type { ClaimRequest, Scenario } from '../api';
import { getScenarios } from '../api';

interface Props {
  onSubmit: (req: ClaimRequest) => void;
  loading: boolean;
}

export default function ClaimForm({ onSubmit, loading }: Props) {
  const [scenarios, setScenarios] = useState<Record<string, Scenario>>({});
  const [form, setForm] = useState<ClaimRequest>({
    policy_id: '',
    customer_id: '',
    incident_type: 'collision',
    description: '',
    estimated_amount: 0,
  });

  useEffect(() => {
    getScenarios().then(setScenarios).catch(() => {});
  }, []);

  const loadScenario = (name: string) => {
    const s = scenarios[name];
    if (s) setForm({ ...s });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.policy_id || !form.description) return;
    onSubmit(form);
  };

  return (
    <div className="bg-surface-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary-400" />
          <h2 className="text-lg font-semibold text-white">Nuevo Siniestro</h2>
        </div>
        {Object.keys(scenarios).length > 0 && (
          <div className="flex gap-2">
            {Object.entries(scenarios).map(([key, s]) => (
              <button
                key={key}
                onClick={() => loadScenario(key)}
                className="px-3 py-1.5 text-xs rounded-md border border-gray-700 text-gray-400 hover:text-white hover:border-primary-500 transition-colors"
              >
                {key === 'low_risk' ? '✅ Bajo Riesgo' : key === 'high_amount' ? '💰 Alto Monto' : '🚨 Fraudulento'}
              </button>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Póliza ID</label>
          <input
            type="text"
            value={form.policy_id}
            onChange={e => setForm(f => ({ ...f, policy_id: e.target.value }))}
            placeholder="POL-2024-001"
            className="w-full px-3 py-2 bg-surface-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Cliente ID</label>
          <input
            type="text"
            value={form.customer_id}
            onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}
            placeholder="CUST-1001"
            className="w-full px-3 py-2 bg-surface-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Tipo de Incidente</label>
          <select
            value={form.incident_type}
            onChange={e => setForm(f => ({ ...f, incident_type: e.target.value }))}
            className="w-full px-3 py-2 bg-surface-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-500 text-sm"
          >
            <option value="collision">Colisión</option>
            <option value="theft">Robo</option>
            <option value="fire">Incendio</option>
            <option value="natural_disaster">Desastre Natural</option>
            <option value="vandalism">Vandalismo</option>
            <option value="other">Otro</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Monto Estimado (€)</label>
          <input
            type="number"
            value={form.estimated_amount || ''}
            onChange={e => setForm(f => ({ ...f, estimated_amount: parseFloat(e.target.value) || 0 }))}
            placeholder="2500"
            min="1"
            className="w-full px-3 py-2 bg-surface-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 text-sm"
            required
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-400 mb-1">Descripción del Siniestro</label>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Describe los hechos del siniestro..."
            rows={4}
            className="w-full px-3 py-2 bg-surface-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 text-sm resize-none"
            required
          />
        </div>

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Procesando Siniestro...</>
            ) : (
              <><Send className="w-4 h-4" /> Evaluar Siniestro</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
