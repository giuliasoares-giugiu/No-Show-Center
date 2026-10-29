import type { ReactNode } from 'react';
import { formatNumber } from '../lib/format';

export function InsightCard({ title, eyebrow, children, className = '' }: { title: string; eyebrow?: string; children: ReactNode; className?: string }) {
  return <section className={`insight-card ${className}`}><div className="insight-card-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h3>{title}</h3></div></div>{children}</section>;
}

export function Bars({ rows, emptyText, limit = 6 }: { rows: { label: string; value: number; note?: string }[]; emptyText: string; limit?: number }) {
  if (rows.length === 0) return <p className="chart-empty">{emptyText}</p>;
  const max = Math.max(1, ...rows.map((item) => item.value));
  return (
    <div className="distribution-list">
      {rows.slice(0, limit).map((item) => (
        <div className="distribution-row" key={item.label}>
          <div className="distribution-line"><strong>{item.label}</strong><span>{item.note}</span><b>{formatNumber(item.value)}</b></div>
          <span className="distribution-track"><i style={{ width: `${Math.max(item.value > 0 ? 3 : 0, (item.value / max) * 100)}%` }} /></span>
        </div>
      ))}
    </div>
  );
}

export function ResultPill({ label, reversed }: { label: string; reversed: boolean }) {
  return <span className={`result-pill ${reversed ? 'is-reversed' : 'is-open'}`}>{label}</span>;
}

export function Pager({ page, total, pageSize = 50, onPage }: { page: number; total: number; pageSize?: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="view-pager">
      <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
      <span>Página {page} de {pages}</span>
      <button type="button" className="secondary-button" disabled={page >= pages} onClick={() => onPage(page + 1)}>Próxima</button>
    </div>
  );
}
