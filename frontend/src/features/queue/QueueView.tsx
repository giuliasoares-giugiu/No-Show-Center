import { useEffect, useMemo, useRef, useState } from "react";
import { num, percent, plural, STATE_LABEL, stateOf, timeLabel } from "../../format";
import { api } from "../../services/api";
import type { Kpis, Occurrence, OccurrenceFilters, Ordering, Page, Queue, Treatment } from "../../types";
import OccurrenceDetail from "./OccurrenceDetail";

const PAGE_SIZE = 50;
const SORTS: { value: Ordering; label: string }[] = [
  { value: "-date", label: "Mais recentes" },
  { value: "-packages", label: "Mais pacotes parados" },
  { value: "-recurrence", label: "Mais reincidentes" },
];

interface Props {
  queues: Queue[];
  filters: OccurrenceFilters;
  onChange: (patch: Partial<OccurrenceFilters>) => void;
  onPage: (page: number) => void;
}

export default function QueueView({ queues, filters, onChange, onPage }: Props) {
  const [data, setData] = useState<Page<Occurrence> | null>(null);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [kpiTick, setKpiTick] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const queue = queues.find((q) => q.slug === filters.queue);

  useEffect(() => {
    if (!filters.queue) return;
    let ignore = false;
    setLoading(true);
    setError("");
    api.occurrences(filters)
      .then((page) => {
        if (ignore) return;
        setData(page);
        setSelectedId((cur) => (page.results.some((o) => o.id === cur) ? cur : page.results[0]?.id ?? null));
      })
      .catch((e) => !ignore && setError(e instanceof Error ? e.message : "Erro ao carregar as ocorrências."))
      .finally(() => !ignore && setLoading(false));
    return () => { ignore = true; };
  }, [filters]);

  // Faixa de números: recorte de período/station, independente de estado, busca e página.
  const scopeKey = [filters.queue, filters.regional, filters.stations.join(), filters.date_from, filters.date_to, kpiTick].join("|");
  const scope = useMemo(() => ({ ...filters, treated: "" as const, search: "", page: 1 }), [scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!scope.queue) return;
    let ignore = false;
    api.summary(scope).then((k) => !ignore && setKpis(k)).catch(() => undefined);
    return () => { ignore = true; };
  }, [scope]);

  const results = data?.results ?? [];
  const selected = results.find((o) => o.id === selectedId) ?? null;
  const pages = data ? Math.max(Math.ceil(data.count / PAGE_SIZE), 1) : 1;

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const patchOccurrence = (id: number, patch: Partial<Occurrence>) =>
    setData((d) => d && { ...d, results: d.results.map((o) => (o.id === id ? { ...o, ...patch } : o)) });

  const onSaved = (id: number, treatment: Treatment) => {
    patchOccurrence(id, { treatment });
    setKpiTick((t) => t + 1);
    // Avança para a próxima pendente da lista: o ritmo de quem trata a fila.
    const idx = results.findIndex((o) => o.id === id);
    const next = [...results.slice(idx + 1), ...results.slice(0, idx)].find((o) => !o.treatment && o.id !== id);
    if (next) setSelectedId(next.id);
  };

  const onContacted = (id: number, memberName: string) => {
    const cur = results.find((o) => o.id === id);
    patchOccurrence(id, {
      contact_count: (cur?.contact_count ?? 0) + 1, last_contact_at: new Date().toISOString(), last_contact_by: memberName,
    });
    setKpiTick((t) => t + 1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const idx = results.findIndex((o) => o.id === selectedId);
    const next = results[Math.min(Math.max(idx + (e.key === "ArrowDown" ? 1 : -1), 0), results.length - 1)];
    if (next) setSelectedId(next.id);
  };

  return (
    <>
      <section className="strip" aria-label="Situação do recorte">
        <Metric tone="spx" value={kpis ? num(kpis.pending) : "—"} label="Pendentes"
          note={kpis ? `de ${num(kpis.total)} no período` : ""} />
        <Metric value={kpis ? num(kpis.no_contact) : "—"} label="Sem contato com o motorista"
          note="pendentes sem WhatsApp enviado" />
        <Metric value={kpis ? num(kpis.packages_pending) : "—"} label="Pacotes parados"
          note="nas ocorrências pendentes" />
        <Metric value={kpis?.avg_hours_to_treat != null ? `${String(kpis.avg_hours_to_treat).replace(".", ",")} h` : "—"}
          label="Tempo até tratar" note="da ocorrência à tratativa, em média" />
        <Metric tone="coleta" value={kpis?.reversal_rate != null ? percent(kpis.reversal_rate) : "—"} label="Revertidas"
          note="das tratadas viraram coleta ou batida ajustada" />
      </section>

      <div className="queue">
        <section className="list-pane" aria-label="Ocorrências">
          <div className="list-head">
            <p aria-live="polite">
              {loading ? "Carregando…" : `${num(data?.count ?? 0)} ${plural(data?.count ?? 0, "ocorrência", "ocorrências")}`}
            </p>
            <label>
              <span className="sr-only">Ordenar por</span>
              <select className="control control-small" value={filters.ordering}
                onChange={(e) => onChange({ ordering: e.target.value as Ordering })}>
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
          </div>

          {error && <p className="error banner" role="alert">{error}</p>}

          <div className="list" role="listbox" aria-label="Lista de ocorrências" tabIndex={0}
            ref={listRef} onKeyDown={onKeyDown} aria-busy={loading}>
            {results.map((o) => {
              const state = stateOf(o);
              return (
                <button key={o.id} type="button" role="option" aria-selected={o.id === selectedId} tabIndex={-1}
                  className={`item item-${state}`} onClick={() => setSelectedId(o.id)}>
                  <span className="item-top">
                    <strong>{o.seller_name || `Shop ${o.shop_id}`}</strong>
                    <span className="tabular muted">{timeLabel(o.occurred_at)}</span>
                  </span>
                  <span className="item-mid">
                    <span className="tag tag-station">{o.station_code}</span>
                    <span>{o.driver_name}</span>
                  </span>
                  <span className="item-facts muted">
                    <span>{num(o.onhold_order_count)} {plural(o.onhold_order_count, "pacote", "pacotes")}</span>
                    {o.recurrence_days >= 2 && <span className="recur">{o.recurrence_days} dias de recorrência</span>}
                    <span>{STATE_LABEL[state]}{state === "contacted" && o.contact_count > 1 ? ` (${o.contact_count}x)` : ""}</span>
                  </span>
                </button>
              );
            })}
            {!loading && !error && results.length === 0 && (
              <p className="empty">
                Nenhuma ocorrência com esses filtros.{" "}
                {filters.treated === "false" ? "Se a fila zerou, ótimo. Para rever o que já foi tratado, escolha “Tratadas” ou “Todas”." : "Amplie o período ou escolha outras stations."}
              </p>
            )}
          </div>

          {data && data.count > PAGE_SIZE && (
            <footer className="pager">
              <button type="button" className="btn" disabled={filters.page <= 1} onClick={() => onPage(filters.page - 1)}>Anterior</button>
              <span>Página {filters.page} de {pages}</span>
              <button type="button" className="btn" disabled={filters.page >= pages} onClick={() => onPage(filters.page + 1)}>Próxima</button>
            </footer>
          )}
        </section>

        <section className="detail-pane" aria-label="Detalhe da ocorrência">
          {selected && queue
            ? <OccurrenceDetail key={selected.id} occurrence={selected} queue={queue}
                onSaved={(t) => onSaved(selected.id, t)} onContacted={(name) => onContacted(selected.id, name)} />
            : <p className="empty">Selecione uma ocorrência na lista. Use as setas do teclado para percorrer a fila.</p>}
        </section>
      </div>
    </>
  );
}

function Metric({ value, label, note, tone }: { value: string; label: string; note: string; tone?: "spx" | "coleta" }) {
  return (
    <div className={`metric${tone ? ` metric-${tone}` : ""}`}>
      <strong>{value}</strong>
      <span className="metric-label">{label}</span>
      <span className="metric-note">{note}</span>
    </div>
  );
}
