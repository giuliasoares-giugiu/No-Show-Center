import { STATE_LABEL, stateOf, timeLabel } from "../format";
import { api } from "../services/api";
import type { Occurrence, Queue, Treatment } from "../types";
import TreatmentForm from "./TreatmentForm";

interface Props {
  occurrence: Occurrence;
  queue: Queue;
  onContact: (o: Occurrence) => void;
  onSaved: (id: number, t: Treatment) => void;
}

export default function OccurrenceRow({ occurrence: o, queue, onContact, onSaved }: Props) {
  return (
    <tr className={o.treatment ? "row-treated" : undefined}>
      <td>
        <div className="seller">{o.seller_name || `Shop ${o.shop_id}`}</div>
        <div className="mono">ID: {o.shop_id}</div>
        {o.recurrence_days >= 2 && (
          <span className={`badge ${o.recurrence_days >= 7 ? "badge-danger" : "badge-warn"}`}>
            {o.recurrence_days} dias com recorrência
          </span>
        )}
      </td>
      <td><span className="chip">{o.regional}</span></td>
      <td><span className="chip chip-station">{o.station_code}</span></td>
      <td>
        <div className="allocated">{o.allocated_by || "—"}</div>
      </td>
      <td>
        <div className="driver">{o.driver_name}</div>
        <div className="mono">{o.driver_phone}</div>
      </td>
      <td>
        <div className="status">{STATE_LABEL[stateOf(o)]}</div>
        <div className="info info-warn">Pacotes pendentes: {o.onhold_order_count}</div>
        <div className="info">Horário registrado: {timeLabel(o.occurred_at)}</div>
      </td>
      <td>
        <button type="button" className="btn-whats" disabled={!o.can_treat} onClick={() => onContact(o)}
          title={o.can_treat ? undefined : "Apenas membros desta station podem acionar o motorista."}>
          WhatsApp
        </button>
      </td>
      <td>
        <TreatmentForm
          key={o.treatment?.updated_at ?? "new"}
          reversals={queue.reversal_options}
          justifications={queue.justification_options}
          canTreat={o.can_treat}
          onSave={async (payload) => {
            const t = await api.saveTreatment(o.id, payload);
            onSaved(o.id, t);
          }}
        />
      </td>
    </tr>
  );
}
