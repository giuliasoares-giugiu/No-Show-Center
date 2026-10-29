import type { ContactEntry, Occurrence } from '../types';
import { formatDateTime } from '../lib/format';
import { Icon } from './Icons';

interface TimelineItem {
  key: string;
  at: string | null;
  title: string;
  detail: string;
  kind: 'system' | 'contact' | 'treatment';
}

export default function HistoryTimeline({ occurrence, history }: { occurrence: Occurrence; history: ContactEntry[] }) {
  const events: TimelineItem[] = [
    {
      key: `system-${occurrence.id}`,
      at: occurrence.occurred_at,
      title: 'Ocorrência registrada pelo sistema',
      detail: `${occurrence.seller_performance} · ${occurrence.fault_type}`,
      kind: 'system' as const,
    },
    ...history.map((item, index) => ({
      key: `contact-${occurrence.id}-${index}`,
      at: item.sent_at,
      title: 'Motorista acionado via WhatsApp',
      detail: item.member_name || item.sent_by,
      kind: 'contact' as const,
    })),
    ...(occurrence.treatment ? [{
      key: `treatment-${occurrence.id}`,
      at: occurrence.treatment.updated_at,
      title: 'Tratativa registrada',
      detail: `${occurrence.treatment.reversal_label} · ${occurrence.treatment.justification_label}${occurrence.treatment.justification_text ? ` — ${occurrence.treatment.justification_text}` : ''}`,
      kind: 'treatment' as const,
    }] : []),
  ].sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime());

  return (
    <section className="detail-section history-section">
      <div className="section-heading"><div><span className="eyebrow">RASTREABILIDADE</span><h3>Histórico</h3></div><span className="history-count">{events.length} registros</span></div>
      <ol className="timeline">
        {events.map((event) => (
          <li key={event.key} className={`timeline-item timeline-${event.kind}`}>
            <span className="timeline-marker"><Icon name={event.kind === 'system' ? 'activity' : event.kind === 'contact' ? 'phone' : 'check'} size={14} /></span>
            <div className="timeline-copy"><strong>{event.title}</strong><span>{event.detail}</span></div>
            <time dateTime={event.at ?? undefined}>{formatDateTime(event.at)}</time>
          </li>
        ))}
      </ol>
    </section>
  );
}
