import type { ContactEntry, Occurrence, Queue, TreatmentPayload } from '../types';
import { formatDateTime, formatNumber, occurrenceState } from '../lib/format';
import { Icon } from './Icons';
import Evidence from './Evidence';
import HistoryTimeline from './HistoryTimeline';
import TreatmentForm from './TreatmentForm';

interface Props {
  occurrence: Occurrence;
  queue: Queue | null;
  history: ContactEntry[];
  historyLoading: boolean;
  historyError: string;
  onContact: () => void;
  onSaveTreatment: (payload: TreatmentPayload) => Promise<void>;
}

export default function OccurrenceDetail({ occurrence, queue, history, historyLoading, historyError, onContact, onSaveTreatment }: Props) {
  const state = occurrenceState(occurrence);
  const stateLabel = state === 'done' ? 'Tratada' : state === 'contacted' ? 'Motorista já acionado' : 'Aguardando contato';
  const stateClass = state === 'done' ? 'state-done' : state === 'contacted' ? 'state-contacted' : 'state-new';

  return (
    <article className="panel occurrence-detail" aria-label={`Detalhes da ocorrência ${occurrence.id}`}>
      <div className="detail-scroll">
        <div className="detail-hero">
          <div className="detail-hero-copy">
            <div className="detail-overline"><span className={`status-pill ${stateClass}`}>{stateLabel}</span><span className="case-id">Ocorrência #{occurrence.id}</span><span className="case-id">Tarefa #{occurrence.pickup_task_id}</span></div>
            <h2>{occurrence.seller_name}</h2>
            <p className="hero-subtitle">{occurrence.seller_performance} <span>·</span> {occurrence.fault_type}</p>
            <div className="detail-hero-meta"><span><Icon name="map-pin" size={14} />{occurrence.station_code}</span><span><Icon name="clock" size={14} />{formatDateTime(occurrence.occurred_at)}</span></div>
          </div>
          <div className="hero-actions">
            {occurrence.recurrence_days >= 2 && <span className="recurrence-callout"><Icon name="activity" size={15} /><strong>{occurrence.recurrence_days} dias</strong><small>de recorrência</small></span>}
            <button type="button" className="primary-button whatsapp-button" onClick={onContact} disabled={!occurrence.can_treat || !occurrence.driver_id} title={!occurrence.can_treat ? 'Somente membros da station ou regional podem acionar' : undefined}>
              <Icon name="whatsapp" size={17} /> Acionar motorista
            </button>
          </div>
        </div>

        {!occurrence.can_treat && <div className="permission-note detail-permission"><Icon name="shield" size={17} /><span><strong>Visualização apenas.</strong> O contato e a tratativa ficam disponíveis para membros da station ou da regional.</span></div>}
        {occurrence.treatment && <div className="treatment-complete"><span className="complete-mark"><Icon name="check" size={16} /></span><div><strong>Tratativa concluída: {occurrence.treatment.reversal_label}</strong><span>{occurrence.treatment.justification_label}{occurrence.treatment.justification_text ? ` · ${occurrence.treatment.justification_text}` : ''}</span></div><small>por {occurrence.treatment.treated_by}</small></div>}

        <section className="detail-section facts-section">
          <div className="section-heading"><div><span className="eyebrow">RESUMO OPERACIONAL</span><h3>Contexto da coleta</h3></div></div>
          <div className="facts-grid">
            <div className="fact-item"><span className="fact-icon"><Icon name="user" size={16} /></span><span className="fact-copy"><small>Motorista</small><strong>{occurrence.driver_name}</strong><span>ID {occurrence.driver_id ?? '—'}{occurrence.driver_phone ? ` · ${occurrence.driver_phone}` : ''}</span></span></div>
            <div className="fact-item"><span className="fact-icon"><Icon name="package" size={16} /></span><span className="fact-copy"><small>Pacotes sem coleta</small><strong className="fact-number">{formatNumber(occurrence.onhold_order_count)}</strong><span>em espera nesta ocorrência</span></span></div>
            <div className="fact-item"><span className="fact-icon"><Icon name="store" size={16} /></span><span className="fact-copy"><small>Seller</small><strong>{occurrence.seller_name}</strong><span>ID {occurrence.shop_id}</span></span></div>
            <div className="fact-item"><span className="fact-icon"><Icon name="users" size={16} /></span><span className="fact-copy"><small>Regional / station</small><strong>{occurrence.regional}</strong><span>{occurrence.station_code}</span></span></div>
            <div className="fact-item"><span className="fact-icon"><Icon name="activity" size={16} /></span><span className="fact-copy"><small>Recorrência</small><strong>{occurrence.recurrence_days} {occurrence.recurrence_days === 1 ? 'dia' : 'dias'}</strong><span>{occurrence.recurrence_days >= 2 ? 'Reincidência merece atenção' : 'Sem reincidência relevante'}</span></span></div>
            <div className="fact-item"><span className="fact-icon"><Icon name="route" size={16} /></span><span className="fact-copy"><small>Rota / alocação</small><strong>{occurrence.route_name || '—'}</strong><span>Alocado por {occurrence.allocated_by || '—'}</span></span></div>
          </div>
          {occurrence.driver_justification && <div className="driver-statement"><span>JUSTIFICATIVA INFORMADA PELO MOTORISTA</span><p>“{occurrence.driver_justification}”</p></div>}
        </section>

        <Evidence occurrence={occurrence} />

        <section className="detail-section history-section">
          {historyLoading ? <div className="section-heading"><div><span className="eyebrow">RASTREABILIDADE</span><h3>Histórico</h3></div><span className="inline-loading">Carregando…</span></div> : <HistoryTimeline occurrence={occurrence} history={history} />}
          {historyError && <p className="form-error history-error" role="alert">{historyError}</p>}
        </section>

        {!occurrence.treatment && <TreatmentForm
          reversals={queue?.reversal_options ?? []}
          justifications={queue?.justification_options ?? []}
          canTreat={occurrence.can_treat}
          onSave={onSaveTreatment}
        />}
      </div>
    </article>
  );
}
