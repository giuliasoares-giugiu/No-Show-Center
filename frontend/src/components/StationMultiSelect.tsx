import { useEffect, useRef, useState } from "react";

interface Props {
  stations: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}

export default function StationMultiSelect({ stations, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const label =
    selected.length === 0 ? "Todas as Stations" : selected.length === 1 ? selected[0] : `${selected.length} stations`;

  const toggle = (code: string) =>
    onChange(selected.includes(code) ? selected.filter((s) => s !== code) : [...selected, code]);

  return (
    <div className="multi" ref={ref}>
      <button type="button" className="control" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        {label} <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="multi-panel" role="listbox" aria-multiselectable>
          <button type="button" className="multi-clear" onClick={() => onChange([])}>Limpar seleção</button>
          {stations.map((code) => (
            <label key={code} className="multi-item">
              <input type="checkbox" checked={selected.includes(code)} onChange={() => toggle(code)} />
              {code}
            </label>
          ))}
          {stations.length === 0 && <p className="multi-empty">Nenhuma station disponível.</p>}
        </div>
      )}
    </div>
  );
}
