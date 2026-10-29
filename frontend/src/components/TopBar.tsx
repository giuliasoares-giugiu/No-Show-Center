import type { View } from "../hooks/useView";
import type { Me } from "../types";

interface Props {
  me: Me;
  view: View;
  onView: (v: View) => void;
  onLogout: () => void;
}

export default function TopBar({ me, view, onView, onLogout }: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
          <circle cx="11" cy="13" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="21" cy="7" r="3.2" fill="var(--spx)" />
        </svg>
        <span>No-show center</span>
      </div>
      <nav aria-label="Visões">
        <button type="button" aria-current={view === "fila"} onClick={() => onView("fila")}>Fila</button>
        <button type="button" aria-current={view === "insights"} onClick={() => onView("insights")}>Insights</button>
      </nav>
      <div className="who">
        <span title={me.email}>{me.email}</span>
        <button type="button" onClick={onLogout}>Sair</button>
      </div>
    </header>
  );
}
