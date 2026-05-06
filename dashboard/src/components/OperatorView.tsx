import { useState, useEffect, useCallback } from 'react';
import { ClipboardList, ChevronDown, ChevronUp, RefreshCw, Brain, ShieldCheck, Scale, Image as ImageIcon, FileText, User, Sparkles } from 'lucide-react';
import type { ClaimSummary, ClaimAuditDetail } from '../api';
import { getClaims, getClaimAudit, getClaimImage } from '../api';

const DECISION_BADGE: Record<string, string> = {
  approve: 'bg-green-900/40 text-green-400 border-green-800',
  human_review: 'bg-yellow-900/40 text-yellow-400 border-yellow-800',
  reject: 'bg-red-900/40 text-red-400 border-red-800',
};

const DECISION_LABEL: Record<string, string> = {
  approve: 'Aprobado',
  human_review: 'Revisión',
  reject: 'Rechazado',
};

function Section({ icon: Icon, title, aiBadge, children }: Readonly<{ icon: any; title: string; aiBadge?: boolean; children: React.ReactNode }>) {
  return (
    <div className="bg-surface-900/60 rounded-lg border border-gray-800 p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary-400" />
          <h4 className="text-sm font-semibold text-white">{title}</h4>
        </div>
        {aiBadge && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-primary-900/40 border border-primary-800 text-primary-300">
            <Sparkles className="w-3 h-3" />
            GPT-4o · Azure OpenAI
          </span>
        )}
      </div>
      <div className="text-xs text-gray-300 space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, value }: Readonly<{ label: string; value: any }>) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex gap-2">
      <span className="text-gray-500 shrink-0">{label}:</span>
      <span className="text-gray-200">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
    </div>
  );
}

export default function OperatorView() {
  const [claims, setClaims] = useState<ClaimSummary[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClaimAuditDetail | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchClaims = useCallback(() => {
    getClaims().then(setClaims).catch(() => {});
  }, []);

  useEffect(() => {
    fetchClaims();
    const interval = setInterval(fetchClaims, 10_000);
    return () => clearInterval(interval);
  }, [fetchClaims]);

  const toggleRow = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      setImage(null);
      return;
    }
    setExpandedId(id);
    setLoading(true);
    setDetail(null);
    setImage(null);
    try {
      const data = await getClaimAudit(id);
      setDetail(data);
      if (data.has_image) {
        const img = await getClaimImage(id);
        setImage(img);
      }
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary-400" />
          <h2 className="text-lg font-semibold text-white">Panel del Operario</h2>
        </div>
        <button
          onClick={fetchClaims}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {claims.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">No hay siniestros procesados aún.</p>
      ) : (
        <div className="space-y-2">
          {claims.map((c) => (
            <div key={c.claim_id} className="border border-gray-800 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleRow(c.claim_id)}
                className="w-full flex items-center gap-4 px-4 py-3 hover:bg-surface-800/60 transition-colors text-left"
              >
                <span className="text-white font-mono text-xs">{c.claim_id}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs border ${DECISION_BADGE[c.decision] || 'text-gray-400 border-gray-700'}`}>
                  {DECISION_LABEL[c.decision] || c.decision}
                </span>
                <span className="text-xs text-gray-400">{(c.confidence * 100).toFixed(0)}% confianza</span>
                <span className="text-xs text-gray-500">{(c.total_duration_ms / 1000).toFixed(2)}s</span>
                <span className="text-xs text-gray-600 ml-auto">{new Date(c.timestamp).toLocaleString('es-ES')}</span>
                {expandedId === c.claim_id ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
              </button>

              {expandedId === c.claim_id && (
                <div className="p-4 bg-surface-800/30 border-t border-gray-800">
                  {(() => {
                    if (loading) return <p className="text-xs text-gray-500">Cargando detalle…</p>;
                    if (!detail) return <p className="text-xs text-gray-500">No se pudo cargar el detalle.</p>;
                    return (
                      <div className="space-y-4">
                        <div className="bg-primary-900/20 border border-primary-800/40 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-primary-300">Decisión final del orquestador</h3>
                            <span className={`px-2 py-0.5 rounded-full text-xs border ${DECISION_BADGE[detail.decision]}`}>
                              {DECISION_LABEL[detail.decision]} · {(detail.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                          <p className="text-sm text-gray-200 leading-relaxed">{detail.reasoning}</p>
                        </div>

                        {image && (
                          <Section icon={ImageIcon} title="Evidencia fotográfica analizada por GPT-4o Vision">
                            <div className="flex flex-col md:flex-row gap-4 items-start min-w-0">
                              <img
                                src={`data:image/jpeg;base64,${image}`}
                                alt="Evidencia"
                                className="w-full md:w-48 max-h-48 object-contain rounded border border-gray-700 shrink-0 bg-surface-950"
                              />
                              <div className="flex-1 min-w-0">
                                <span className="text-gray-500">Análisis del agente sobre la imagen:</span>
                                <p className="text-gray-200 mt-1 leading-relaxed break-words">
                                  {detail.intake_result?.image_analysis || 'El agente integró el análisis visual en el resumen general.'}
                                </p>
                              </div>
                            </div>
                          </Section>
                        )}

                        {(detail.policy || detail.customer_history) && (
                          <Section icon={FileText} title="Fuentes de datos consultadas por los agentes">
                            <p className="text-gray-500 italic mb-2">Esta es la información real del sistema (póliza + historial del cliente) que los agentes han usado vía tool calls. No es invención del LLM.</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {detail.policy && (
                                <div className="bg-surface-950 border border-gray-800 rounded p-3">
                                  <div className="flex items-center gap-1.5 mb-2">
                                    <FileText className="w-3.5 h-3.5 text-accent-400" />
                                    <span className="font-semibold text-white text-xs">Póliza {detail.policy.policy_id}</span>
                                  </div>
                                  <Field label="Titular" value={detail.policy.customer_name} />
                                  <Field label="Vehículo" value={detail.policy.vehicle} />
                                  <Field label="Cobertura" value={detail.policy.coverage_type} />
                                  <Field label="Máx. cubierto" value={`${detail.policy.max_coverage.toLocaleString('es-ES')}€`} />
                                  <Field label="Estado" value={detail.policy.status} />
                                  <Field label="Vigencia" value={detail.policy.start_date && detail.policy.end_date ? `${detail.policy.start_date} → ${detail.policy.end_date}` : null} />
                                </div>
                              )}
                              {detail.customer_history && (
                                <div className="bg-surface-950 border border-gray-800 rounded p-3">
                                  <div className="flex items-center gap-1.5 mb-2">
                                    <User className="w-3.5 h-3.5 text-accent-400" />
                                    <span className="font-semibold text-white text-xs">Cliente {detail.customer_history.customer_id}</span>
                                  </div>
                                  <Field label="Nombre" value={detail.customer_history.name} />
                                  <Field label="Antigüedad" value={`${detail.customer_history.years_as_customer} años`} />
                                  <Field label="Reclamaciones previas" value={detail.customer_history.previous_claims} />
                                  <Field label="Perfil de riesgo" value={detail.customer_history.risk_profile} />
                                  <Field label="Historial de pagos" value={detail.customer_history.payment_history} />
                                  {detail.customer_history.previous_claims_details.length > 0 && (
                                    <div className="mt-2">
                                      <span className="text-gray-500">Reclamaciones anteriores:</span>
                                      <ul className="mt-1 space-y-0.5">
                                        {detail.customer_history.previous_claims_details.map((c) => (
                                          <li key={`${c.year}-${c.type}`} className="text-gray-300">
                                            • {c.year} · {c.type} · {c.amount.toLocaleString('es-ES')}€ · <span className="text-gray-500">{c.status}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </Section>
                        )}

                        <Section icon={Brain} title="Agente 1 · Claims Intake" aiBadge>
                          <Field label="Póliza válida" value={detail.intake_result?.policy_valid} />
                          <Field label="Severidad" value={detail.intake_result?.severity} />
                          <div className="pt-1">
                            <span className="text-gray-500">Resumen del agente:</span>
                            <p className="text-gray-200 mt-1 leading-relaxed">{detail.intake_result?.summary}</p>
                          </div>
                          {detail.intake_result?.extracted_data && (
                            <details className="pt-2">
                              <summary className="cursor-pointer text-gray-500 hover:text-gray-300">Datos extraídos</summary>
                              <pre className="mt-2 p-2 bg-surface-950 rounded text-[11px] text-gray-300 overflow-x-auto">{JSON.stringify(detail.intake_result.extracted_data, null, 2)}</pre>
                            </details>
                          )}
                        </Section>

                        <Section icon={ShieldCheck} title="Agente 2 · Risk Assessment" aiBadge>
                          <Field label="Score de riesgo" value={`${detail.risk_result?.risk_score}/10`} />
                          <Field label="Probabilidad de fraude" value={detail.risk_result?.fraud_probability} />
                          <div className="pt-1">
                            <span className="text-gray-500">Razonamiento:</span>
                            <p className="text-gray-200 mt-1 leading-relaxed">{detail.risk_result?.reasoning}</p>
                          </div>
                          {Array.isArray(detail.risk_result?.risk_factors) && detail.risk_result.risk_factors.length > 0 && (
                            <div className="pt-2">
                              <span className="text-gray-500">Factores considerados:</span>
                              <ul className="mt-1 space-y-1">
                                {detail.risk_result.risk_factors.map((f: any) => (
                                  <li key={f.factor} className="flex items-start gap-2">
                                    <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${f.impact === 'positive' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                    <span className="text-gray-300">{f.factor} <span className="text-gray-600">(peso {f.weight})</span></span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </Section>

                        <Section icon={Scale} title="Agente 3 · Compliance" aiBadge>
                          <Field label="Cumple normativa" value={detail.compliance_result?.compliant ? 'Sí' : 'No'} />
                          <Field label="Decisión recomendada" value={detail.compliance_result?.decision} />
                          <div className="pt-1">
                            <span className="text-gray-500">Razonamiento:</span>
                            <p className="text-gray-200 mt-1 leading-relaxed">{detail.compliance_result?.reasoning}</p>
                          </div>
                          {Array.isArray(detail.compliance_result?.regulations_checked) && (
                            <div className="pt-2">
                              <span className="text-gray-500">Regulaciones aplicadas:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {detail.compliance_result.regulations_checked.map((r: string) => (
                                  <span key={r} className="px-2 py-0.5 bg-surface-950 border border-gray-700 rounded text-[11px] text-gray-300">{r}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </Section>

                        <Section icon={ClipboardList} title="Trazabilidad del pipeline">
                          {detail.audit_trail.map((a) => (
                            <div key={a.stage} className="flex items-start gap-3">
                              <span className="font-mono text-primary-400 w-32 shrink-0">{a.stage}</span>
                              <span className={`w-20 shrink-0 ${a.status === 'completed' ? 'text-green-400' : 'text-red-400'}`}>{a.status}</span>
                              <span className="text-gray-500 w-16 shrink-0 text-right">{a.duration_ms}ms</span>
                              <span className="text-gray-300 flex-1">{a.result_summary}</span>
                            </div>
                          ))}
                        </Section>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
