import { num, percent, plural } from "../../format";
import type { Insights } from "../../types";

export interface Reading {
  value: string;
  headline: string;
  detail: string;
}

const CAUSES = {
  raio_only: {
    label: "só fora do raio",
    detail: "O check-in aconteceu longe do endereço cadastrado. Vale conferir lat/long e acesso do local (portaria, galpão).",
  },
  horario_only: {
    label: "só fora do horário de funcionamento",
    detail: "O motorista chegou com o ponto fechado. Vale rever o horário em que a rota passa nesses sellers.",
  },
  both: {
    label: "fora do raio e fora do horário",
    detail: "Os dois sinais juntos costumam indicar que o motorista nem chegou ao endereço.",
  },
} as const;

/** Frases curtas que dizem o que olhar primeiro. Só entram leituras que os números sustentam. */
export function buildReadings(d: Insights): Reading[] {
  const out: Reading[] = [];
  const { kpis } = d;

  const topStation = d.stations[0];
  if (topStation && kpis.pending > 0 && topStation.pending > 0) {
    out.push({
      value: percent(topStation.pending / kpis.pending),
      headline: `das pendências estão em ${topStation.station_code.replace(/-/g, "\u2011")}`,
      detail: `${num(topStation.pending)} de ${num(kpis.pending)} pendentes, com ${num(topStation.packages_pending)} pacotes parados (${topStation.regional}).`,
    });
  }

  const old = d.aging.d3_6 + d.aging.d7p;
  out.push(old > 0
    ? {
        value: num(old),
        headline: `${plural(old, "pendência", "pendências")} com mais de 3 dias`,
        detail: d.aging.d7p > 0
          ? `${num(d.aging.d7p)} ${plural(d.aging.d7p, "passa", "passam")} de 7 dias. Quanto mais velha, menos o motorista lembra do que houve.`
          : "Ainda dá tempo de ouvir o motorista antes de passar de uma semana.",
      }
    : { value: "0", headline: "pendências com mais de 3 dias", detail: "Nenhuma ocorrência está envelhecendo na fila neste recorte." });

  const causeEntries = (Object.keys(CAUSES) as (keyof typeof CAUSES)[]).map((k) => ({ k, v: d.cause[k] }));
  const causeTotal = causeEntries.reduce((s, c) => s + c.v, 0);
  const topCause = [...causeEntries].sort((a, b) => b.v - a.v)[0];
  if (causeTotal > 0 && topCause.v > 0) {
    out.push({
      value: percent(topCause.v / causeTotal),
      headline: `das ocorrências são ${CAUSES[topCause.k].label}`,
      detail: CAUSES[topCause.k].detail,
    });
  }

  const repeat = d.repeat_sellers.filter((s) => s.days >= 3);
  if (d.repeat_sellers[0]) {
    const top = d.repeat_sellers[0];
    out.push({
      value: num(repeat.length || d.repeat_sellers.length),
      headline: repeat.length
        ? `${plural(repeat.length, "seller reincidiu", "sellers reincidiram")} em 3 dias ou mais`
        : `${plural(d.repeat_sellers.length, "seller reincidiu", "sellers reincidiram")} em mais de um dia`,
      detail: `${top.name} lidera, com ocorrências em ${top.days} dias e ${num(top.pending)} ainda pendentes.`,
    });
  }
  return out.slice(0, 4);
}
