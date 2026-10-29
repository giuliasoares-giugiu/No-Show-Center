import { useMemo, useState } from 'react';
import type { OccurrenceFilters, FilterOption } from '../types';
import { Icon } from './Icons';

interface Props {
  filters: OccurrenceFilters;
  options: FilterOption[];
  mode: 'queue' | 'insights' | 'treatments' | 'recurrence' | 'indicators';
  onChange: (filters: OccurrenceFilters) => void;
  onRange: (days: 1 | 7 | 30) => void;
}

export default function FilterBar({ filters, options, mode, onChange, onRange }: Props) {
  const [stationSearch, setStationSearch] = useState('');
  const regionals = useMemo(() => [...new Set(options.map((item) => item.regional))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [options]);
  const availableStations = useMemo(
    () => options.filter((item) => (!filters.regional || item.regional === filters.regional) && item.station_code.toLowerCase().includes(stationSearch.toLowerCase())),
    [filters.regional, options, stationSearch],
  );
  const stationLabel = filters.stations.length === 0 ? 'Todas as stations' : `${filters.stations.length} station${filters.stations.length === 1 ? '' : 's'}`;

  function toggleStation(code: string) {
    const next = filters.stations.includes(code) ? filters.stations.filter((station) => station !== code) : [...filters.stations, code];
    onChange({ ...filters, stations: next, page: 1 });
  }

  return (
    <section className={`filter-panel filter-panel-${mode}`} aria-label="Filtros do recorte">
      <div className="filter-panel-top"><div className="filter-title"><Icon name="filter" size={16} /><strong>Refinar recorte</strong></div><span>Os filtros ficam salvos na URL</span></div>
      <div className="filter-controls">
        <div className="filter-field period-field">
          <label htmlFor="date-from">{mode === 'treatments' ? 'Tratadas entre' : 'Período'}</label>
          <div className="date-range-inputs"><input id="date-from" type="date" value={filters.date_from} aria-label="Data inicial" onChange={(event) => onChange({ ...filters, date_from: event.target.value, page: 1 })} /><span>até</span><input type="date" value={filters.date_to} aria-label="Data final" onChange={(event) => onChange({ ...filters, date_to: event.target.value, page: 1 })} /></div>
          <div className="range-shortcuts" aria-label="Atalhos de período"><button type="button" className="range-chip" onClick={() => onRange(1)}>Hoje</button><button type="button" className="range-chip" onClick={() => onRange(7)}>7 dias</button><button type="button" className="range-chip" onClick={() => onRange(30)}>30 dias</button></div>
        </div>
        <div className="filter-field"><label htmlFor="regional">Regional</label><select id="regional" value={filters.regional} onChange={(event) => onChange({ ...filters, regional: event.target.value, stations: [], page: 1 })}><option value="">Todas as regionais</option>{regionals.map((regional) => <option key={regional} value={regional}>{regional}</option>)}</select></div>
        <div className="filter-field station-field"><label>Stations</label><details className="station-picker"><summary aria-label={`Selecionar stations, ${stationLabel}`}><Icon name="map-pin" size={15} /><span>{stationLabel}</span><Icon name="chevron-down" size={14} /></summary><div className="station-popover"><label className="station-search"><Icon name="search" size={14} /><input value={stationSearch} onChange={(event) => setStationSearch(event.target.value)} placeholder="Buscar station" aria-label="Buscar station" /></label><div className="station-options">{availableStations.map((option) => <label key={option.station_code} className="station-check"><input type="checkbox" checked={filters.stations.includes(option.station_code)} onChange={() => toggleStation(option.station_code)} /><span>{option.station_code}</span><small>{option.regional}</small></label>)}{availableStations.length === 0 && <p className="station-empty">Nenhuma station encontrada.</p>}</div><button type="button" className="clear-stations" onClick={() => { onChange({ ...filters, stations: [], page: 1 }); setStationSearch(''); }}>Limpar seleção</button></div></details></div>
        {mode === 'queue' && <>
          <div className="filter-field"><label htmlFor="treated">Estado</label><select id="treated" value={filters.treated} onChange={(event) => onChange({ ...filters, treated: event.target.value as OccurrenceFilters['treated'], page: 1 })}><option value="">Todas</option><option value="false">Pendentes</option><option value="true">Tratadas</option></select></div>
          <div className="filter-field search-field"><label htmlFor="search">Buscar</label><span className="search-input-wrap"><Icon name="search" size={16} /><input id="search" type="search" placeholder="Seller, station, motorista ou ID" value={filters.search} onChange={(event) => onChange({ ...filters, search: event.target.value, page: 1 })} /></span></div>
          <div className="filter-field ordering-field"><label htmlFor="ordering">Ordenar por</label><select id="ordering" value={filters.ordering} onChange={(event) => onChange({ ...filters, ordering: event.target.value as OccurrenceFilters['ordering'], page: 1 })}><option value="-date">Mais recentes</option><option value="-packages">Mais pacotes</option><option value="-recurrence">Mais recorrentes</option></select></div>
        </>}
      </div>
    </section>
  );
}
