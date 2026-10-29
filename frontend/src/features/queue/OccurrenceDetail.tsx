import { useEffect, useState } from "react";
import { dateTimeLabel, num, plural, STATE_LABEL, stateOf, verdict } from "../../format";
import { api } from "../../services/api";
import type { ContactEntry, Occurrence, Queue, Treatment } from "../../types";
import ContactDialog from "./ContactDialog";
import { HoursGlyph, RadiusGlyph } from "./EvidenceGlyphs";
import Timeline from "./Timeline";
import TreatmentPanel from "./TreatmentPanel";

interface Props {
  occurrence: Occurrence;
  queue: Queue;
  onSaved: (t: Treatment) => void;
  onContacted: (memberName: string) => void;
}

export default function OccurrenceDetail({ occurrence: o, queue, onSaved, onContacted }: Props) {
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [dialog, setDialog] = useState(false);
  const state = stateOf(o);

  useEffect(() => {
    let ignore = false;
    api.history(o.id).then((h) => !ignore && setContacts(h)).catch(() => undefined);
    return () => { ignore = true; };
  }, [o.id, o.contact_count]);

  return (
    <article className="detail" aria-labelledby="detail-title">
      <header className="detail-head">
        <div>
          <h2 id="detail-title">{o.seller_name || `Shop ${o.shop_id}`}</h2>
          <p className="muted">
            <span className="tag tag-station">{o.station_code}</span>
            <span>{o.regional}</span>
            <span className="tabular">Shop {o.shop_id}</span>
          </p>
        </div>
        <span className={`pill pill-${state}`}>{STATE_LABEL[state]}</span>
      </header>

      <div className="detail-body">
      <div className="detail-main">
      <section className="detail-block" aria-label="O que o sistema registrou">
        <h3>O que o sistema registrou</h3>
        <p className="verdict">{verdict(o)}</p>
        <div className="glyphs">
          <RadiusGlyph o={o} />
          <HoursGlyph o={o} />
        </div>
        <div className="facts">
          <div>
            <strong className="big">{num(o.onhold_order_count)}</strong>
            <span>{plural(o.onhold_order_count, "pacote sem coleta", "pacotes sem coleta")}</span>
          </div>
          {o.recurrence_days >= 2 && (
            <div>
              <strong className="big">{o.recurrence_days}</strong>
              <span>dias com ocorrência neste seller nos últimos 30</span>
            </div>
          )}
        </div>
      </section>

      <section className="detail-block" aria-label="Quem estava na rota">
        <h3>Quem estava na rota</h3>
        <dl className="people">
          <div><dt>Motorista</dt><dd>{o.driver_name}<span className="tabular muted">{o.driver_phone}</span></dd></div>
          <div><dt>Rota</dt><dd>{o.route_name || "—"}</dd></div>
          <div><dt>Alocada por</dt><dd>{o.allocated_by || "—"}</dd></div>
        </dl>
      </section>

      <section className="detail-block" aria-label="Histórico">
        <h3>Histórico</h3>
        <Timeline occurrence={o} contacts={contacts} />
      </section>
      </div>

      <aside className="detail-actions">
      <section className="detail-block" aria-label="Acionar o motorista">
        <h3>Acionar o motorista</h3>
        <button type="button" className="btn btn-whats" disabled={!o.can_treat} onClick={() => setDialog(true)}
          title={o.can_treat ? undefined : "Só membros desta station acionam o motorista."}>
          {o.contact_count > 0 ? "Acionar de novo pelo WhatsApp" : "Acionar pelo WhatsApp"}
        </button>
        {o.last_contact_at && (
          <p className="muted">Último contato: {o.last_contact_by}, {dateTimeLabel(o.last_contact_at)}.</p>
        )}
      </section>

      <section className="detail-block" aria-label="Registrar tratativa">
        <h3>Registrar tratativa</h3>
        <TreatmentPanel key={o.treatment?.updated_at ?? "new"} occurrence={o} queue={queue} onSaved={onSaved} />
      </section>
      </aside>
      </div>

      {dialog && <ContactDialog occurrence={o} onClose={() => setDialog(false)} onSent={onContacted} />}
    </article>
  );
}
