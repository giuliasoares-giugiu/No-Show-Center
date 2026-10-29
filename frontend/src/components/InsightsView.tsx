import type { CSSProperties, ReactNode } from 'react';
import type { Insights } from '../types';
import { formatDate, formatHours, formatNumber, formatPercent } from '../lib/format';
import { Icon } from './Icons';

export type DrillTarget =
  | { type: 'station'; id: string }
  | { type: 'seller'; id: string }
  | { type: 'driver'; id: number; station: string };

interface Props {
  data: Insights | null;
  loading: boolean;
  error: string;
  onDrill: (target: DrillTarget) => void;
}

function readings(data: Insights): { icon: 'map-pin' | 'clock' | 'alert' | 'store'; text: string }[] {
  const lines: { icon: 'map-pin' | 'clock' | 'alert' | 'store'; text: string }[] = [];
  const pending = data.kpis.pending;
  const leadStation = [...data.stations].sort((a, b) => b.pending - a.pending)[0];
  if (leadStation && pending > 0 && leadStation.pending > 0) {
    const share = leadStation.pending / pending;
    if (share >= 0.15) lines.push({ icon: 'map-pin', text: `${formatPercent(share)} das pendências estão concentradas em ${leadStation.station_code}.` });
  }
  const aged = data.aging.d3_6 + data.aging.d7p;
  if (aged > 0) lines.push({ icon: 'clock', text: `${formatNumber(aged)} ${aged === 1 ? 'pendência tem' : 'pendências têm'} 3 dias ou mais e merece${aged === 1 ? '' : 'm'} revisão prioritária.` });
  const causes = [
    { label: 'fora do raio', count: data.cause.raio_only },
    { label: 'fora do horário', count: data.cause.horario_only },
    { label: 'fora do raio e do horário', count: data.cause.both },
    { label: 'outros sinais', count: data.cause.other },
  ].sort((a, b) => b.count - a.count);
  const totalCauses = causes.reduce((sum, item) => sum + item.count, 0);
  if (causes[0]?.count && totalCauses > 0) {
    lines.push({ icon: 'alert', text: `A evidência mais frequente é ${causes[0].label} (${formatNumber(causes[0].count)} registros).` });
  }
  const repeatSeller = data.repeat_sellers.find((seller) => seller.pending > 0);
  if (repeatSeller) lines.push({ icon: 'store', text: `${repeatSeller.name} acumula ${formatNumber(repeatSeller.pending)} ${repeatSeller.pending === 1 ? 'pendência' : 'pendências'} entre ${formatNumber(repeatSeller.occurrences)} ocorrências.` });
  if (lines.length < 4) {
    const repeatDriver = data.repeat_drivers.find((driver) => driver.pending > 0);
    if (repeatDriver) lines.push({ icon: 'alert', text: `${repeatDriver.name} tem recorrência na station ${repeatDriver.station_code}.` });
  }
  return lines.slice(0, 4);
}

function InsightCard({ title, eyebrow, children, className = '' }: { title: string; eyebrow?: string; children: ReactNode; className?: string }) {
  return <section className={`insight-card ${className}`}><div className="insight-card-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h3>{title}</h3></div></div>{children}</section>;
}

function DailyChart({ data }: { data: Insights['daily'] }) {
  const width = 560;
  const height = 175;
  const top = 14;
  const bottom = 34;
  const plotHeight = height - top - bottom;
  const max = Math.max(1, ...data.map((item) => item.total));
  const gap = data.length > 0 ? width / data.length : width;
  return (
    <div className="daily-chart-wrap">
      {data.length === 0 ? <p className="chart-empty">Sem ocorrências no período selecionado.</p> : <svg viewBox={`0 0 ${width} ${height}`} className="daily-chart" role="img" aria-label="Ocorrências diárias: total e tratadas">
        {[0, 0.5, 1].map((ratio) => <g key={ratio}><line x1="0" x2={width} y1={top + plotHeight * ratio} y2={top + plotHeight * ratio} className="chart-grid-line" /><text x="0" y={top + plotHeight * ratio - 4} className="chart-axis-label">{Math.round(max * (1 - ratio))}</text></g>)}
        {data.map((item, index) => {
          const x = index * gap + gap * 0.34;
          const barWidth = Math.max(4, gap * 0.38);
          const totalHeight = (item.total / max) * plotHeight;
          const treatedHeight = (item.treated / max) * plotHeight;
          return <g key={item.date}><rect x={x} y={top + plotHeight - totalHeight} width={barWidth} height={totalHeight} rx="3" className="chart-bar-total" /><rect x={x} y={top + plotHeight - treatedHeight} width={barWidth} height={treatedHeight} rx="3" className="chart-bar-treated" />{(index === 0 || index === data.length - 1 || index % Math.ceil(data.length / 6) === 0) && <text x={x + barWidth / 2} y={height - 8} textAnchor="middle" className="chart-axis-label">{formatDate(item.date)}</text>}</g>;
        })}
      </svg>}
      <div className="chart-legend"><span><i className="legend-dot total-dot" />Total</span><span><i className="legend-dot treated-dot" />Tratadas</span></div>
    </div>
  );
}

function AgingBars({ aging }: { aging: Insights['aging'] }) {
  const values = [
    { label: 'Hoje', value: aging.d0, tone: 'age-today' },
    { label: '1–2 dias', value: aging.d1_2, tone: 'age-soon' },
    { label: '3–6 dias', value: aging.d3_6, tone: 'age-aging' },
    { label: '7+ dias', value: aging.d7p, tone: 'age-old' },
  ];
  const max = Math.max(1, ...values.map((item) => item.value));
  return <div className="aging-list">{values.map((item) => <div className="aging-row" key={item.label}><span>{item.label}</span><span className="aging-track"><i className={item.tone} style={{ width: `${Math.max(item.value > 0 ? 4 : 0, (item.value / max) * 100)}%` }} /></span><strong>{formatNumber(item.value)}</strong></div>)}</div>;
}

function CauseDonut({ cause }: { cause: Insights['cause'] }) {
  const values = [
    { label: 'Só raio', value: cause.raio_only, color: '#ed633f' },
    { label: 'Só horário', value: cause.horario_only, color: '#e8a744' },
    { label: 'Raio + horário', value: cause.both, color: '#695ad8' },
    { label: 'Outros', value: cause.other, color: '#bac3cb' },
  ];
  const total = values.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const gradientStops = values.map((item) => {
    const start = cursor;
    cursor += total ? (item.value / total) * 100 : 0;
    return `${item.color} ${start}% ${cursor}%`;
  });
  const style = { background: total ? `conic-gradient(${gradientStops.join(',')})` : '#e9edf0' } as CSSProperties;
  return <div className="cause-wrap"><div className="cause-donut" style={style} role="img" aria-label={`${formatNumber(total)} evidências classificadas`}><div><strong>{formatNumber(total)}</strong><span>registros</span></div></div><div className="cause-legend">{values.map((item) => <div key={item.label}><i style={{ backgroundColor: item.color }} /><span>{item.label}</span><strong>{formatNumber(item.value)}</strong></div>)}</div></div>;
}

function HourChart({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return <div className="hour-chart" role="img" aria-label="Ocorrências por hora do dia, horário de Brasília">{values.map((value, hour) => <div className="hour-column" key={hour} title={`${String(hour).padStart(2, '0')}h · ${formatNumber(value)} ocorrências`}><span className="hour-bar" style={{ height: `${Math.max(value > 0 ? 4 : 1, (value / max) * 100)}%` }} /><small>{hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}</small></div>)}</div>;
}

function Distribution({ rows, emptyText }: { rows: { label: string; value: number; note?: string }[]; emptyText: string }) {
  if (rows.length === 0) return <p className="chart-empty">{emptyText}</p>;
  const max = Math.max(1, ...rows.map((item) => item.value));
  return <div className="distribution-list">{rows.slice(0, 6).map((item) => <div className="distribution-row" key={item.label}><div className="distribution-line"><strong>{item.label}</strong><span>{item.note}</span><b>{formatNumber(item.value)}</b></div><span className="distribution-track"><i style={{ width: `${Math.max(item.value > 0 ? 3 : 0, (item.value / max) * 100)}%` }} /></span></div>)}</div>;
}

export default function InsightsView({ data, loading, error, onDrill }: Props) {
  if (loading && !data) return <div className="panel insights-loading"><span className="button-spinner" />Carregando leituras do período…</div>;
  if (error && !data) return <div className="panel insight-error" role="alert"><Icon name="alert" /><strong>Não foi possível carregar os insights.</strong><p>{error}</p><span>Altere os filtros ou tente novamente.</span></div>;
  if (!data) return null;
  const notes = readings(data);
  const causeTotal = data.cause.raio_only + data.cause.horario_only + data.cause.both + data.cause.other;
  return (
    <div className="insights-content">
      {error && <div className="inline-error" role="alert">{error}</div>}
      <section className="reading-banner">
        <div className="reading-heading"><span className="reading-mark"><Icon name="spark" size={19} /></span><div><span className="eyebrow">O QUE MERECE ATENÇÃO</span><h2>Leituras do recorte</h2></div><span className="reading-scope">Filtros de período, regional e station</span></div>
        {notes.length ? <ul className="reading-list">{notes.map((note, index) => <li key={`${note.icon}-${index}`}><Icon name={note.icon} size={15} /><span>{note.text}</span></li>)}</ul> : <p className="reading-empty">Ainda não há volume suficiente neste recorte para apontar padrões. Experimente ampliar o período.</p>}
      </section>

      <div className="insight-kpis">
        <div className="insight-kpi"><span>Pendentes</span><strong>{formatNumber(data.kpis.pending)}</strong><small>de {formatNumber(data.kpis.total)} ocorrências</small></div>
        <div className="insight-kpi"><span>Pacotes em espera</span><strong>{formatNumber(data.kpis.packages_pending)}</strong><small>não coletados</small></div>
        <div className="insight-kpi"><span>Tempo médio até tratar</span><strong>{formatHours(data.kpis.avg_hours_to_treat)}</strong><small>entre ocorrências tratadas</small></div>
        <div className="insight-kpi"><span>Taxa de reversão</span><strong>{formatPercent(data.kpis.reversal_rate)}</strong><small>das tratadas, revertidas</small></div>
      </div>

      <div className="insight-grid">
        <InsightCard title="Evolução diária" eyebrow="VOLUME E TRATATIVAS" className="insight-card-wide"><DailyChart data={data.daily} /></InsightCard>
        <InsightCard title="Idade das pendências" eyebrow="PRIORIDADE"><AgingBars aging={data.aging} /><p className="chart-caption">A faixa de 3 dias ou mais indica onde vale acelerar a tratativa.</p></InsightCard>
        <InsightCard title="Sinais de causa" eyebrow="EVIDÊNCIA DO SISTEMA"><CauseDonut cause={data.cause} />{causeTotal === 0 && <p className="chart-caption">Sem evidência classificada no período.</p>}</InsightCard>
        <InsightCard title="Horário das ocorrências" eyebrow="HORA DE BRASÍLIA" className="insight-card-wide"><HourChart values={data.by_hour} /><p className="chart-caption">Distribuição por hora local (America/Sao_Paulo).</p></InsightCard>
        <InsightCard title="Resultado das tratativas" eyebrow="REVERSÃO"><Distribution rows={data.reversal.map((item) => ({ label: item.label, value: item.count, note: item.reversed ? 'revertida' : 'não revertida' }))} emptyText="Nenhuma tratativa neste período." /></InsightCard>
        <InsightCard title="Justificativas" eyebrow="CAUSAS APURADAS"><Distribution rows={data.justifications.map((item) => ({ label: item.label, value: item.count }))} emptyText="Nenhuma justificativa registrada neste período." /></InsightCard>
        <InsightCard title="Estações com mais pendências" eyebrow="RANKING" className="insight-card-wide"><div className="drill-list">{data.stations.length ? data.stations.slice(0, 8).map((item) => <button type="button" key={item.station_code} className="drill-row station-drill" onClick={() => onDrill({ type: 'station', id: item.station_code })}><span className="drill-primary"><strong>{item.station_code}</strong><small>{item.regional}</small></span><span className="drill-metric"><b>{formatNumber(item.pending)}</b><small>pendentes</small></span><span className="drill-metric"><b>{formatNumber(item.packages_pending)}</b><small>pacotes</small></span><Icon name="arrow-right" size={15} /></button>) : <p className="chart-empty">Sem stations no período.</p>}</div></InsightCard>
        <InsightCard title="Sellers reincidentes" eyebrow="ABRA A FILA PARA INVESTIGAR"><div className="drill-list">{data.repeat_sellers.length ? data.repeat_sellers.slice(0, 6).map((item) => <button type="button" key={item.shop_id} className="drill-row" onClick={() => onDrill({ type: 'seller', id: item.shop_id })}><span className="drill-avatar seller-avatar"><Icon name="store" size={15} /></span><span className="drill-primary"><strong>{item.name}</strong><small>ID {item.shop_id} · {item.days} dias</small></span><span className="drill-metric"><b>{formatNumber(item.pending)}</b><small>pendentes</small></span><Icon name="arrow-right" size={15} /></button>) : <p className="chart-empty">Sem reincidências de sellers neste período.</p>}</div></InsightCard>
        <InsightCard title="Motoristas reincidentes" eyebrow="ABRA A FILA PARA INVESTIGAR"><div className="drill-list">{data.repeat_drivers.length ? data.repeat_drivers.slice(0, 6).map((item) => <button type="button" key={item.driver_id} className="drill-row" onClick={() => onDrill({ type: 'driver', id: item.driver_id, station: item.station_code })}><span className="drill-avatar driver-avatar"><Icon name="user" size={15} /></span><span className="drill-primary"><strong>{item.name}</strong><small>ID {item.driver_id} · {item.station_code}</small></span><span className="drill-metric"><b>{formatNumber(item.pending)}</b><small>pendentes</small></span><Icon name="arrow-right" size={15} /></button>) : <p className="chart-empty">Sem reincidências de motoristas neste período.</p>}</div></InsightCard>
      </div>
    </div>
  );
}
