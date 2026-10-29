import { Fragment, useEffect, useMemo, useState } from 'react';
import { api } from '../services';
import { formatDecimal, formatHours, formatNumber, formatPercent } from '../lib/format';
import type {
  DispatcherOrder, DispatcherRow, DriverOrder, DriverRow, IndicatorList, IndicatorsOverview, OccurrenceFilters, RecurrenceRow,
} from '../types';
import { Icon } from './Icons';
import type { IconName } from './Icons';

interface Props {
  base: OccurrenceFilters;
  onOpenInQueue: (patch: Partial<OccurrenceFilters>, occurrenceId?: number) => void;
}

const DISPATCHER_ORDERS: { id: DispatcherOrder; label: string }[] = [
  { id: 'routes', label: 'Rotas com no-show' },
  { id: 'messages', label: 'Mensagens enviadas' },
  { id: 'routes_reverted', label: 'Rotas revertidas' },
  { id: 'slowest', label: 'Maior tempo de resolução' },
];
const DRIVER_ORDERS: { id: DriverOrder; label: string }[] = [
  { id: 'occurrences', label: 'Ocorrências' },
  { id: 'no_show_driver', label: 'No-show driver' },
  { id: 'repeat_sellers', label: 'Sellers recorrentes' },
  { id: 'reverted', label: 'Reversões' },
  { id: 'packages', label: 'Pacotes' },
];

const pct = (part: number, total: number) => (total > 0 ? formatPercent(part / total) : '—');
const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export default function IndicatorsView({ base, onOpenInQueue }: Props) {
  const [tab, setTab] = useState<'dispatchers' | 'drivers'>('dispatchers');
  const [dispatcherOrder, setDispatcherOrder] = useState<DispatcherOrder>('routes');
  const [driverOrder, setDriverOrder] = useState<DriverOrder>('occurrences');
  const [overview, setOverview] = useState<IndicatorsOverview | null>(null);
  const [dispatchers, setDispatchers] = useState<IndicatorList<DispatcherRow> | null>(null);
  const [drivers, setDrivers] = useState<IndicatorList<DriverRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openDriver, setOpenDriver] = useState<number | null>(null);
  const [sellers, setSellers] = useState<Record<number, RecurrenceRow[] | 'error'>>({});

  // Indicadores olham todos os no-shows do período, de qualquer fila: não enviam o filtro de fila.
  const scope = useMemo<OccurrenceFilters>(() => ({
    queue: '', regional: base.regional, stations: base.stations, treated: '', search: '', date_from: base.date_from,
    date_to: base.date_to, page: 1, ordering: '-date',
  }), [base.regional, base.stations, base.date_from, base.date_to]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.indicatorsOverview(scope)
      .then((data) => { if (active) setOverview(data); })
      .catch((e: unknown) => { if (active) setError(message(e, 'Não foi possível carregar os indicadores.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scope]);

  useEffect(() => {
    let active = true;
    api.indicatorDispatchers(scope, dispatcherOrder)
      .then((data) => { if (active) setDispatchers(data); })
      .catch((e: unknown) => { if (active) setError(message(e, 'Não foi possível carregar os dispatchers.')); });
    return () => { active = false; };
  }, [scope, dispatcherOrder]);

  useEffect(() => {
    let active = true;
    setOpenDriver(null);
    api.indicatorDrivers(scope, driverOrder)
      .then((data) => { if (active) setDrivers(data); })
      .catch((e: unknown) => { if (active) setError(message(e, 'Não foi possível carregar os drivers.')); });
    return () => { active = false; };
  }, [scope, driverOrder]);

  function toggleDriver(row: DriverRow) {
    const next = openDriver === row.driver_id ? null : row.driver_id;
    setOpenDriver(next);
    if (next !== null && sellers[row.driver_id] === undefined) {
      api.recurrence('seller', { ...scope, driver_id: row.driver_id }, { minDays: 2, order: 'days', limit: 10 })
        .then((result) => setSellers((previous) => ({ ...previous, [row.driver_id]: result.results })))
        .catch(() => setSellers((previous) => ({ ...previous, [row.driver_id]: 'error' })));
    }
  }

  const o = overview;
  const cards: { label: string; value: string; note: string; icon: IconName; tone: string }[] = [
    { label: '% de reversão', value: o ? formatPercent(o.reversal_rate) : '—', note: o ? `${formatNumber(o.reverted)} de ${formatNumber(o.treated)} tratadas` : 'das tratadas', icon: 'chart', tone: 'metric-green' },
    { label: 'Tentativas até o sucesso', value: o ? formatDecimal(o.attempts.avg) : '—', note: 'acionamentos até reverter', icon: 'activity', tone: 'metric-orange' },
    { label: 'Média de resolução', value: o ? formatHours(o.avg_hours_to_treat) : '—', note: 'da ocorrência à tratativa', icon: 'clock', tone: 'metric-blue' },
    { label: 'Mensagens enviadas', value: o ? formatNumber(o.messages) : '—', note: 'acionamentos por WhatsApp', icon: 'whatsapp', tone: 'metric-teal' },
    { label: 'Drivers acionados', value: o ? formatNumber(o.drivers_contacted) : '—', note: 'drivers distintos', icon: 'phone', tone: 'metric-violet' },
    { label: 'Participação em treinamentos', value: '—', note: o?.training.available ? 'dos drivers convocados' : 'aguardando dados do time de treinamentos', icon: 'users', tone: 'metric-violet' },
  ];
  const d = o?.attempts.distribution;

  return (
    <div className="indicators">
      {error && <div className="inline-error" role="alert"><Icon name="alert" size={16} />{error}</div>}

      <section className={`kpi-strip ind-strip${loading ? ' is-loading' : ''}`} aria-label="Indicadores gerais" aria-busy={loading}>
        {cards.map((card) => (
          <div className="kpi-card" key={card.label} title={card.note}>
            <span className={`kpi-icon ${card.tone}`}><Icon name={card.icon} size={17} /></span>
            <span className="kpi-copy"><small>{card.label}</small><strong>{card.value}</strong><span>{card.note}</span></span>
          </div>
        ))}
      </section>

      {o && d && o.attempts.reversed_treatments > 0 && (
        <p className="ind-attempts">
          Das {formatNumber(o.attempts.reversed_treatments)} reversões: {formatNumber(d.one)} com 1 acionamento, {formatNumber(d.two)} com 2 e {formatNumber(d.three_plus)} com 3 ou mais
          {d.zero > 0 && <>, e {formatNumber(d.zero)} sem acionamento registrado</>}.
        </p>
      )}

      <details className="ind-defs">
        <summary>Como cada número é calculado</summary>
        <ul>
          <li><strong>Escopo.</strong> No-shows do período (No Show Seller e No Show 3PL, de qualquer fila). As ações contam quando feitas sobre essas ocorrências, em qualquer dia.</li>
          <li><strong>Rota com no-show.</strong> Rota com ao menos uma ocorrência. <strong>Rota revertida:</strong> ao menos uma ocorrência tratada como revertida (Coletado ou Batida ajustada).</li>
          <li><strong>Tentativas até o sucesso.</strong> Acionamentos por WhatsApp feitos até a tratativa que reverteu a ocorrência. Zero significa revertida sem acionamento registrado.</li>
          <li><strong>Média de resolução.</strong> Tempo da ocorrência até a tratativa registrada.</li>
          <li><strong>Dispatcher.</strong> Quem alocou a rota (nome vindo do DS) ligado a quem aciona e trata (login) pelo nome cadastrado na station. Se os nomes forem diferentes, a mesma pessoa aparece em duas linhas.</li>
          <li><strong>No-show driver:</strong> o motorista não foi ao seller (No Show 3PL). <strong>No-show seller:</strong> o motorista foi e o seller não entregou (No Show Seller). <strong>Sellers recorrentes:</strong> com no-show em 2 ou mais dias para o mesmo driver.</li>
        </ul>
      </details>

      <section className="panel ledger-panel" aria-label="Performance por pessoa">
        <div className="ledger-toolbar">
          <div className="rec-tabs" role="tablist" aria-label="Performance por">
            <button type="button" role="tab" aria-selected={tab === 'dispatchers'} className={`rec-tab${tab === 'dispatchers' ? ' is-active' : ''}`} onClick={() => setTab('dispatchers')}>
              <Icon name="users" size={15} />Dispatchers<span className="rec-count">{dispatchers ? formatNumber(dispatchers.count) : '—'}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === 'drivers'} className={`rec-tab${tab === 'drivers' ? ' is-active' : ''}`} onClick={() => setTab('drivers')}>
              <Icon name="user" size={15} />Drivers<span className="rec-count">{drivers ? formatNumber(drivers.count) : '—'}</span>
            </button>
          </div>
          <label className="ledger-field"><span>Ordenar por</span>
            {tab === 'dispatchers' ? (
              <select value={dispatcherOrder} onChange={(event) => setDispatcherOrder(event.target.value as DispatcherOrder)}>
                {DISPATCHER_ORDERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            ) : (
              <select value={driverOrder} onChange={(event) => setDriverOrder(event.target.value as DriverOrder)}>
                {DRIVER_ORDERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            )}
          </label>
        </div>

        {tab === 'dispatchers' ? (
          <div className="ledger-scroll">
            <table className="ledger-table ind-table">
              <thead>
                <tr><th>Dispatcher</th><th className="num">Rotas com no-show</th><th className="num">Rotas tratadas</th><th className="num">Rotas revertidas</th><th className="num">% revertidas</th><th className="num">Drivers acionados</th><th className="num">Mensagens enviadas</th><th className="num">Média de resolução</th></tr>
              </thead>
              <tbody>
                {(dispatchers?.results ?? []).map((row) => (
                  <tr key={row.key}>
                    <td>
                      <strong>{row.name}</strong>
                      <small>{row.station_code || row.email}</small>
                      {row.has_routes && !row.has_actions && <span className="ind-chip is-warn" title="Alocou rotas com no-show e não acionou nem tratou nada no sistema">Sem acionamentos</span>}
                      {!row.has_routes && row.has_actions && <span className="ind-chip" title="Agiu no sistema, mas nenhuma rota alocada com esse nome tem no-show no recorte. Se for um dispatcher, o nome no DS pode estar diferente do cadastro da station.">Só acionamentos</span>}
                    </td>
                    <td className="num">{formatNumber(row.routes)}</td>
                    <td className="num">{formatNumber(row.routes_treated)}</td>
                    <td className="num">{formatNumber(row.routes_reverted)}</td>
                    <td className="num">{pct(row.routes_reverted, row.routes_treated)}</td>
                    <td className="num">{formatNumber(row.drivers_contacted)}</td>
                    <td className="num">{formatNumber(row.messages)}</td>
                    <td className="num nowrap">{formatHours(row.avg_hours_to_treat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {dispatchers && dispatchers.results.length === 0 && <p className="ledger-empty">Nenhum dispatcher com no-show neste recorte. Amplie o período ou escolha outras stations.</p>}
            {!dispatchers && !error && <p className="ledger-empty">Carregando dispatchers…</p>}
          </div>
        ) : (
          <div className="ledger-scroll">
            <table className="ledger-table ind-table">
              <thead>
                <tr><th aria-label="Detalhes" /><th>Driver</th><th className="num">Ocorrências</th><th className="num">No-show driver</th><th className="num">No-show seller</th><th className="num">Sellers recorrentes</th><th className="num">Reversões</th><th className="num">% reversão</th><th className="num">Pacotes</th></tr>
              </thead>
              <tbody>
                {(drivers?.results ?? []).map((row) => {
                  const open = openDriver === row.driver_id;
                  const list = sellers[row.driver_id];
                  return (
                    <Fragment key={row.driver_id}>
                      <tr className={open ? 'is-open' : undefined}>
                        <td><button type="button" className="ledger-toggle" aria-expanded={open} aria-label={`${open ? 'Recolher' : 'Ver'} detalhes de ${row.name}`} onClick={() => toggleDriver(row)}><Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} /></button></td>
                        <td><strong>{row.name}</strong><small>ID {row.driver_id} · {row.station_code}{row.stations > 1 ? ` +${row.stations - 1}` : ''}</small></td>
                        <td className="num">{formatNumber(row.occurrences)}</td>
                        <td className="num">{formatNumber(row.no_show_driver)}</td>
                        <td className="num">{formatNumber(row.no_show_seller)}</td>
                        <td className="num">{row.repeat_sellers > 0 ? <span className="ind-repeat">{row.repeat_sellers}</span> : 0}<small className="ind-of">de {row.sellers}</small></td>
                        <td className="num">{formatNumber(row.reverted)}</td>
                        <td className="num">{pct(row.reverted, row.treated)}</td>
                        <td className="num">{formatNumber(row.packages)}</td>
                      </tr>
                      {open && (
                        <tr className="ledger-detail-row">
                          <td colSpan={9}>
                            <div className="ledger-detail ind-detail">
                              <dl>
                                <div><dt>Dias com ocorrência</dt><dd>{row.days}</dd></div>
                                <div><dt>Falha atribuída ao SPX</dt><dd>{formatNumber(row.spx_fault)} de {formatNumber(row.no_show_seller)} no-shows de seller</dd></div>
                                <div><dt>Tratadas</dt><dd>{formatNumber(row.treated)} de {formatNumber(row.occurrences)}, {formatNumber(row.pending)} pendentes</dd></div>
                              </dl>
                              <div className="ledger-contacts">
                                <strong>Sellers recorrentes com este driver</strong>
                                {list === undefined && <span className="muted-text">Carregando…</span>}
                                {list === 'error' && <span className="muted-text">Não foi possível carregar os sellers.</span>}
                                {Array.isArray(list) && list.length === 0 && <span className="muted-text">Nenhum seller com no-show em 2 dias ou mais.</span>}
                                {Array.isArray(list) && list.map((seller) => <span key={seller.key}>{seller.name}: {seller.days} dias, {seller.occurrences} ocorrências, {seller.pending} pendentes</span>)}
                              </div>
                              <button type="button" className="secondary-button" onClick={() => onOpenInQueue({ search: String(row.driver_id) })}>Ver na Fila <Icon name="arrow-right" size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {drivers && drivers.results.length === 0 && <p className="ledger-empty">Nenhum driver com no-show neste recorte. Amplie o período ou escolha outras stations.</p>}
            {!drivers && !error && <p className="ledger-empty">Carregando drivers…</p>}
          </div>
        )}
        {(tab === 'dispatchers' ? dispatchers : drivers) && (tab === 'dispatchers' ? dispatchers!.count : drivers!.count) > 100 && (
          <p className="ind-more">Mostrando os 100 primeiros de {formatNumber(tab === 'dispatchers' ? dispatchers!.count : drivers!.count)}. Use os filtros de regional e station para ver o restante.</p>
        )}
      </section>
    </div>
  );
}
