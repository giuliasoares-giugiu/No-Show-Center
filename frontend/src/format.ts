import type { Occurrence } from "./types";

const TZ = "America/Sao_Paulo";
const nf = new Intl.NumberFormat("pt-BR");

export const num = (v: number) => nf.format(v);
export const percent = (v: number) => `${Math.round(v * 100)}%`;
export const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

export function todayISO(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString("en-CA", { timeZone: TZ });
}

export function timeLabel(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

export function dateTimeLabel(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ,
  });
}

/** "2026-10-15" → "15/10" */
export function dayLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function periodLabel(from: string, to: string): string {
  if (!from && !to) return "todo o período";
  if (from === to) return dayLabel(from);
  return `${from ? dayLabel(from) : "início"} a ${to ? dayLabel(to) : "hoje"}`;
}

/** Minutos desde 00:00 (horário de Brasília) de um instante ISO. */
export function minutesOfDay(iso: string | null): number | null {
  if (!iso) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ })
    .formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  return Number.isFinite(h) && Number.isFinite(m) ? (h % 24) * 60 + m : null;
}

export function clockToMinutes(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(v ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export type OccState = "new" | "contacted" | "done";

export const stateOf = (o: Occurrence): OccState => (o.treatment ? "done" : o.contact_count > 0 ? "contacted" : "new");

export const STATE_LABEL: Record<OccState, string> = {
  new: "Sem contato",
  contacted: "Motorista acionado",
  done: "Tratada",
};

export function verdict(o: Occurrence): string {
  const outRadius = o.raio === "Fora do raio";
  const outHours = o.horario_funcionamento.startsWith("Fora");
  if (outRadius && outHours) return "Fora do raio e fora do horário";
  if (outRadius) return "Fora do raio, dentro do horário";
  if (outHours) return "Dentro do raio, fora do horário";
  return "Dentro do raio e do horário";
}
