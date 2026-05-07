import { useState, useEffect, useCallback } from 'react';
import { ScrollText, Plus, Loader2, RefreshCw, ChevronDown, ChevronUp, User, FileText } from 'lucide-react';
import type { Policy, NewPolicyRequest, PolicyDetail, CustomerHistory } from '../api';
import { getPolicies, registerPolicy, getPolicyDetail, getCustomers } from '../api';

const EMPTY_FORM: NewPolicyRequest = {
  customer_id: '',
  vehicle: '',
  coverage_type: 'Todo Riesgo',
  max_coverage: 50000,
  start_date: '',
  end_date: '',
};

function Field({ label, value }: Readonly<{ label: string; value: any }>) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-gray-500 shrink-0">{label}:</span>
      <span className="text-gray-200">{String(value)}</span>
    </div>
  );
}

export default function PolicyView() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [customers, setCustomers] = useState<CustomerHistory[]>([]);
  const [form, setForm] = useState<NewPolicyRequest>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PolicyDetail | null>(null);

  const refresh = useCallback(() => {
    getPolicies().then(setPolicies).catch(() => {});
    getCustomers().then(setCustomers).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_id || !form.vehicle || !form.max_coverage) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const newPolicy = await registerPolicy(form);
      setPolicies(prev => [newPolicy, ...prev]);
      setForm({ ...EMPTY_FORM });
      setSuccess(`Póliza ${newPolicy.policy_id} registrada correctamente.`);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar póliza');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleRow = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    try {
      const d = await getPolicyDetail(id);
      setDetail(d);
    } catch {
      setDetail(null);
    }
  };

  const inputClass = "w-full px-3 py-2 bg-surface-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 text-sm";
  const labelClass = "block text-xs font-medium text-gray-400 mb-1";
  const noCustomers = customers.length === 0;

  return (
    <div className="space-y-6">
      <div className="bg-surface-900 rounded-xl border border-gray-800 p-6">
        <div className="flex items-center gap-2 mb-1">
          <Plus className="w-5 h-5 text-primary-400" />
          <h2 className="text-lg font-semibold text-white">Registrar Nueva Póliza</h2>
        </div>
        <p className="text-xs text-gray-500 mb-6">La póliza se vincula a un cliente existente. Si el cliente no está dado de alta, créalo antes desde la pestaña Clientes.</p>

        {noCustomers && (
          <div className="mb-4 p-3 rounded-lg bg-yellow-900/30 border border-yellow-800 text-yellow-300 text-sm">
            No hay clientes registrados. Crea uno primero en la pestaña <strong>Clientes</strong>.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block md:col-span-2">
              <span className={labelClass}>Cliente *</span>
              <select value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))} className={inputClass} required disabled={noCustomers}>
                <option value="">— Selecciona un cliente —</option>
                {customers.map(c => (
                  <option key={c.customer_id} value={c.customer_id}>{c.customer_id} · {c.name} ({c.risk_profile})</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>Vehículo *</span>
              <input type="text" value={form.vehicle} onChange={e => setForm(f => ({ ...f, vehicle: e.target.value }))} placeholder="Toyota Corolla 2023" className={inputClass} required />
            </label>
            <label className="block">
              <span className={labelClass}>Tipo de cobertura</span>
              <select value={form.coverage_type} onChange={e => setForm(f => ({ ...f, coverage_type: e.target.value }))} className={inputClass}>
                <option value="Todo Riesgo">Todo Riesgo</option>
                <option value="Terceros">Terceros</option>
                <option value="Terceros Ampliado">Terceros Ampliado</option>
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>Cobertura máxima (€) *</span>
              <input type="number" value={form.max_coverage || ''} onChange={e => setForm(f => ({ ...f, max_coverage: Number.parseFloat(e.target.value) || 0 }))} placeholder="50000" min="1" className={inputClass} required />
            </label>
            <label className="block">
              <span className={labelClass}>Fecha de inicio</span>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Fecha de vencimiento</span>
              <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className={inputClass} />
            </label>
          </div>

          <button type="submit" disabled={submitting || noCustomers} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors">
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Registrando…</> : <><Plus className="w-4 h-4" /> Registrar Póliza</>}
          </button>
        </form>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {success && <p className="mt-3 text-sm text-green-400">{success}</p>}
      </div>

      <div className="bg-surface-900 rounded-xl border border-gray-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-primary-400" />
            <h2 className="text-lg font-semibold text-white">Pólizas Registradas</h2>
          </div>
          <button onClick={refresh} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
        </div>

        {policies.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No hay pólizas registradas.</p>
        ) : (
          <div className="space-y-2">
            {policies.map((p) => (
              <div key={p.policy_id} className="border border-gray-800 rounded-lg overflow-hidden">
                <button onClick={() => toggleRow(p.policy_id)} className="w-full flex items-center gap-4 px-4 py-3 hover:bg-surface-800/60 transition-colors text-left">
                  <span className="text-white font-mono text-xs w-32 shrink-0">{p.policy_id}</span>
                  <span className="text-gray-300 text-sm flex-1 min-w-0 truncate">{p.customer_name}</span>
                  <span className="text-gray-400 text-xs hidden md:inline">{p.vehicle}</span>
                  <span className="text-gray-400 text-xs hidden md:inline">{p.coverage_type}</span>
                  <span className="text-gray-300 text-xs">€{p.max_coverage.toLocaleString('es-ES')}</span>
                  <span className="px-2 py-0.5 rounded-full text-xs border bg-green-900/40 text-green-400 border-green-800">{p.status || 'Activa'}</span>
                  {expandedId === p.policy_id ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </button>

                {expandedId === p.policy_id && (
                  <div className="p-4 bg-surface-800/30 border-t border-gray-800">
                    {detail ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-surface-950 border border-gray-800 rounded p-3 space-y-1">
                          <div className="flex items-center gap-1.5 mb-2">
                            <FileText className="w-3.5 h-3.5 text-accent-400" />
                            <span className="font-semibold text-white text-xs">Datos de la póliza</span>
                          </div>
                          <Field label="ID póliza" value={detail.policy_id} />
                          <Field label="ID cliente" value={detail.customer_id} />
                          <Field label="Vehículo" value={detail.vehicle} />
                          <Field label="Cobertura" value={detail.coverage_type} />
                          <Field label="Máx. cubierto" value={`${detail.max_coverage.toLocaleString('es-ES')}€`} />
                          <Field label="Estado" value={detail.status} />
                          <Field label="Inicio" value={detail.start_date} />
                          <Field label="Vencimiento" value={detail.end_date} />
                        </div>
                        {detail.customer_history && (
                          <div className="bg-surface-950 border border-gray-800 rounded p-3 space-y-1">
                            <div className="flex items-center gap-1.5 mb-2">
                              <User className="w-3.5 h-3.5 text-accent-400" />
                              <span className="font-semibold text-white text-xs">Cliente vinculado</span>
                            </div>
                            <Field label="Nombre" value={detail.customer_history.name} />
                            <Field label="Antigüedad" value={`${detail.customer_history.years_as_customer} años`} />
                            <Field label="Reclamaciones previas" value={detail.customer_history.previous_claims} />
                            <Field label="Perfil de riesgo" value={detail.customer_history.risk_profile} />
                            <Field label="Historial de pagos" value={detail.customer_history.payment_history} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">Cargando detalle…</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
