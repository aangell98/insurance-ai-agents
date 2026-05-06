import { useState, useEffect, useRef } from 'react';
import { Send, FileText, Loader2, ImagePlus, X } from 'lucide-react';
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
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getScenarios().then(setScenarios).catch(() => {});
  }, []);

  const loadScenario = (name: string) => {
    const s = scenarios[name];
    if (s) setForm({ ...s });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImagePreview(result);
      // Strip the data:...;base64, prefix
      const b64 = result.split(',')[1];
      setForm(f => ({ ...f, image_b64: b64 }));
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImagePreview(null);
    setForm(f => { const { image_b64: _, ...rest } = f; return rest as ClaimRequest; });
    if (fileInputRef.current) fileInputRef.current.value = '';
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
          <div className="flex gap-2 flex-wrap">
            {Object.entries(scenarios).map(([key, s]) => {
              const label =
                key === 'low_risk' ? '✅ Bajo Riesgo'
                : key === 'high_amount' ? '💰 Alto Monto'
                : key === 'prompt_injection' ? '🛡️ Prompt Injection'
                : '🚨 Fraudulento';
              return (
                <button
                  key={key}
                  onClick={() => loadScenario(key)}
                  className="px-3 py-1.5 text-xs rounded-md border border-gray-700 text-gray-400 hover:text-white hover:border-primary-500 transition-colors"
                >
                  {label}
                </button>
              );
            })}
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
            placeholder="POL-2026-001"
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
          <label className="block text-xs font-medium text-gray-400 mb-1">Imagen del Siniestro (opcional)</label>
          <div className="flex items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-surface-800 border border-gray-700 rounded-lg text-gray-400 hover:text-white hover:border-primary-500 transition-colors text-sm"
            >
              <ImagePlus className="w-4 h-4" />
              Adjuntar Imagen
            </button>
            {imagePreview && (
              <div className="relative">
                <img src={imagePreview} alt="Preview" className="h-16 w-16 object-cover rounded-lg border border-gray-700" />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute -top-2 -right-2 p-0.5 bg-red-600 rounded-full text-white hover:bg-red-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
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
