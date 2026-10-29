import type { FilterOption, OccurrenceFilters } from "../types";
import StationMultiSelect from "./StationMultiSelect";

interface Props {
  filters: OccurrenceFilters;
  searchInput: string;
  options: FilterOption[];
  onSearchInput: (v: string) => void;
  onChange: (patch: Partial<OccurrenceFilters>) => void;
}

export default function Filters({ filters, searchInput, options, onSearchInput, onChange }: Props) {
  const regionals = [...new Set(options.map((o) => o.regional))];
  const stations = options
    .filter((o) => !filters.regional || o.regional === filters.regional)
    .map((o) => o.station_code);

  return (
    <div className="filters">
      <label>
        <span>Regional:</span>
        <select
          className="control"
          value={filters.regional}
          onChange={(e) => onChange({ regional: e.target.value, stations: [] })}
        >
          <option value="">Todas as Regionais</option>
          {regionals.map((r) => <option key={r}>{r}</option>)}
        </select>
      </label>
      <div className="field">
        <span>Station / Hub:</span>
        <StationMultiSelect stations={stations} selected={filters.stations} onChange={(s) => onChange({ stations: s })} />
      </div>
      <label>
        <span>Tratativa:</span>
        <select
          className="control"
          value={filters.treated}
          onChange={(e) => onChange({ treated: e.target.value as OccurrenceFilters["treated"] })}
        >
          <option value="">Todas</option>
          <option value="false">Pendentes</option>
          <option value="true">Tratadas</option>
        </select>
      </label>
      <label>
        <span>De:</span>
        <input className="control" type="date" value={filters.date_from} max={filters.date_to || undefined}
          onChange={(e) => onChange({ date_from: e.target.value })} />
      </label>
      <label>
        <span>Até:</span>
        <input className="control" type="date" value={filters.date_to} min={filters.date_from || undefined}
          onChange={(e) => onChange({ date_to: e.target.value })} />
      </label>
      <label>
        <span>Buscar:</span>
        <input className="control" type="search" placeholder="Motorista, seller ou ID…" value={searchInput}
          onChange={(e) => onSearchInput(e.target.value)} />
      </label>
    </div>
  );
}
