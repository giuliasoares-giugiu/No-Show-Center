import type { KeyboardEvent } from 'react';
import type { Occurrence } from '../types';
import { formatDateTime, formatNumber, occurrenceState } from '../lib/format';
import { Icon } from './Icons';

interface Props {
  items: Occurrence[];
  selectedId: number | null;
  total: number;
  page: number;
  onSelect: (id: number) => void;
  onPage: (page: number) => void;
}

function stateLabel(item: Occurrence): { label: string; className: string } {
  const state = occurrenceState(item);
  if (state === 'done') return { label: 'Tratada', className: 'state-done' };
  if (state === 'contacted') return { label: 'Contatada', className: 'state-contacted' };
  return { label: 'Nova', className: 'state-new' };
}

export default function OccurrenceList({ items, selectedId, total, page, onSelect, onPage }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / 50));

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, button[aria-haspopup="dialog"]')) return;
    event.preventDefault();
    if (!items.length) return;
    const currentIndex = items.findIndex((item) => item.id === selectedId);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = Math.min(items.length - 1, Math.max(0, (currentIndex < 0 ? 0 : currentIndex) + step));
    onSelect(items[nextIndex].id);
  }

  return (
    <section className="panel queue-list-panel" aria-label="Fila de ocorrências" onKeyDown={handleKeyDown}>
      <div className="list-panel-heading">
        <div>
          <h2>Fila de trabalho</h2>
          <p>{formatNumber(total)} ocorrências no recorte</p>
        </div>
        <span className="keyboard-hint" title="Use as setas do teclado para navegar"><kbd>↑</kbd><kbd>↓</kbd></span>
      </div>

      {items.length === 0 ? (
        <div className="empty-list">
          <span className="empty-icon"><Icon name="inbox" size={22} /></span>
          <strong>Nenhuma ocorrência por aqui</strong>
          <p>Amplie o período ou escolha outras stations para encontrar registros.</p>
        </div>
      ) : (
        <div className="occurrence-list" role="listbox" aria-label="Ocorrências">
          {items.map((item) => {
            const state = stateLabel(item);
            const selected = selectedId === item.id;
            return (
              <button
                type="button"
                role="option"
                aria-selected={selected}
                className={`occurrence-row${selected ? ' is-selected' : ''}`}
                key={item.id}
                onClick={() => onSelect(item.id)}
              >
                <span className={`row-state-dot ${state.className}`} aria-hidden="true" />
                <span className="row-main">
                  <span className="row-title-line">
                    <strong>{item.seller_name}</strong>
                    {item.recurrence_days >= 2 && <span className="repeat-chip" title={`${item.recurrence_days} dias de recorrência`}>{item.recurrence_days}d</span>}
                  </span>
                  <span className="row-meta"><span>{item.station_code}</span><span className="meta-dot">·</span><span>{item.driver_name}</span></span>
                  <span className="row-foot">
                    <span className={`status-pill ${state.className}`}>{state.label}</span>
                    <span className="package-count"><Icon name="package" size={13} />{formatNumber(item.onhold_order_count)}</span>
                    <time dateTime={item.occurred_at ?? undefined}>{formatDateTime(item.occurred_at)}</time>
                  </span>
                </span>
                <Icon name="chevron-right" size={16} className="row-chevron" />
              </button>
            );
          })}
        </div>
      )}

      <div className="list-pagination" aria-label="Paginação da fila">
        <span>Página {page} de {totalPages}</span>
        <div className="pagination-actions">
          <button type="button" className="icon-button" aria-label="Página anterior" disabled={page <= 1} onClick={() => onPage(page - 1)}><Icon name="chevron-left" /></button>
          <button type="button" className="icon-button" aria-label="Próxima página" disabled={page >= totalPages} onClick={() => onPage(page + 1)}><Icon name="chevron-right" /></button>
        </div>
      </div>
    </section>
  );
}
