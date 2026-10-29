import { useCallback, useEffect, useState } from "react";
import { todayISO } from "../format";
import { api } from "../services/api";
import type {
  FilterOption, Me, Occurrence, OccurrenceFilters, Page, Queue, Summary, Treatment,
} from "../types";
import ContactModal from "./ContactModal";
import Filters from "./Filters";
import KpiCards from "./KpiCards";
import OccurrenceRow from "./OccurrenceRow";

const PAGE_SIZE = 50;
const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export default function Dashboard({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [options, setOptions] = useState<FilterOption[]>([]);
  const [filters, setFilters] = useState<OccurrenceFilters>({
    queue: "", regional: "", stations: [], treated: "", search: "",
    date_from: todayISO(-7), date_to: todayISO(), page: 1,
  });
  const [searchInput, setSearchInput] = useState("");
  const [data, setData] = useState<Page<Occurrence> | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [contactTarget, setContactTarget] = useState<Occurrence | null>(null);

  // Carga inicial: filas (com opções dos selects) e opções de filtro.
  useEffect(() => {
    Promise.all([api.queues(), api.filterOptions()])
      .then(([qs, opts]) => {
        setQueues(qs);
        setOptions(opts);
        if (qs.length) setFilters((f) => ({ ...f, queue: qs[0].slug }));
        else setLoading(false);
      })
      .catch((e) => { setError(message(e, "Erro ao carregar o painel.")); setLoading(false); });
  }, []);

  // Busca com debounce.
  useEffect(() => {
    const id = setTimeout(() => setFilters((f) => (f.search === searchInput ? f : { ...f, search: searchInput, page: 1 })), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Ocorrências + KPIs sempre com os mesmos filtros.
  useEffect(() => {
    if (!filters.queue) return;
    let ignore = false;
    setLoading(true);
    setError("");
    Promise.all([api.occurrences(filters), api.summary(filters)])
      .then(([page, sum]) => { if (!ignore) { setData(page); setSummary(sum); } })
      .catch((e) => !ignore && setError(message(e, "Erro ao carregar ocorrências.")))
      .finally(() => !ignore && setLoading(false));
    return () => { ignore = true; };
  }, [filters]);

  const update = useCallback(
    (patch: Partial<OccurrenceFilters>) => setFilters((f) => ({ ...f, page: 1, ...patch })),
    [],
  );

  const onSaved = (id: number, treatment: Treatment) => {
    const wasPending = data?.results.find((o) => o.id === id)?.treatment == null;
    setData((d) => d && { ...d, results: d.results.map((o) => (o.id === id ? { ...o, treatment } : o)) });
    if (wasPending) setSummary((s) => s && { ...s, treated: s.treated + 1, pending: Math.max(s.pending - 1, 0) });
  };

  const queue = queues.find((q) => q.slug === filters.queue);
  const pages = data ? Math.max(Math.ceil(data.count / PAGE_SIZE), 1) : 1;

  return (
    <div className="app">
      <header className="card header">
        <div className="title">
          <h1>Tratativa de Ocorrências{queue ? ` — ${queue.name}` : ""}</h1>
          <p>Acione o motorista e registre a tratativa no histórico.</p>
        </div>
        <Filters filters={filters} searchInput={searchInput} options={options}
          onSearchInput={setSearchInput} onChange={update} />
        <div className="user">
          <span title={me.email}>{me.email}</span>
          <button type="button" className="btn-ghost" onClick={onLogout}>Sair</button>
        </div>
      </header>

      {queues.length > 1 && (
        <nav className="tabs" aria-label="Filas">
          {queues.map((q) => (
            <button key={q.slug} type="button" aria-current={q.slug === filters.queue}
              onClick={() => update({ queue: q.slug })}>{q.name}</button>
          ))}
        </nav>
      )}

      <KpiCards summary={summary} />

      <section className="card table-card" aria-busy={loading}>
        {error && <p className="error banner" role="alert">{error}</p>}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Shop ID / Seller</th><th>Regional</th><th>Station / Hub</th><th>Alocado por</th>
                <th>Motorista / Telefone</th><th>Status / Raio</th><th>Contato</th><th>Tratativa</th>
              </tr>
            </thead>
            <tbody>
              {queue && data?.results.map((o) => (
                <OccurrenceRow key={o.id} occurrence={o} queue={queue} onContact={setContactTarget} onSaved={onSaved} />
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !error && data?.results.length === 0 && (
          <p className="empty">Nenhuma ocorrência com esses filtros. Amplie o período ou escolha outras stations.</p>
        )}
        {loading && <p className="empty">Carregando ocorrências…</p>}
        {data && data.count > PAGE_SIZE && (
          <footer className="pager">
            <button type="button" className="btn-ghost" disabled={filters.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>Anterior</button>
            <span>Página {filters.page} de {pages}</span>
            <button type="button" className="btn-ghost" disabled={filters.page >= pages}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Próxima</button>
          </footer>
        )}
      </section>

      {contactTarget && <ContactModal occurrence={contactTarget} onClose={() => setContactTarget(null)} />}
    </div>
  );
}
