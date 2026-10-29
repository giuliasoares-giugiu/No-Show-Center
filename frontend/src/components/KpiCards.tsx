import type { Summary } from "../types";

export default function KpiCards({ summary }: { summary: Summary | null }) {
  const v = (n?: number) => (summary ? n : "—");
  return (
    <div className="kpis">
      <div className="kpi kpi-total">
        <span>Total filtrado</span>
        <strong>{v(summary?.total)}</strong>
      </div>
      <div className="kpi kpi-done">
        <span>Tratativas salvas</span>
        <strong>{v(summary?.treated)}</strong>
      </div>
      <div className="kpi kpi-pending">
        <span>Pendentes de ação</span>
        <strong>{v(summary?.pending)}</strong>
      </div>
    </div>
  );
}
