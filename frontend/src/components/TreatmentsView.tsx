import { Fragment, useEffect, useMemo, useState } from 'react';
import { api } from '../services';
import { formatDayMonth, formatHours, formatNumber, formatPercent, formatStamp } from '../lib/format';
import type { ContactEntry, OccurrenceFilters, Page, Queue, TreatmentFilters, TreatmentLogRow, TreatmentOrdering, TreatmentSummary } from '../types';
import { Icon } from './Icons';
import { Bars, InsightCard, Pager, ResultPill } from './ViewParts';

interface Props {
  queues: Queue[];
  base: OccurrenceFilters;
  onOpenInQueue: (patch: Partial<OccurrenceFilters>, occurrenceId?: number) => void;
  onNotify: (kind: 'success' | 'error' | 'info', message: string) => void;
}

const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

function causeText(row: TreatmentLogRow): string {
  const out = [row.raio === 'Fora do raio' && 'fora do raio', row.horario_funcionamento.startsWith('Fora') && 'fora do horário'].filter(Boolean);
  return out.length ? out.join(' e ') : 'dentro do raio e do horário';
}

export default function TreatmentsView({ queues, base, onOpenInQueue, onNotify }: Props) {
  const [reversed, setReversed] = useState<TreatmentFilters['reversed']>('');
  const [justification, setJustification] = useState('');
  const [treatedBy, setTreatedBy] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [ordering, setOrdering] = useState<TreatmentOrdering>('-treated_at');
  const [pageState, setPageState] = useState({ key: '', page: 1 });
  const [data, setData] = useState<Page<TreatmentLogRow> | null>(null);
  const [summary, setSummary] = useState<TreatmentSummary | null>(null);
  const [users, setUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [contacts, setContacts] = useState<Record<number, ContactEntry[] | 'error'>>({});
  const [exporting, setExporting] = useState(false);

  const queue = queues.find((item) => item.slug === base.queue);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // A página volta para 1 sempre que qualquer outro filtro muda (sem efeito extra nem consulta dupla).
  const scopeKey = JSON.stringify([base.queue, base.regional, base.stations, base.date_from, base.date_to, reversed, justification, treatedBy, search, ordering]);
  const page = pageState.key === scopeKey ? pageState.page : 1;
  const filters = useMemo<TreatmentFilters>(() => ({
    queue: base.queue, regional: base.regional, stations: base.stations, date_from: base.date_from, date_to: base.date_to,
    reversed, justification, treated_by: treatedBy, search, ordering, page,
  }), [base.queue, base.regional, base.stations, base.date_from, base.date_to, reversed, justification, treatedBy, search, ordering, page]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.treatments(filters)
      .then((result) => { if (active) { setData(result); setOpenId(null); } })
      .catch((e: unknown) => { if (active) setError(message(e, 'Não foi possível carregar o registro de tratativas.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters]);

  useEffect(() => {
    let active = true;
    setSummaryLoading(true);
    api.treatmentSummary({ ...filters, page: 1 })
      .then((result) => {
        if (!active) return;
        setSummary(result);
        // Lista de pessoas: só se atualiza sem filtro de pessoa, para não "sumir" com as outras opções.
        if (!filters.treated_by) setUsers(result.by_user.map((item) => item.treated_by));
      })
      .catch(() => { if (active) setSummary(null); })
      .finally(() => { if (active) setSummaryLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  function toggle(row: TreatmentLogRow) {
    const next = openId === row.id ? null : row.id;
    setOpenId(next);
    if (next !== null && contacts[row.occurrence_id] === undefined) {
      api.history(row.occurrence_id)
        .then((items) => setContacts((previous) => ({ ...previous, [row.occurrence_id]: items })))
        .catch(() => setContacts((previous) => ({ ...previous, [row.occurrence_id]: 'error' })));
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      await api.exportTreatments(filters);
      onNotify('success', 'Exportação gerada com os filtros atuais.');
    } catch (e) {
      onNotify('error', message(e, 'Não foi possível exportar.'));
    } finally {
      setExporting(false);
    }
  }

  const rows = data?.results ?? [];
  const hasFilters = reversed !== '' || justification !== '' || treatedBy !== '' || search !== '';
  const metrics = [
    { label: 'Tratativas registradas', value: summary ? formatNumber(summary.total) : '—', note: 'no período', icon: 'check' as const, tone: 'metric-orange' },
    { label: 'Revertidas', value: summary ? formatNumber(summary.reversed) : '—', note: 'coletadas ou com batida ajustada', icon: 'activity' as const, tone: 'metric-green' },
    { label: 'Taxa de reversão', value: summary ? formatPercent(summary.reversal_rate) : '—', note: 'das tratadas, revertidas', icon: 'chart' as const, tone: 'metric-teal' },
    { label: 'Média até tratar', value: summary ? formatHours(summary.avg_hours_to_treat) : '—', note: 'da ocorrência à tratativa', icon: 'clock' as const, tone: 'metric-blue' },
    { label: 'Quem tratou', value: summary ? formatNumber(summary.by_user.length) : '—', note: 'pessoas com tratativas', icon: 'users' as const, tone: 'metric-violet' },
  ];

  return (
    <div className="ledger">
      <section className={`kpi-strip${summaryLoading ? ' is-loading' : ''}`} aria-label="Indicadores das tratativas" aria-busy={summaryLoading}>
        {metrics.map((metric) => (
          <div className="kpi-card" key={metric.label}>
            <span className={`kpi-icon ${metric.tone}`}><Icon name={metric.icon} size={17} /></span>
            <span className="kpi-copy"><small>{metric.label}</small><strong>{metric.value}</strong><span>{metric.note}</span></span>
          </div>
        ))}
      </section>

      <section className="panel ledger-panel" aria-label="Registro de tratativas">
        <div className="ledger-toolbar">
          <div className="ledger-filters">
            <label className="ledger-field"><span>Resultado</span>
              <select value={reversed} onChange={(event) => setReversed(event.target.value as TreatmentFilters['reversed'])}>
                <option value="">Todos</option><option value="true">Revertidas</option><option value="false">Não revertidas</option>
              </select>
            </label>
            <label className="ledger-field"><span>Justificativa</span>
              <select value={justification} onChange={(event) => setJustification(event.target.value)}>
                <option value="">Todas</option>
                {(queue?.justification_options ?? []).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <label className="ledger-field"><span>Tratada por</span>
              <select value={treatedBy} onChange={(event) => setTreatedBy(event.target.value)}>
                <option value="">Todas as pessoas</option>
                {users.map((email) => <option key={email} value={email}>{email}</option>)}
              </select>
            </label>
            <label className="ledger-field ledger-search"><span>Buscar</span>
              <span className="search-input-wrap"><Icon name="search" size={15} />
                <input type="search" placeholder="Seller, motorista, rota ou ID" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
              </span>
            </label>
            <label className="ledger-field"><span>Ordenar por</span>
              <select value={ordering} onChange={(event) => setOrdering(event.target.value as TreatmentOrdering)}>
                <option value="-treated_at">Mais recentes</option><option value="-packages">Mais pacotes</option>
              </select>
            </label>
          </div>
          <div className="ledger-actions">
            {hasFilters && <button type="button" className="secondary-button" onClick={() => { setReversed(''); setJustification(''); setTreatedBy(''); setSearchInput(''); setSearch(''); }}>Limpar filtros</button>}
            <button type="button" className="secondary-button" disabled={exporting || !data || data.count === 0} onClick={() => void exportCsv()}>
              <Icon name="arrow-down" size={14} />{exporting ? 'Gerando…' : 'Exportar CSV'}
            </button>
          </div>
        </div>

        {error && <div className="inline-error" role="alert"><Icon name="alert" size={16} />{error}</div>}

        <div className="ledger-scroll" aria-busy={loading}>
          <table className="ledger-table">
            <thead>
              <tr><th aria-label="Detalhes" /><th>Tratada em</th><th>Seller</th><th>Station</th><th>Motorista</th><th>Resultado</th><th>Justificativa</th><th>Tratada por</th><th className="num">Tempo</th><th className="num">Pacotes</th></tr>
            </thead>
            <tbody className={loading ? 'is-refreshing' : undefined}>
              {rows.map((row) => {
                const open = openId === row.id;
                const history = contacts[row.occurrence_id];
                return (
                  <Fragment key={row.id}>
                    <tr className={open ? 'is-open' : undefined}>
                      <td><button type="button" className="ledger-toggle" aria-expanded={open} aria-label={`${open ? 'Recolher' : 'Ver'} detalhes da tratativa de ${row.seller_name}`} onClick={() => toggle(row)}><Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} /></button></td>
                      <td className="nowrap">{formatStamp(row.treated_at)}</td>
                      <td><strong>{row.seller_name}</strong><small>ID {row.shop_id}</small></td>
                      <td className="nowrap">{row.station_code}</td>
                      <td>{row.driver_name}</td>
                      <td><ResultPill label={row.reversal_label} reversed={row.reversed} /></td>
                      <td>{row.justification_label}{row.justification_text && <small>{row.justification_text}</small>}</td>
                      <td className="ledger-by" title={row.treated_by}>{row.treated_by}</td>
                      <td className="num nowrap">{formatHours(row.hours_to_treat)}</td>
                      <td className="num">{formatNumber(row.onhold_order_count)}</td>
                    </tr>
                    {open && (
                      <tr className="ledger-detail-row">
                        <td colSpan={10}>
                          <div className="ledger-detail">
                            <dl>
                              <div><dt>Ocorrência</dt><dd>{formatDayMonth(row.occurrence_date)} às {formatStamp(row.occurred_at).slice(-5)}, {causeText(row)}</dd></div>
                              <div><dt>Tipo de falha</dt><dd>{row.fault_type || '—'}</dd></div>
                              <div><dt>Rota</dt><dd>{row.route_name || '—'}{row.allocated_by && <small>Alocada por {row.allocated_by}</small>}</dd></div>
                              <div><dt>Regional</dt><dd>{row.regional}</dd></div>
                            </dl>
                            <div className="ledger-contacts">
                              <strong>Contatos com o motorista</strong>
                              {history === undefined && <span className="muted-text">Carregando…</span>}
                              {history === 'error' && <span className="muted-text">Não foi possível carregar os contatos.</span>}
                              {Array.isArray(history) && history.length === 0 && <span className="muted-text">Nenhum contato registrado antes da tratativa.</span>}
                              {Array.isArray(history) && history.map((entry, index) => <span key={index}>{formatStamp(entry.sent_at)} por {entry.member_name}</span>)}
                            </div>
                            <button type="button" className="secondary-button" onClick={() => onOpenInQueue({ search: String(row.shop_id), date_from: row.occurrence_date, date_to: row.occurrence_date }, row.occurrence_id)}>
                              Abrir na Fila <Icon name="arrow-right" size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {!loading && !error && rows.length === 0 && (
            <p className="ledger-empty">{hasFilters ? 'Nenhuma tratativa com esses filtros. Limpe os filtros ou amplie o período.' : 'Nenhuma tratativa registrada neste período. Amplie o período ou escolha outras stations.'}</p>
          )}
          {loading && rows.length === 0 && <p className="ledger-empty">Carregando tratativas…</p>}
        </div>

        <Pager page={page} total={data?.count ?? 0} onPage={(next) => setPageState({ key: scopeKey, page: next })} />
      </section>
      <div className="ledger-section-head"><strong>Resumo do recorte</strong><span>Distribuição das tratativas filtradas acima</span></div>
      <div className="ledger-insights">
        <InsightCard title="Resultado" eyebrow="O QUE ACONTECEU COM A COLETA">
          <Bars rows={(summary?.by_reversal ?? []).map((item) => ({ label: item.label, value: item.count, note: item.reversed ? 'revertida' : 'não revertida' }))} emptyText="Nenhuma tratativa neste recorte." />
        </InsightCard>
        <InsightCard title="Justificativas" eyebrow="CAUSAS APURADAS">
          <Bars rows={(summary?.by_justification ?? []).map((item) => ({ label: item.label, value: item.count }))} emptyText="Nenhuma justificativa neste recorte." />
        </InsightCard>
        <InsightCard title="Quem tratou" eyebrow="POR PESSOA">
          <Bars rows={(summary?.by_user ?? []).map((item) => ({ label: item.treated_by, value: item.count, note: `${formatPercent(item.count ? item.reversed / item.count : null)} revertidas` }))} emptyText="Nenhuma tratativa neste recorte." />
        </InsightCard>
      </div>

    </div>
  );
}
