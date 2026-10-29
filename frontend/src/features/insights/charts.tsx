import { dayLabel, num, percent } from "../../format";

/* ---------- Evolução diária ---------- */
function fillDays(data: { date: string; total: number; treated: number }[]) {
  if (data.length === 0) return [];
  const byDate = new Map(data.map((d) => [d.date, d]));
  const out: typeof data = [];
  const end = new Date(`${data[data.length - 1].date}T12:00:00Z`);
  for (let d = new Date(`${data[0].date}T12:00:00Z`); d <= end; d = new Date(d.getTime() + 86_400_000)) {
    const iso = d.toISOString().slice(0, 10);
    out.push(byDate.get(iso) ?? { date: iso, total: 0, treated: 0 });
  }
  return out;
}

export function TrendChart({ data }: { data: { date: string; total: number; treated: number }[] }) {
  const days = fillDays(data);
  if (days.length === 0) return <p className="empty-chart">Sem ocorrências no período.</p>;
  const W = 760, H = 230, left = 34, bottom = 26, top = 10;
  const max = Math.max(...days.map((d) => d.total), 1);
  const nice = max <= 4 ? max : Math.ceil(max / 4) * 4;
  const band = (W - left) / days.length;
  const bw = Math.min(band * 0.64, 30);
  const y = (v: number) => top + (1 - v / nice) * (H - top - bottom);
  const ticks = [0, nice / 2, nice];
  const labelAt = new Set([0, Math.floor((days.length - 1) / 2), days.length - 1]);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ocorrências por dia, com a parte já tratada">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W} y1={y(t)} y2={y(t)} stroke="var(--regua)" />
            <text x={left - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--apagado)">{num(Math.round(t))}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = left + band * i + (band - bw) / 2;
          return (
            <g key={d.date}>
              <rect x={x} y={y(d.total)} width={bw} height={Math.max(y(0) - y(d.total), 0)} fill="var(--tinta-clara)">
                <title>{`${dayLabel(d.date)}: ${d.total} ocorrências, ${d.treated} tratadas`}</title>
              </rect>
              <rect x={x} y={y(d.treated)} width={bw} height={Math.max(y(0) - y(d.treated), 0)} fill="var(--coleta)" />
              {labelAt.has(i) && (
                <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--apagado)">{dayLabel(d.date)}</text>
              )}
            </g>
          );
        })}
      </svg>
      <ul className="legend">
        <li><i style={{ background: "var(--tinta-clara)" }} />Ocorrências</li>
        <li><i style={{ background: "var(--coleta)" }} />Já tratadas</li>
      </ul>
    </div>
  );
}

/* ---------- Barras horizontais ---------- */
export interface BarItem {
  label: string;
  value: number;
  color?: string;
  note?: string;
}

export function BarList({ items, total, empty }: { items: BarItem[]; total?: number; empty: string }) {
  if (items.length === 0 || items.every((i) => i.value === 0)) return <p className="empty-chart">{empty}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  const sum = total ?? items.reduce((s, i) => s + i.value, 0);
  return (
    <ul className="bars">
      {items.map((i) => (
        <li key={i.label}>
          <span className="bar-label">{i.label}{i.note && <small>{i.note}</small>}</span>
          <span className="bar-track"><span style={{ width: `${(i.value / max) * 100}%`, background: i.color ?? "var(--marinho)" }} /></span>
          <span className="bar-value tabular">{num(i.value)} <small>{sum ? percent(i.value / sum) : ""}</small></span>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Barra empilhada (causa) ---------- */
export interface Segment { label: string; value: number; color: string; hint: string }

export function StackedBar({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <p className="empty-chart">Sem ocorrências no período.</p>;
  return (
    <div>
      <div className="stack" role="img" aria-label={segments.map((s) => `${s.label}: ${percent(s.value / total)}`).join(", ")}>
        {segments.filter((s) => s.value > 0).map((s) => (
          <span key={s.label} style={{ flex: s.value, background: s.color }} title={`${s.label}: ${s.value}`} />
        ))}
      </div>
      <ul className="stack-legend">
        {segments.filter((s) => s.value > 0).map((s) => (
          <li key={s.label}>
            <i style={{ background: s.color }} />
            <div>
              <strong>{s.label} <span className="tabular">{percent(s.value / total)}</span></strong>
              <p>{s.hint}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Horário em que acontece ---------- */
export function HourStrip({ hours }: { hours: number[] }) {
  const max = Math.max(...hours, 1);
  if (hours.every((h) => h === 0)) return <p className="empty-chart">Sem horários registrados.</p>;
  return (
    <div>
      <div className="hours" role="img" aria-label="Ocorrências por hora do dia">
        {hours.map((n, h) => (
          <span key={h} className={`hour${h >= 9 && h < 18 ? " hour-business" : ""}`} title={`${h}h: ${n} ocorrências`}>
            <i style={{ height: `${(n / max) * 100}%` }} />
          </span>
        ))}
      </div>
      <div className="hours-axis" aria-hidden="true"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
      <p className="chart-note">Faixa mais clara: horário comercial, das 9h às 18h.</p>
    </div>
  );
}
