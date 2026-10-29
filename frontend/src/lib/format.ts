import type { OccurrenceFilters, Ordering } from '../types';

const saoPaulo = 'America/Sao_Paulo';

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);
}

export function formatHours(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)} h`;
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 }).format(value);
}

export function formatDateTime(value: string | null, options: 'short' | 'long' = 'short'): string {
  if (!value) return 'Horário não informado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Horário não informado';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: saoPaulo,
    day: '2-digit',
    month: options === 'long' ? 'long' : 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDate(value: string): string {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00-03:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('pt-BR', { timeZone: saoPaulo, day: '2-digit', month: 'short' }).format(date);
}

export function timeInSaoPaulo(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: saoPaulo, hour: '2-digit', minute: '2-digit' }).format(date);
}

export function hourInSaoPaulo(value: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const hour = new Intl.DateTimeFormat('en-US', { timeZone: saoPaulo, hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(date)
    .find((part) => part.type === 'hour')?.value;
  return hour === undefined ? null : Number(hour);
}

export function todayInSaoPaulo(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: saoPaulo,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function dateRange(days: 1 | 7 | 30): Pick<OccurrenceFilters, 'date_from' | 'date_to'> {
  const end = new Date(`${todayInSaoPaulo()}T12:00:00-03:00`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return {
    date_from: start.toISOString().slice(0, 10),
    date_to: todayInSaoPaulo(),
  };
}

export function filtersFromUrl(search: string, queueFallback = 'nss-spx-fault'): OccurrenceFilters {
  const params = new URLSearchParams(search);
  const treated = params.get('treated');
  const ordering = params.get('ordering');
  const defaultRange = dateRange(7);
  const stations = (params.get('station_code') ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  return {
    queue: params.get('queue') || queueFallback,
    regional: params.get('regional') ?? '',
    stations,
    // Sem parâmetro = Pendentes (a fila de trabalho); 'all' = todas.
    treated: treated === 'true' ? 'true' : treated === 'all' ? '' : 'false',
    search: params.get('search') ?? '',
    date_from: params.get('date_from') ?? defaultRange.date_from,
    date_to: params.get('date_to') ?? defaultRange.date_to,
    page: Math.max(1, Number(params.get('page') || 1)),
    ordering: ordering === '-packages' || ordering === '-recurrence' ? ordering as Ordering : '-date',
  };
}

export function filtersToSearch(filters: OccurrenceFilters): string {
  const params = new URLSearchParams();
  if (filters.queue) params.set('queue', filters.queue);
  if (filters.regional) params.set('regional', filters.regional);
  if (filters.stations.length) params.set('station_code', filters.stations.join(','));
  if (filters.treated !== 'false') params.set('treated', filters.treated === '' ? 'all' : filters.treated);
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.date_from) params.set('date_from', filters.date_from);
  if (filters.date_to) params.set('date_to', filters.date_to);
  if (filters.ordering !== '-date') params.set('ordering', filters.ordering);
  if (filters.page > 1) params.set('page', String(filters.page));
  return params.toString();
}

export function occurrenceState(occurrence: { treatment: unknown; contact_count: number }): 'done' | 'contacted' | 'new' {
  if (occurrence.treatment !== null) return 'done';
  return occurrence.contact_count > 0 ? 'contacted' : 'new';
}

/** "2026-10-15T17:21:00-03:00" → "15/10 17:21" (America/Sao_Paulo). */
export function formatStamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: saoPaulo, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date).replace(',', '');
}

/** "2026-10-15" → "15/10" */
export function formatDayMonth(value: string): string {
  const [, month, day] = value.split('-');
  return day && month ? `${day}/${month}` : value;
}

/** Quantidade de dias do recorte (inclusive). Sem datas = recorte aberto. */
export function rangeLength(from: string, to: string): number {
  if (!from || !to) return Number.POSITIVE_INFINITY;
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
}

/** 1.7 → "1,7" (uma casa, vírgula decimal). */
export function formatDecimal(value: number | null): string {
  return value === null ? '—' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value);
}
