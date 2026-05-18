import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, FileSearch } from 'lucide-react';

export interface IntakeExtractionPanelProps {
  scenarioText: string;
  active: boolean;
  extractedFields?: {
    incident_type?: string;
    estimated_amount?: number;
    vehicle?: string;
    date?: string;
    location?: string;
  };
}

type HighlightTone = 'amount' | 'incident' | 'vehicle' | 'date' | 'location';

interface HighlightMatch {
  start: number;
  end: number;
  text: string;
  tone: HighlightTone;
}

const HIGHLIGHT_RULES: Array<{
  tone: HighlightTone;
  label: string;
  regex: RegExp;
  className: string;
  dotClassName: string;
}> = [
  {
    tone: 'amount',
    label: 'Monto',
    regex: /\d+[.,]?\d*\s*(?:€|euros?)/gi,
    className: 'bg-emerald-400/15 text-emerald-200 shadow-[0_0_0_1px_rgba(52,211,153,0.2)]',
    dotClassName: 'bg-emerald-300',
  },
  {
    tone: 'incident',
    label: 'Tipo',
    regex: /\b(?:colisi[oó]n|incendio|robo|inundaci[oó]n|granizo|vandalismo|fire|collision)\b/gi,
    className: 'bg-amber-400/15 text-amber-200 shadow-[0_0_0_1px_rgba(251,191,36,0.22)]',
    dotClassName: 'bg-amber-300',
  },
  {
    tone: 'vehicle',
    label: 'Vehículo',
    regex: /\b(?:tesla|bmw|audi|seat|coche|veh[ií]culo|moto)\b/gi,
    className: 'bg-cyan-400/15 text-cyan-200 shadow-[0_0_0_1px_rgba(34,211,238,0.22)]',
    dotClassName: 'bg-cyan-300',
  },
  {
    tone: 'date',
    label: 'Fecha',
    regex: /\b\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/gi,
    className: 'bg-violet-400/15 text-violet-200 shadow-[0_0_0_1px_rgba(167,139,250,0.24)]',
    dotClassName: 'bg-violet-300',
  },
  {
    tone: 'location',
    label: 'Ubicación',
    regex: /\b(?:Madrid|Barcelona|Valencia|Sevilla|parking|calle|carretera|autopista|A-\d+|M-\d+)\b/gi,
    className: 'bg-fuchsia-400/15 text-fuchsia-200 shadow-[0_0_0_1px_rgba(232,121,249,0.22)]',
    dotClassName: 'bg-fuchsia-300',
  },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function findHighlightMatches(text: string): HighlightMatch[] {
  const rawMatches: HighlightMatch[] = [];

  HIGHLIGHT_RULES.forEach(({ tone, regex }) => {
    const matcher = new RegExp(regex.source, regex.flags);
    let match: RegExpExecArray | null;

    while ((match = matcher.exec(text)) !== null) {
      rawMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        tone,
      });

      if (match.index === matcher.lastIndex) {
        matcher.lastIndex += 1;
      }
    }
  });

  rawMatches.sort((left, right) => {
    if (left.start !== right.start) return left.start - right.start;
    return (right.end - right.start) - (left.end - left.start);
  });

  return rawMatches.reduce<HighlightMatch[]>((accumulator, current) => {
    const previous = accumulator[accumulator.length - 1];
    if (!previous || current.start >= previous.end) {
      accumulator.push(current);
      return accumulator;
    }

    if ((current.end - current.start) > (previous.end - previous.start)) {
      accumulator[accumulator.length - 1] = current;
    }

    return accumulator;
  }, []);
}

export default function IntakeExtractionPanel({
  scenarioText,
  active,
  extractedFields,
}: IntakeExtractionPanelProps) {
  const [visibleHighlights, setVisibleHighlights] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const highlightRefs = useRef<Array<HTMLSpanElement | null>>([]);

  const hasScenarioText = scenarioText.trim().length > 0;
  const highlightMatches = useMemo(() => (hasScenarioText ? findHighlightMatches(scenarioText) : []), [hasScenarioText, scenarioText]);

  const extractedItems = useMemo(() => {
    const items: Array<{ id: string; label: string; value: string }> = [];

    if (typeof extractedFields?.incident_type === 'string' && extractedFields.incident_type.trim()) {
      items.push({ id: 'incident_type', label: 'Tipo de incidente', value: extractedFields.incident_type });
    }

    if (typeof extractedFields?.estimated_amount === 'number' && Number.isFinite(extractedFields.estimated_amount)) {
      items.push({
        id: 'estimated_amount',
        label: 'Monto estimado',
        value: `${extractedFields.estimated_amount.toLocaleString('es-ES')}€`,
      });
    }

    if (typeof extractedFields?.vehicle === 'string' && extractedFields.vehicle.trim()) {
      items.push({ id: 'vehicle', label: 'Vehículo', value: extractedFields.vehicle });
    }

    if (typeof extractedFields?.date === 'string' && extractedFields.date.trim()) {
      items.push({ id: 'date', label: 'Fecha', value: extractedFields.date });
    }

    if (typeof extractedFields?.location === 'string' && extractedFields.location.trim()) {
      items.push({ id: 'location', label: 'Ubicación', value: extractedFields.location });
    }

    return items;
  }, [extractedFields]);

  const shouldScrollExtractedItems = extractedItems.length > 5;

  useEffect(() => {
    highlightRefs.current = [];
    scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });

    if (!active || highlightMatches.length === 0) {
      setVisibleHighlights(0);
      return;
    }

    setVisibleHighlights(0);
    const timers = highlightMatches.map((_, index) => window.setTimeout(() => setVisibleHighlights(index + 1), index * 200));

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [active, highlightMatches]);

  useEffect(() => {
    if (!active || visibleHighlights === 0) {
      return;
    }

    const container = scrollRef.current;
    const target = highlightRefs.current[visibleHighlights - 1];

    if (!container || !target) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetTop = targetRect.top - containerRect.top + container.scrollTop;
    const targetHeight = target.offsetHeight || targetRect.height;
    const targetBottom = targetTop + targetHeight;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;

    if (targetTop < viewTop || targetBottom > viewBottom) {
      container.scrollTo({
        top: Math.max(0, targetTop - container.clientHeight / 2 + targetHeight / 2),
        behavior: 'smooth',
      });
    }
  }, [active, visibleHighlights]);

  const renderedScenarioText = useMemo(() => {
    if (highlightMatches.length === 0) {
      return scenarioText;
    }

    const fragments: ReactNode[] = [];
    let cursor = 0;

    highlightMatches.forEach((match, index) => {
      if (cursor < match.start) {
        fragments.push(
          <Fragment key={`text-${cursor}`}>
            {scenarioText.slice(cursor, match.start)}
          </Fragment>,
        );
      }

      const visible = active && index < visibleHighlights;
      const toneClass = HIGHLIGHT_RULES.find((rule) => rule.tone === match.tone)?.className ?? '';

      fragments.push(
        <span
          key={`match-${match.start}-${match.end}`}
          ref={(node) => {
            highlightRefs.current[index] = node;
          }}
          className={cx(
            'rounded-md px-1 py-0.5 transition-colors duration-300',
            visible && toneClass,
          )}
          style={visible ? { animation: 'highlightFade 0.45s ease-out both' } : undefined}
        >
          {match.text}
        </span>,
      );

      cursor = match.end;
    });

    if (cursor < scenarioText.length) {
      fragments.push(
        <Fragment key={`tail-${cursor}`}>
          {scenarioText.slice(cursor)}
        </Fragment>,
      );
    }

    return fragments;
  }, [active, highlightMatches, scenarioText, visibleHighlights]);

  return (
    <section className="rounded-[28px] border border-white/10 bg-surface-900/80 p-6 shadow-2xl shadow-black/20 backdrop-blur-sm">
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">Lectura del parte</p>
            <h3 className="mt-2 text-lg font-semibold text-white">Texto del siniestro</h3>
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-slate-300">
            {HIGHLIGHT_RULES.map((rule) => (
              <div
                key={rule.tone}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1"
              >
                <span className={cx('h-2.5 w-2.5 rounded-full', rule.dotClassName)} />
                <span>{rule.label}</span>
              </div>
            ))}
          </div>

          <div
            ref={scrollRef}
            className="scrollbar-clean max-h-[360px] overflow-y-auto rounded-xl border border-white/10 bg-surface-800 p-5"
          >
            {hasScenarioText ? (
              <p className="whitespace-pre-wrap text-sm leading-7 text-slate-200">{renderedScenarioText}</p>
            ) : (
              <div className="flex min-h-[160px] items-center justify-center text-sm text-slate-500">
                Esperando descripción del siniestro…
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-200 shadow-inner shadow-white/5">
              <FileSearch className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">Intake agent</p>
              <h3 className="text-lg font-semibold text-white">Campos extraídos</h3>
            </div>
          </div>

          <div
            className={cx(
              'space-y-3',
              shouldScrollExtractedItems && 'scrollbar-clean max-h-[360px] overflow-y-auto pr-1',
            )}
          >
            {extractedItems.length > 0 ? extractedItems.map((item, index) => (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-lg border border-emerald-700/40 bg-emerald-900/30 p-3 text-emerald-100"
                style={active ? { animation: `slideInLeft 0.45s ease-out ${index * 200}ms both` } : undefined}
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-emerald-50">✓ {item.label}: {item.value}</p>
                </div>
              </div>
            )) : active ? (
              Array.from({ length: 3 }, (_, index) => (
                <div
                  key={`ghost-row-${index}`}
                  className="flex items-center gap-3 rounded-lg border border-white/10 bg-surface-800/90 p-3"
                >
                  <div className="h-5 w-5 rounded-full bg-slate-700/80 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-3/5 rounded-full bg-slate-700/80 animate-pulse" />
                    <div className="h-3 w-2/5 rounded-full bg-slate-700/60 animate-pulse" />
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 bg-surface-800/80 p-4 text-sm text-slate-500">
                Esperando extracción estructurada.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
