import { useEffect, useRef, useState } from "react";

interface Props {
  stations: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}

export default function StationPicker({ stations, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, []);

  const label = selected.length === 0 ? "Todas" : selected.length === 1 ? selected[0] : `${selected.length} selecionadas`;
  const toggle = (code: string) =>
    onChange(selected.includes(code) ? selected.filter((s) => s !== code) : [...selected, code]);

  return (
    <div className="picker" ref={ref}>
      <button type="button" className="control picker-button" aria-haspopup="true" aria-expanded={open}
        onClick={() => setOpen(!open)}>
        <span>{label}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      {open && (
        <div className="picker-panel">
          {selected.length > 0 && <button type="button" className="link" onClick={() => onChange([])}>Limpar seleção</button>}
          {stations.map((code) => (
            <label key={code} className="check">
              <input type="checkbox" checked={selected.includes(code)} onChange={() => toggle(code)} />
              {code}
            </label>
          ))}
          {stations.length === 0 && <p className="muted">Nenhuma station com ocorrências.</p>}
        </div>
      )}
    </div>
  );
}
