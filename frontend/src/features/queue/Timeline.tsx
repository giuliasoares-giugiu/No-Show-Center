import { dateTimeLabel } from "../../format";
import type { ContactEntry, Occurrence } from "../../types";

interface Event {
  at: string;
  tone: "alert" | "wait" | "done";
  title: string;
  detail?: string;
}

export default function Timeline({ occurrence: o, contacts }: { occurrence: Occurrence; contacts: ContactEntry[] }) {
  const events: Event[] = [
    { at: o.occurred_at ?? `${o.occurrence_date}T12:00:00`, tone: "alert", title: "Ocorrência registrada pelo sistema" },
    ...[...contacts].reverse().map((c): Event => ({
      at: c.sent_at, tone: "wait", title: "Motorista acionado", detail: `Mensagem assinada por ${c.member_name}`,
    })),
  ];
  if (o.treatment) {
    events.push({
      at: o.treatment.updated_at, tone: "done", title: `Tratada por ${o.treatment.treated_by}`,
      detail: `${o.treatment.reversal_label}. ${o.treatment.justification_label}${o.treatment.justification_text ? `: ${o.treatment.justification_text}` : ""}`,
    });
  }
  events.sort((a, b) => a.at.localeCompare(b.at));

  return (
    <ol className="timeline">
      {events.map((e, i) => (
        <li key={i} className={`tl-${e.tone}`}>
          <span className="tl-dot" aria-hidden="true" />
          <div>
            <strong>{e.title}</strong>
            {e.detail && <p>{e.detail}</p>}
            <time dateTime={e.at}>{dateTimeLabel(e.at)}</time>
          </div>
        </li>
      ))}
    </ol>
  );
}
