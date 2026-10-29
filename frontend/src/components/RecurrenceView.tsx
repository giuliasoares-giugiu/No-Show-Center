import { useEffect, useMemo, useState } from 'react';
import { api } from '../services';
import { formatDayMonth, formatNumber, formatStamp, occurrenceState } from '../lib/format';
import type { Occurrence, OccurrenceFilters, RecurrenceEntity, RecurrenceOrder, RecurrenceResult, RecurrenceRow } from '../types';
import { Icon } from './Icons';
import type { IconName } from './Icons';
import { ResultPill } from './ViewParts';

interface Props {
  base: OccurrenceFilters;
  onOpenInQueue: (patch: Partial<OccurrenceFilters>, occurrenceId?: number) => void;
}

const ENTITIES: { id: RecurrenceEntity; label: string; singular: string; icon: IconName }[] = [
  { id: 'seller', label: 'Sellers', singular: 'seller', icon: 'store' },
  { id: 'driver', label: 'Motoristas', singular: 'motorista', icon: 'user' },
  { id: 'route', label: 'Rotas', singular: 'rota', icon: 'route' },
];

const ORDERS: { id: RecurrenceOrder; label: string }[] = [
  { id: 'days', label: 'Dias com ocorrência' },
  { id: 'occurrences', label: 'Nº de ocorrências' },
  { id: 'pending', label: 'Pendentes' },
  { id: 'packages', label: 'Pacotes envolvidos' },
];

const STATE_LABEL = { new: 'Sem contato', contacted: 'Acionada', done: 'Tratada' } as const;

function hints(row: RecurrenceRow): string[] {
  const n = row.occurrences;
  const lines: string[] = [];
  if (row.out_radius / n >= 0.6) lines.push(`Fora do raio em ${row.out_radius} de ${n} ocorrências. Vale conferir lat/long e o acesso do local.`);
  else if (row.out_hours / n >= 0.6) lines.push(`Fora do horário de funcionamento em ${row.out_hours} de ${n}. Vale rever o horário em que a rota passa.`);
  else lines.push('A causa varia entre as ocorrências. Compare na linha do tempo ao lado.');
  if (row.entity === 'seller') lines.push(row.related === 1 ? 'Sempre o mesmo motorista: confira também o histórico dele.' : `${row.related} motoristas diferentes passaram aqui, então o padrão tende a estar no seller.`);
  if (row.entity === 'driver') lines.push(row.related === 1 ? 'Sempre o mesmo seller: o padrão pode estar na relação entre os dois.' : `${row.related} sellers diferentes, então o padrão tende a estar no motorista.`);
  if (row.entity === 'route') lines.push(row.related === 1 ? 'Sempre o mesmo motorista nesta rota.' : `${row.related} motoristas diferentes, então o padrão tende a estar na rota.`);
  return lines;
}

function exactFilter(row: RecurrenceRow): Partial<OccurrenceFilters> {
  if (row.entity === 'seller') return { shop_id: row.key };
  if (row.entity === 'driver') return { driver_id: Number(row.key) };
  return { route: row.key };
}

export default function RecurrenceView({ base, onOpenInQueue }: Props) {
  const [entity, setEntity] = useState<RecurrenceEntity>('seller');
  const [minDays, setMinDays] = useState(2);
  const [order, setOrder] = useState<RecurrenceOrder>('days');
  const [results, setResults] = useState<Partial<Record<RecurrenceEntity, RecurrenceResult>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<Occurrence[] | null>(null);
  const [timelineError, setTimelineError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const options = { minDays, order, limit: 50 };
    Promise.all(ENTITIES.map((item) => api.recurrence(item.id, base, options)))
      .then((all) => { if (active) setResults(Object.fromEntries(all.map((r) => [r.entity, r]))); })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : 'Não foi possível carregar a recorrência.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // base é um objeto novo a cada render do App; as dependências abaixo são os campos que importam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.queue, base.regional, base.stations, base.date_from, base.date_to, minDays, order]);

  const rows = results[entity]?.results ?? [];
  const selected = useMemo(() => rows.find((row) => row.key === selectedKey) ?? rows[0] ?? null, [rows, selectedKey]);
  const current = ENTITIES.find((item) => item.id === entity)!;

  useEffect(() => {
    if (!selected) { setTimeline(null); return; }
    let active = true;
    setTimeline(null);
    setTimelineError('');
    api.occurrences({
      queue: base.queue, regional: base.regional, stations: base.stations, date_from: base.date_from, date_to: base.date_to,
      treated: '', search: '', page: 1, ordering: '-date', ...exactFilter(selected),
    })
      .then((page) => { if (active) setTimeline(page.results); })
      .catch((e: unknown) => { if (active) setTimelineError(e instanceof Error ? e.message : 'Não foi possível carregar as ocorrências.'); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.entity, selected?.key, base.queue, base.regional, base.stations, base.date_from, base.date_to]);

  return (
    <div className="recurrence">
      <div className="rec-controls">
        <div className="rec-tabs" role="tablist" aria-label="Recorrência por">
          {ENTITIES.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={entity === item.id} className={`rec-tab${entity === item.id ? ' is-active' : ''}`}
              onClick={() => { setEntity(item.id); setSelectedKey(null); }}>
              <Icon name={item.icon} size={15} />{item.label}
              <span className="rec-count">{results[item.id] ? formatNumber(results[item.id]!.count) : '—'}</span>
            </button>
          ))}
        </div>
        <div className="rec-selects">
          <label className="ledger-field"><span>Aparece em pelo menos</span>
            <select value={minDays} onChange={(event) => setMinDays(Number(event.target.value))}>
              {[2, 3, 5, 7].map((n) => <option key={n} value={n}>{n} dias</option>)}
            </select>
          </label>
          <label className="ledger-field"><span>Ordenar por</span>
            <select value={order} onChange={(event) => setOrder(event.target.value as RecurrenceOrder)}>
              {ORDERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {error && <div className="inline-error" role="alert"><Icon name="alert" size={16} />{error}</div>}

      <div className={`rec-workspace${loading ? ' is-refreshing' : ''}`} aria-busy={loading}>
        <section className="panel rec-list-panel" aria-label={`${current.label} recorrentes`}>
          <div className="rec-list-head">
            <strong>{current.label} recorrentes</strong>
            <span>{loading && !results[entity] ? 'Carregando…' : `${formatNumber(results[entity]?.count ?? 0)} no recorte`}</span>
          </div>
          <div className="rec-list" role="listbox" aria-label={current.label}>
            {rows.map((row) => {
              const active = selected?.key === row.key;
              return (
                <button key={row.key} type="button" role="option" aria-selected={active} className={`rec-row${active ? ' is-selected' : ''}`} onClick={() => setSelectedKey(row.key)}>
                  <span className={`drill-avatar ${entity === 'seller' ? 'seller-avatar' : 'driver-avatar'}`}><Icon name={current.icon} size={15} /></span>
                  <span className="rec-main">
                    <strong>{row.name}</strong>
                    <small>{entity === 'route' ? row.station_code : `ID ${row.key} · ${row.station_code}${row.stations > 1 ? ` +${row.stations - 1}` : ''}`}</small>
                    <span className="rec-chips">
                      {row.out_radius > 0 && <span className="rec-chip">fora do raio {row.out_radius}/{row.occurrences}</span>}
                      {row.out_hours > 0 && <span className="rec-chip">fora do horário {row.out_hours}/{row.occurrences}</span>}
                    </span>
                  </span>
                  <span className="rec-days"><b>{row.days}</b><small>dias</small></span>
                  <span className="rec-pending"><b className={row.pending > 0 ? 'has-pending' : ''}>{row.pending}</b><small>pendentes</small></span>
                </button>
              );
            })}
            {!loading && !error && rows.length === 0 && (
              <p className="ledger-empty">Nenhum {current.singular} com ocorrência em {minDays} dias ou mais neste recorte. Amplie o período ou reduza o mínimo de dias.</p>
            )}
          </div>
        </section>

        <section className="panel rec-detail" aria-label="Detalhe da recorrência">
          {!selected ? (
            <p className="ledger-empty">Selecione um item da lista para ver o padrão e a linha do tempo.</p>
          ) : (
            <>
              <header className="rec-detail-head">
                <div>
                  <span className="eyebrow">{current.singular.toUpperCase()} RECORRENTE</span>
                  <h2>{selected.name}</h2>
                  <p>{selected.entity === 'route' ? selected.station_code : `ID ${selected.key} · ${selected.station_code}${selected.stations > 1 ? ` e mais ${selected.stations - 1} station${selected.stations > 2 ? 's' : ''}` : ''}`}</p>
                </div>
                <button type="button" className="primary-button" onClick={() => onOpenInQueue({ search: selected.key })}>Ver na Fila <Icon name="arrow-right" size={14} /></button>
              </header>

              <div className="rec-stats">
                <div><b>{selected.days}</b><span>dias com ocorrência</span></div>
                <div><b>{selected.occurrences}</b><span>ocorrências</span></div>
                <div><b className={selected.pending > 0 ? 'has-pending' : ''}>{selected.pending}</b><span>pendentes</span></div>
                <div><b>{selected.treated}</b><span>tratadas, {selected.reversed} revertidas</span></div>
                <div><b>{formatNumber(selected.packages)}</b><span>pacotes envolvidos</span></div>
                <div><b className="rec-period">{formatDayMonth(selected.first_date)} a {formatDayMonth(selected.last_date)}</b><span>período das ocorrências</span></div>
              </div>

              <div className="rec-hints">
                <strong>O que os dados sugerem</strong>
                <ul>{hints(selected).map((line) => <li key={line}>{line}</li>)}</ul>
                <small>Leitura de apoio: confirme com a tratativa antes de agir.</small>
              </div>

              <div className="rec-timeline">
                <strong>Linha do tempo</strong>
                {timelineError && <p className="inline-error" role="alert">{timelineError}</p>}
                {!timeline && !timelineError && <p className="muted-text">Carregando ocorrências…</p>}
                {timeline && timeline.length === 0 && <p className="muted-text">Nenhuma ocorrência no recorte atual.</p>}
                <ol>
                  {(timeline ?? []).map((item) => {
                    const state = occurrenceState(item);
                    const who = selected.entity === 'seller' ? item.driver_name : selected.entity === 'driver' ? item.seller_name : `${item.seller_name} com ${item.driver_name}`;
                    return (
                      <li key={item.id}>
                        <span className="rec-when">{formatStamp(item.occurred_at ?? `${item.occurrence_date}T12:00:00-03:00`)}</span>
                        <span className="rec-what">
                          <strong>{who}</strong>
                          <small>{item.station_code} · {formatNumber(item.onhold_order_count)} pacotes · {item.raio === 'Fora do raio' ? 'fora do raio' : item.horario_funcionamento.startsWith('Fora') ? 'fora do horário' : 'dentro do raio e do horário'}</small>
                        </span>
                        <span className="rec-state">
                          {item.treatment ? <ResultPill label={item.treatment.reversal_label} reversed={item.treatment.reversal_label !== 'Não revertido'} /> : <span className={`status-pill state-${state}`}>{STATE_LABEL[state]}</span>}
                        </span>
                        <button type="button" className="rec-open" aria-label={`Abrir ocorrência de ${who} na Fila`} onClick={() => onOpenInQueue({ search: String(item.shop_id), date_from: item.occurrence_date, date_to: item.occurrence_date }, item.id)}><Icon name="arrow-right" size={14} /></button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
