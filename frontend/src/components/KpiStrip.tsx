import type { Kpis } from '../types';
import { formatHours, formatNumber, formatPercent } from '../lib/format';
import { Icon } from './Icons';

interface Props { data: Kpis | null; loading: boolean; }

export default function KpiStrip({ data, loading }: Props) {
  const metrics = [
    { label: 'Pendentes', value: data ? formatNumber(data.pending) : '—', note: data ? `de ${formatNumber(data.total)} ocorrências` : 'no período', icon: 'inbox' as const, tone: 'metric-orange' },
    { label: 'Sem contato', value: data ? formatNumber(data.no_contact) : '—', note: 'pendências sem acionamento', icon: 'phone' as const, tone: 'metric-violet' },
    { label: 'Pacotes parados', value: data ? formatNumber(data.packages_pending) : '—', note: 'aguardando coleta', icon: 'package' as const, tone: 'metric-blue' },
    { label: 'Média até tratar', value: data ? formatHours(data.avg_hours_to_treat) : '—', note: 'entre as tratadas', icon: 'clock' as const, tone: 'metric-teal' },
    { label: 'Taxa de reversão', value: data ? formatPercent(data.reversal_rate) : '—', note: 'das tratadas, revertidas', icon: 'chart' as const, tone: 'metric-green' },
  ];
  return <section className={`kpi-strip${loading ? ' is-loading' : ''}`} aria-label="Indicadores do recorte" aria-busy={loading}>{metrics.map((metric) => <div className="kpi-card" key={metric.label}><span className={`kpi-icon ${metric.tone}`}><Icon name={metric.icon} size={17} /></span><span className="kpi-copy"><small>{metric.label}</small><strong>{metric.value}</strong><span>{metric.note}</span></span></div>)}</section>;
}
