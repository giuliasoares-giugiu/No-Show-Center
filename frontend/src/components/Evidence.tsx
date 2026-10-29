import type { Occurrence } from '../types';
import { timeInSaoPaulo } from '../lib/format';
import { Icon } from './Icons';

function RadiusEvidence({ occurrence }: { occurrence: Occurrence }) {
  const unknown = occurrence.raio === 'NA';
  const outside = occurrence.raio === 'Fora do raio';
  return (
    <div className="evidence-card">
      <div className="evidence-heading">
        <span className="evidence-icon radius-icon"><Icon name="map-pin" size={16} /></span>
        <div><strong>Raio de coleta</strong><span>{unknown ? 'Sem evidência de localização' : occurrence.raio}</span></div>
      </div>
      <div className={`radius-visual ${unknown ? 'is-unknown' : outside ? 'is-outside' : 'is-inside'}`} aria-label={unknown ? 'Raio não disponível' : outside ? 'Registro fora do raio' : 'Registro dentro do raio'}>
        <span className="radius-ring ring-outer" />
        <span className="radius-ring ring-inner" />
        <span className="radius-center"><Icon name="store" size={15} /></span>
        {!unknown && <span className="radius-point"><span /></span>}
        <span className="radius-legend">limite do raio</span>
      </div>
      <div className="evidence-measure">
        <strong>{unknown || occurrence.radius_diff === null ? '—' : `${Math.round(occurrence.radius_diff)} m`}</strong>
        <span>{unknown ? 'distância indisponível' : outside ? 'além do limite' : 'para o limite'}</span>
      </div>
      <p className="evidence-footnote">Representação esquemática da evidência registrada.</p>
    </div>
  );
}

function timeToMinutes(value: string): number {
  const [hour = '0', minute = '0'] = value.split(':');
  return Number(hour) * 60 + Number(minute);
}

function HoursEvidence({ occurrence }: { occurrence: Occurrence }) {
  const event = occurrence.occurred_at ? timeToMinutes(timeInSaoPaulo(occurrence.occurred_at)) : null;
  const open = timeToMinutes(occurrence.open_hour);
  const close = timeToMinutes(occurrence.close_hour);
  const eventPosition = event === null ? 0 : Math.min(100, Math.max(0, (event / 1440) * 100));
  const openPosition = (open / 1440) * 100;
  const closePosition = (close / 1440) * 100;
  const outside = occurrence.horario_funcionamento === 'Fora do horário de funcionamento';
  return (
    <div className="evidence-card">
      <div className="evidence-heading">
        <span className="evidence-icon hours-icon"><Icon name="clock" size={16} /></span>
        <div><strong>Horário de funcionamento</strong><span>{occurrence.horario_funcionamento}</span></div>
      </div>
      <div className="hours-visual" aria-label={`Funcionamento ${occurrence.open_hour} a ${occurrence.close_hour}; ocorrência às ${timeInSaoPaulo(occurrence.occurred_at)}`}>
        <div className="hours-track">
          <span className="hours-open-window" style={{ left: `${openPosition}%`, width: `${closePosition - openPosition}%` }} />
          <span className={`hours-event-marker${outside ? ' is-outside' : ''}`} style={{ left: `${eventPosition}%` }} />
        </div>
        <div className="hours-ticks"><span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>24h</span></div>
        <div className="hours-labels">
          <span><i className="legend-open" />Aberto {occurrence.open_hour}–{occurrence.close_hour}</span>
          <span className={outside ? 'is-alert' : ''}><i className="legend-event" />Registro {timeInSaoPaulo(occurrence.occurred_at)}</span>
        </div>
      </div>
      <p className="evidence-footnote">Faixa verde indica a janela informada pelo seller.</p>
    </div>
  );
}

export default function Evidence({ occurrence }: { occurrence: Occurrence }) {
  return (
    <section className="detail-section evidence-section">
      <div className="section-heading">
        <div><span className="eyebrow">SINAL DO SISTEMA</span><h3>Evidências da ocorrência</h3></div>
        <span className="section-help"><Icon name="help" size={15} /> Apoie a avaliação, não substitui a apuração</span>
      </div>
      <div className="evidence-grid"><RadiusEvidence occurrence={occurrence} /><HoursEvidence occurrence={occurrence} /></div>
    </section>
  );
}
