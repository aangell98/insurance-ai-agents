import { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, Loader2, RefreshCw, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import type { CustomerHistory, NewCustomerRequest, CustomerDetail } from '../api';
import { getCustomers, registerCustomer, getCustomerDetail } from '../api';

const EMPTY_FORM: NewCustomerRequest = {
  name: '',
  years_as_customer: 0,
  previous_claims: 0,
  risk_profile: 'low',
  payment_history: 'excellent',
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

export default function CustomerView() {
  const [customers, setCustomers] = useState<CustomerHistory[]>([]);
  const [form, setForm] = useState<NewCustomerRequest>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);

  const fetchCustomers = useCallback(() => {
    getCustomers().then(setCustomers).catch(() => {});
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const newCustomer = await registerCustomer(form);
      setCustomers(prev => [newCustomer, ...prev]);
      setForm({ ...EMPTY_FORM });
      setSuccess(`Cliente ${newCustomer.customer_id} registrado correctamente.`);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar cliente');
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
      const d = await getCustomerDetail(id);
      setDetail(d);
    } catch {
      setDetail(null);
    }
  };

  const inputClass = "w-full px-3 py-2 bg-surface-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 text-sm";
  const labelClass = "block text-xs font-medium text-gray-400 mb-1";

  return (
    <div className="space-y-6">
      {/* Register form */}
      <div className="bg-surface-900 rounded-xl border border-gray-800 p-6">
        <div className="flex items-center gap-2 mb-1">
          <UserPlus className="w-5 h-5 text-primary-400" />
          <h2 className="text-lg font-semibold text-white">Registrar Nuevo Cliente</h2>
        </div>
        <p className="text-xs text-gray-500 mb-6">El cliente queda disponible para vincularle pólizas y los agentes consultarán su historial al evaluar siniestros.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className={labelClass}>Nombre completo *</span>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="María García López" className={inputClass} required />
            </label>
            <label className="block">
              <span className={labelClass}>Antigüedad como cliente (años)</span>
              <input type="number" value={form.years_as_customer} onChange={e => setForm(f => ({ ...f, years_as_customer: Number.parseInt(e.target.value) || 0 }))} min="0" className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Reclamaciones previas</span>
              <input type="number" value={form.previous_claims} onChange={e => setForm(f => ({ ...f, previous_claims: Number.parseInt(e.target.value) || 0 }))} min="0" className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Perfil de riesgo</span>
              <select value={form.risk_profile} onChange={e => setForm(f => ({ ...f, risk_profile: e.target.value }))} className={inputClass}>
                <option value="low">Bajo</option>
                <option value="medium">Medio</option>
                <option value="high">Alto</option>
                <option value="unknown">Desconocido</option>
              </select>
            </label>
            <label className="block md:col-span-2">
              <span className={labelClass}>Historial de pagos</span>
              <select value={form.payment_history} onChange={e => setForm(f => ({ ...f, payment_history: e.target.value }))} className={inputClass}>
                <option value="excellent">Excelente</option>
                <option value="good">Bueno</option>
                <option value="irregular">Irregular</option>
                <option value="new">Nuevo cliente</option>
              </select>
            </label>
          </div>

          <button type="submit" disabled={submitting} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors">
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Registrando…</> : <><UserPlus className="w-4 h-4" /> Registrar Cliente</>}
          </button>
        </form>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {success && <p className="mt-3 text-sm text-green-400">{success}</p>}
      </div>

      {/* Customer list */}
      <div className="bg-surface-900 rounded-xl border border-gray-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary-400" />
            <h2 className="text-lg font-semibold text-white">Clientes Registrados</h2>
          </div>
          <button onClick={fetchCustomers} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
        </div>

        {customers.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No hay clientes registrados.</p>
        ) : (
          <div className="space-y-2">
            {customers.map((c) => (
              <div key={c.customer_id} className="border border-gray-800 rounded-lg overflow-hidden">
                <button onClick={() => toggleRow(c.customer_id)} className="w-full flex items-center gap-4 px-4 py-3 hover:bg-surface-800/60 transition-colors text-left">
                  <span className="text-white font-mono text-xs w-28 shrink-0">{c.customer_id}</span>
                  <span className="text-gray-200 text-sm flex-1 min-w-0 truncate">{c.name}</span>
                  <span className="text-gray-400 text-xs hidden md:inline">{c.years_as_customer} años</span>
                  <span className="text-gray-400 text-xs hidden md:inline">{c.previous_claims} recl.</span>
                  <span className="px-2 py-0.5 rounded-full text-xs border bg-surface-800 text-gray-300 border-gray-700">{c.risk_profile}</span>
                  {expandedId === c.customer_id ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </button>

                {expandedId === c.customer_id && (
                  <div className="p-4 bg-surface-800/30 border-t border-gray-800 space-y-3">
                    {!detail ? (
                      <p className="text-xs text-gray-500">Cargando detalle…</p>
                    ) : (
                      <>
                        <div className="bg-surface-950 border border-gray-800 rounded p-3 space-y-1">
                          <Field label="ID cliente" value={detail.customer_id} />
                          <Field label="Nombre" value={detail.name} />
                          <Field label="Antigüedad" value={`${detail.years_as_customer} años`} />
                          <Field label="Reclamaciones previas" value={detail.previous_claims} />
                          <Field label="Perfil de riesgo" value={detail.risk_profile} />
                          <Field label="Historial de pagos" value={detail.payment_history} />
                          {detail.previous_claims_details.length > 0 && (
                            <div className="mt-2">
                              <span className="text-gray-500 text-xs">Reclamaciones anteriores:</span>
                              <ul className="mt-1 space-y-0.5 text-xs">
                                {detail.previous_claims_details.map((cl) => (
                                  <li key={`${cl.year}-${cl.type}`} className="text-gray-300">
                                    • {cl.year} · {cl.type} · {cl.amount.toLocaleString('es-ES')}€ · <span className="text-gray-500">{cl.status}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                        {detail.policies && detail.policies.length > 0 && (
                          <div className="bg-surface-950 border border-gray-800 rounded p-3">
                            <div className="flex items-center gap-1.5 mb-2">
                              <FileText className="w-3.5 h-3.5 text-accent-400" />
                              <span className="font-semibold text-white text-xs">Pólizas vinculadas ({detail.policies.length})</span>
                            </div>
                            <ul className="space-y-1 text-xs">
                              {detail.policies.map(p => (
                                <li key={p.policy_id} className="text-gray-300 flex gap-2">
                                  <span className="font-mono text-gray-400">{p.policy_id}</span>
                                  <span>·</span>
                                  <span>{p.vehicle}</span>
                                  <span>·</span>
                                  <span>{p.coverage_type}</span>
                                  <span>·</span>
                                  <span>{p.max_coverage.toLocaleString('es-ES')}€</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
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
