import { clockToMinutes, minutesOfDay, num, timeLabel } from "../../format";
import type { Occurrence } from "../../types";

/** Raio permitido (círculo) e onde o motorista registrou a chegada (ponto). */
export function RadiusGlyph({ o }: { o: Occurrence }) {
  const R = 44;
  const known = o.raio === "Fora do raio" || o.raio === "Dentro do raio";
  const outside = o.raio === "Fora do raio";
  const diff = o.radius_diff ?? 0;
  const dist = outside ? R + 12 + (Math.min(diff, 800) / 800) * 50 : 16;
  const angle = (-28 * Math.PI) / 180;
  const cx = 74, cy = 80;
  const dx = cx + Math.cos(angle) * dist, dy = cy + Math.sin(angle) * dist;

  const caption = !known
    ? "Sem dado de localização"
    : outside
      ? `${num(Math.round(diff))} m além do raio permitido`
      : "Registro dentro do raio";

  return (
    <figure className="glyph">
      <svg viewBox="0 0 200 156" role="img" aria-label={caption}>
        <circle cx={cx} cy={cy} r={R} fill="var(--raio-fundo)" stroke="var(--raio)" strokeWidth="2.5"
          strokeDasharray={known ? undefined : "5 5"} />
        <circle cx={cx} cy={cy} r="3" fill="var(--raio)" />
        {known && outside && (
          <line x1={cx + Math.cos(angle) * R} y1={cy + Math.sin(angle) * R} x2={dx} y2={dy}
            stroke="var(--spx)" strokeWidth="2" strokeDasharray="4 3" />
        )}
        {known && <circle cx={dx} cy={dy} r="8" fill={outside ? "var(--spx)" : "var(--coleta)"} stroke="#fff" strokeWidth="2.5" />}
      </svg>
      <figcaption>
        <strong>Raio</strong>
        <span>{caption}</span>
      </figcaption>
    </figure>
  );
}

const EDGE_CLEARANCE_H = 1.5;

/** Régua de 24h: janela de funcionamento do ponto e instante do registro. */
export function HoursGlyph({ o }: { o: Occurrence }) {
  const W = 300, pad = 8, track = W - pad * 2;
  const open = clockToMinutes(o.open_hour) ?? 9 * 60;
  const close = clockToMinutes(o.close_hour) ?? 18 * 60;
  const at = minutesOfDay(o.occurred_at);
  const x = (min: number) => pad + (min / 1440) * track;
  // O rótulo do backend é a verdade do sistema; a régua só mostra a geometria dele.
  const outside = o.horario_funcionamento
    ? o.horario_funcionamento.startsWith("Fora")
    : at != null && (at < open || at > close);
  const tone = outside ? "var(--spx)" : "var(--coleta)";

  const ticks = [0, 6, 12, 18, 24];
  const extras = [{ h: open / 60, text: o.open_hour || "09:00" }, { h: close / 60, text: o.close_hour || "18:00" }]
    .filter((e) => ticks.every((t) => Math.abs(t - e.h) >= EDGE_CLEARANCE_H));
  const anchor = at == null ? "middle" : x(at) < 26 ? "start" : x(at) > W - 26 ? "end" : "middle";

  return (
    <figure className="glyph glyph-wide">
      <svg viewBox={`0 0 ${W} 100`} role="img"
        aria-label={`Registro às ${timeLabel(o.occurred_at)}, funcionamento das ${o.open_hour} às ${o.close_hour}`}>
        <rect x={pad} y="46" width={track} height="16" rx="3" fill="var(--regua)" />
        <rect x={x(open)} y="46" width={x(close) - x(open)} height="16" rx="3" fill="var(--raio)" opacity="0.9" />
        {ticks.map((h) => (
          <g key={h}>
            <line x1={x(h * 60)} x2={x(h * 60)} y1="66" y2="72" stroke="var(--apagado)" />
            <text x={x(h * 60)} y="88" textAnchor={h === 0 ? "start" : h === 24 ? "end" : "middle"}
              fontSize="11" fill="var(--apagado)">{h}h</text>
          </g>
        ))}
        {extras.map((e) => (
          <g key={e.text}>
            <line x1={x(e.h * 60)} x2={x(e.h * 60)} y1="66" y2="72" stroke="var(--raio)" />
            <text x={x(e.h * 60)} y="88" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--raio)">{e.text}</text>
          </g>
        ))}
        {at != null && (
          <g>
            <line x1={x(at)} x2={x(at)} y1="26" y2="62" stroke={tone} strokeWidth="2.5" />
            <circle cx={x(at)} cy="24" r="7" fill={tone} stroke="#fff" strokeWidth="2.5" />
            <text x={x(at)} y="9" textAnchor={anchor} fontSize="12" fontWeight="700" fill={tone}>{timeLabel(o.occurred_at)}</text>
          </g>
        )}
      </svg>
      <figcaption>
        <strong>Horário</strong>
        <span>
          Registro às {timeLabel(o.occurred_at)}, {outside ? "fora" : "dentro"} do funcionamento
          ({o.open_hour || "09:00"} às {o.close_hour || "18:00"})
        </span>
      </figcaption>
    </figure>
  );
}
