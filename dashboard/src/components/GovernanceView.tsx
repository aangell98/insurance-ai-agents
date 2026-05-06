import { useEffect, useState } from 'react';
import {
  Shield,
  GitBranch,
  CheckCircle2,
  XCircle,
  Award,
  Cpu,
  FileCheck,
  Lock,
  AlertTriangle,
  Activity,
  Users,
} from 'lucide-react';
import { getGovernanceStatus, GovernanceStatus } from '../api';

function Pill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        ok
          ? 'bg-green-100 text-green-800 border border-green-200'
          : 'bg-red-100 text-red-800 border border-red-200'
      }`}
    >
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {children}
    </span>
  );
}

export function GovernanceView() {
  const [data, setData] = useState<GovernanceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const res = await getGovernanceStatus();
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error');
      }
    };
    fetchOnce();
    const id = setInterval(fetchOnce, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          <AlertTriangle className="inline w-5 h-5 mr-2" />
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="p-6 text-slate-500">Cargando estado de gobernanza…</div>;
  }

  const apimActive = data.apim.enabled;
  const passRate = data.evals.latest ? Math.round(data.evals.latest.pass_rate * 100) : null;

  return (
    <div className="p-6 space-y-6">
      {/* Hero header */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white rounded-xl shadow-lg p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm opacity-90 mb-1">
              <Award className="w-4 h-4" />
              <span>Gobernanza & Cumplimiento</span>
            </div>
            <h1 className="text-3xl font-bold mb-2">Centro de Control AI</h1>
            <p className="text-white/90 max-w-2xl">
              Cada llamada a IA atraviesa un AI Gateway con identidad gestionada, content
              safety y métricas de tokens. Cada cambio de prompt pasa por un pipeline de
              evaluación automática antes de llegar a producción.
            </p>
          </div>
          <div className="text-right text-sm">
            <div className="opacity-90">Pipeline</div>
            <div className="font-mono text-lg">v{data.pipeline_version}</div>
            <div className="opacity-75 text-xs mt-1">commit {data.git_commit}</div>
          </div>
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`rounded-xl p-5 border-2 ${apimActive ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
              <Shield className="w-4 h-4" />
              APIM AI Gateway
            </div>
            <Pill ok={apimActive}>{apimActive ? 'Activo' : 'Modo directo'}</Pill>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {apimActive ? `${data.apim.policies.filter(p => p.active).length} políticas` : 'Bypass para dev'}
          </div>
          <div className="text-xs text-slate-600 mt-1 truncate">{data.apim.gateway_url}</div>
        </div>

        <div className="rounded-xl p-5 border-2 bg-blue-50 border-blue-300">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
              <FileCheck className="w-4 h-4" />
              Eval Gate
            </div>
            {passRate !== null ? (
              <Pill ok={passRate >= 80}>{passRate}% pass</Pill>
            ) : (
              <span className="text-xs text-slate-500">sin ejecuciones</span>
            )}
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {data.evals.latest
              ? `${data.evals.latest.passed}/${data.evals.latest.total}`
              : '— / —'}
          </div>
          <div className="text-xs text-slate-600 mt-1">
            {data.evals.latest
              ? `Última ejecución: ${new Date(data.evals.latest.timestamp).toLocaleString()}`
              : 'Aún no se han ejecutado evals'}
          </div>
        </div>

        <div className="rounded-xl p-5 border-2 bg-violet-50 border-violet-300">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
              <Cpu className="w-4 h-4" />
              Modelo
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-violet-200 text-violet-700">
              GA
            </span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{data.model}</div>
          <div className="text-xs text-slate-600 mt-1">Azure OpenAI · GlobalStandard</div>
        </div>
      </div>

      {/* APIM policies + Evals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-indigo-600" />
            <h2 className="font-semibold text-slate-900">Políticas activas en el AI Gateway</h2>
          </div>
          <ul className="space-y-2">
            {data.apim.policies.map((p) => (
              <li key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{p.name}</span>
                <Pill ok={p.active}>{p.active ? 'on' : 'off'}</Pill>
              </li>
            ))}
          </ul>
          <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500">
            Definidas en <code className="px-1 py-0.5 bg-slate-100 rounded">infra/apim-policy.xml</code> y aplicadas
            por Bicep al desplegar APIM StandardV2.
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-blue-600" />
            <h2 className="font-semibold text-slate-900">Pipeline de evaluación</h2>
          </div>
          {data.evals.latest ? (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-slate-600">Tasa de aprobación</span>
                <span className={`text-3xl font-bold ${(passRate ?? 0) >= 80 ? 'text-green-600' : 'text-red-600'}`}>
                  {passRate}%
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-50 rounded-lg p-2">
                  <div className="text-xs text-slate-500">Total</div>
                  <div className="text-lg font-bold">{data.evals.latest.total}</div>
                </div>
                <div className="bg-green-50 rounded-lg p-2">
                  <div className="text-xs text-green-600">Pasaron</div>
                  <div className="text-lg font-bold text-green-700">{data.evals.latest.passed}</div>
                </div>
                <div className="bg-red-50 rounded-lg p-2">
                  <div className="text-xs text-red-600">Fallaron</div>
                  <div className="text-lg font-bold text-red-700">{data.evals.latest.failed}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-500">
              Aún no se ha ejecutado el dataset dorado. Ejecuta:
              <pre className="mt-2 bg-slate-900 text-slate-100 text-xs p-2 rounded overflow-x-auto">
python -m evals.run_evals
              </pre>
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500 space-y-1">
            <div>Dataset: <code className="px-1 py-0.5 bg-slate-100 rounded">{data.evals.dataset_path}</code></div>
            <div>Workflow: <code className="px-1 py-0.5 bg-slate-100 rounded">{data.evals.workflow}</code></div>
          </div>
        </div>
      </div>

      {/* Code ownership */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-pink-600" />
          <h2 className="font-semibold text-slate-900">Propiedad del código (CODEOWNERS)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-4">Ruta</th>
                <th className="py-2">Equipos responsables</th>
              </tr>
            </thead>
            <tbody>
              {data.code_ownership.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 font-mono text-xs text-slate-700">{row.path}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {row.owners.map((o) => (
                        <span
                          key={o}
                          className="inline-block bg-indigo-100 text-indigo-800 text-xs font-medium px-2 py-0.5 rounded"
                        >
                          {o}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-xs text-slate-500">
          GitHub bloquea automáticamente PRs que tocan estos paths sin aprobación de los equipos correspondientes.
        </div>
      </div>

      {/* Process checks */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-5 h-5 text-emerald-600" />
          <h2 className="font-semibold text-slate-900">Checks de proceso & evidencia auditable</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {Object.entries(data.checks).map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 border border-slate-100"
            >
              <span className="text-sm text-slate-700">{prettifyCheck(k)}</span>
              <Pill ok={v}>{v ? 'presente' : 'falta'}</Pill>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-slate-400 flex items-center justify-center gap-2">
        <GitBranch className="w-3 h-3" />
        commit {data.git_commit} · pipeline v{data.pipeline_version} · refrescado{' '}
        {new Date(data.deployed_at).toLocaleTimeString()}
      </div>
    </div>
  );
}

function prettifyCheck(k: string): string {
  const map: Record<string, string> = {
    pull_request_template: 'Plantilla de Pull Request',
    codeowners: 'Archivo CODEOWNERS',
    deploy_workflow: 'Workflow de despliegue por agente',
    eval_workflow: 'Workflow Eval-Gate en PRs',
    infra_as_code: 'Infraestructura como código (Bicep)',
    apim_policy_xml: 'Política XML del AI Gateway',
  };
  return map[k] || k;
}
