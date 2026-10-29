import { useEffect, useState } from "react";
import { num, percent, periodLabel } from "../../format";
import { api } from "../../services/api";
import type { Insights, OccurrenceFilters, Queue } from "../../types";
import { BarList, HourStrip, StackedBar, TrendChart } from "./charts";
import { buildReadings } from "./readings";

interface Props {
  queues: Queue[];
  filters: OccurrenceFilters;
  onDrill: (patch: Partial<OccurrenceFilters>) => void;
}

export default function InsightsView({ queues, filters, onDrill }: Props) {
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [repeatTab, setRepeatTab] = useState<"sellers" | "drivers">("sellers");

  useEffect(() => {
    if (!filters.queue) return;
    let ignore = false;
    setLoading(true);
    setError("");
    // Insights olham o conjunto todo: estado e busca da fila não se aplicam aqui.
    api.insights({ ...filters, treated: "", search: "", page: 1 })
      .then((d) => !ignore && setData(d))
      .catch((e) => !ignore && setError(e instanceof Error ? e.message : "Erro ao carregar os insights."))
      .finally(() => !ignore && setLoading(false));
    return () => { ignore = true; };
  }, [filters.queue, filters.regional, filters.stations, filters.date_from, filters.date_to]); // eslint-disable-line react-hooks/exhaustive-deps

  const queueName = queues.find((q) => q.slug === filters.queue)?.name ?? "";
  const scope = [
    periodLabel(filters.date_from, filters.date_to),
    filters.stations.length ? filters.stations.join(", ") : filters.regional || "todo o Brasil",
  ].join(", ");

  if (error) return <p className="error banner" role="alert">{error}</p>;
  if (!data) return <p className="status-line">{loading ? "Calculando insights…" : "Sem dados."}</p>;

  const { kpis } = data;
  if (kpis.total === 0) {
    return <p className="empty">Nenhuma ocorrência de {queueName} em {scope}. Amplie o período ou escolha outras stations.</p>;
  }
  const readings = buildReadings(data);
  const treatedRate = kpis.total ? kpis.treated / kpis.total : 0;

  return (
    <div className={`insights${loading ? " is-loading" : ""}`}>
      <header className="insights-head">
        <h1>{queueName}</h1>
        <p className="muted">{scope}</p>
      </header>

      <section className="readings" aria-label="Leituras">
        {readings.map((r, i) => (
          <article key={i} className="reading">
            <strong className="reading-value">{r.value}</strong>
            <div>
              <h2>{r.headline}</h2>
              <p>{r.detail}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="strip" aria-label="Números do período">
        <Metric value={num(kpis.total)} label="Ocorrências" note="no período" />
        <Metric value={num(kpis.pending)} label="Pendentes" note={`${num(kpis.packages_pending)} pacotes parados`} />
        <Metric value={percent(treatedRate)} label="Já tratadas" note={`${num(kpis.treated)} de ${num(kpis.total)}`} />
        <Metric value={kpis.avg_hours_to_treat != null ? `${String(kpis.avg_hours_to_treat).replace(".", ",")} h` : "—"}
          label="Tempo até tratar" note="média da ocorrência à tratativa" />
        <Metric value={kpis.reversal_rate != null ? percent(kpis.reversal_rate) : "—"} label="Revertidas"
          note="das tratadas, coleta ou batida ajustada" />
      </section>

      <div className="grid">
        <Block title="Evolução diária" subtitle="Quantas ocorrências por dia e quanto disso já foi tratado" span={8}>
          <TrendChart data={data.daily} />
        </Block>

        <Block title="Idade das pendências" subtitle="Há quanto tempo cada pendente espera" span={4}>
          <BarList empty="Nenhuma pendência." items={[
            { label: "Hoje", value: data.aging.d0, color: "var(--tinta-clara)" },
            { label: "1 a 2 dias", value: data.aging.d1_2, color: "var(--tinta-media)" },
            { label: "3 a 6 dias", value: data.aging.d3_6, color: "var(--alerta)" },
            { label: "7 dias ou mais", value: data.aging.d7p, color: "var(--spx)" },
          ]} />
        </Block>

        <Block title="Por que o sistema acusou" subtitle="O sinal que disparou a ocorrência" span={6}>
          <StackedBar segments={[
            { label: "Só fora do raio", value: data.cause.raio_only, color: "var(--raio)", hint: "Check-in longe do endereço" },
            { label: "Só fora do horário", value: data.cause.horario_only, color: "var(--alerta)", hint: "Ponto fechado na chegada" },
            { label: "Os dois", value: data.cause.both, color: "var(--spx)", hint: "Provavelmente nem chegou ao endereço" },
            { label: "Outros", value: data.cause.other, color: "var(--tinta-clara)", hint: "Sem sinal de raio ou horário" },
          ]} />
        </Block>

        <Block title="Quando acontece" subtitle="Ocorrências por hora do dia" span={6}>
          <HourStrip hours={data.by_hour} />
        </Block>

        <Block title="Resultado das tratativas" subtitle="O que aconteceu depois de ouvir o motorista" span={6}>
          <BarList empty="Ainda não há tratativas neste recorte." items={data.reversal.map((r) => ({
            label: r.label, value: r.count, color: r.reversed ? "var(--coleta)" : "var(--tinta-media)",
          }))} />
        </Block>

        <Block title="Justificativas" subtitle="O que explica as ocorrências tratadas" span={6}>
          <BarList empty="Ainda não há tratativas neste recorte."
            items={data.justifications.map((j) => ({ label: j.label, value: j.count }))} />
        </Block>

        <Block title="Stations" subtitle="Clique para abrir a fila da station" span={7}>
          <div className="table-scroll">
            <table className="rank">
              <thead>
                <tr><th>Station</th><th>Regional</th><th>Pendentes</th><th>Tratadas</th><th>Pacotes parados</th></tr>
              </thead>
              <tbody>
                {data.stations.map((s) => {
                  const max = Math.max(...data.stations.map((x) => x.pending), 1);
                  return (
                    <tr key={s.station_code}>
                      <td><button type="button" className="link" onClick={() => onDrill({ stations: [s.station_code], regional: "", treated: "false" })}>{s.station_code}</button></td>
                      <td>{s.regional}</td>
                      <td>
                        <span className="inline-bar"><i style={{ width: `${(s.pending / max) * 100}%` }} /></span>
                        <span className="tabular">{num(s.pending)}</span>
                      </td>
                      <td className="tabular">{percent(s.total ? s.treated / s.total : 0)}</td>
                      <td className="tabular">{num(s.packages_pending)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Block>

        <Block title="Reincidência" subtitle="Quem aparece em mais de um dia no período" span={5}>
          <div className="segmented" role="group" aria-label="Reincidência por">
            <button type="button" aria-pressed={repeatTab === "sellers"} onClick={() => setRepeatTab("sellers")}>Sellers</button>
            <button type="button" aria-pressed={repeatTab === "drivers"} onClick={() => setRepeatTab("drivers")}>Motoristas</button>
          </div>
          <div className="table-scroll">
            <table className="rank">
              <thead>
                <tr><th>{repeatTab === "sellers" ? "Seller" : "Motorista"}</th><th>Dias</th><th>Ocorrências</th><th>Pendentes</th></tr>
              </thead>
              <tbody>
                {repeatTab === "sellers"
                  ? data.repeat_sellers.map((s) => (
                    <tr key={s.shop_id}>
                      <td><button type="button" className="link" onClick={() => onDrill({ search: String(s.shop_id), treated: "", stations: [], regional: "" })}>{s.name}</button></td>
                      <td className="tabular">{s.days}</td><td className="tabular">{s.occurrences}</td><td className="tabular">{s.pending}</td>
                    </tr>))
                  : data.repeat_drivers.map((s) => (
                    <tr key={s.driver_id}>
                      <td>
                        <button type="button" className="link" onClick={() => onDrill({ search: String(s.driver_id), treated: "", stations: [], regional: "" })}>{s.name}</button>
                        <small className="muted"> {s.station_code}</small>
                      </td>
                      <td className="tabular">{s.days}</td><td className="tabular">{s.occurrences}</td><td className="tabular">{s.pending}</td>
                    </tr>))}
                {(repeatTab === "sellers" ? data.repeat_sellers : data.repeat_drivers).length === 0 && (
                  <tr><td colSpan={4} className="muted">Ninguém reincidiu neste recorte.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Block>
      </div>
    </div>
  );
}

function Block({ title, subtitle, span, children }: { title: string; subtitle: string; span: number; children: React.ReactNode }) {
  return (
    <section className={`block span-${span}`}>
      <h2>{title}</h2>
      <p className="muted">{subtitle}</p>
      {children}
    </section>
  );
}

function Metric({ value, label, note }: { value: string; label: string; note: string }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span className="metric-label">{label}</span>
      <span className="metric-note">{note}</span>
    </div>
  );
}
