import type {
  DispatcherOrder,
  DispatcherRow,
  DriverOrder,
  DriverRow,
  IndicatorList,
  IndicatorsOverview,
  ContactEntry,
  ContactMember,
  ContactResult,
  FilterOption,
  Insights,
  Kpis,
  Me,
  Occurrence,
  OccurrenceFilters,
  Page,
  Queue,
  RecurrenceEntity,
  RecurrenceOrder,
  RecurrenceResult,
  Treatment,
  TreatmentFilters,
  TreatmentLogRow,
  TreatmentPayload,
  TreatmentSummary,
} from '../types';

import { mockApi } from './mock';

export interface ApiClient {
  me(): Promise<Me>;
  loginGoogle(credential: string): Promise<Me>;
  logout(): Promise<void>;
  queues(): Promise<Queue[]>;
  filterOptions(): Promise<FilterOption[]>;
  occurrences(filters: OccurrenceFilters): Promise<Page<Occurrence>>;
  summary(filters: OccurrenceFilters): Promise<Kpis>;
  insights(filters: OccurrenceFilters): Promise<Insights>;
  history(id: number): Promise<ContactEntry[]>;
  saveTreatment(id: number, body: TreatmentPayload): Promise<Treatment>;
  contactOptions(id: number): Promise<ContactMember[]>;
  contact(id: number, memberId: number): Promise<ContactResult>;
  treatments(filters: TreatmentFilters): Promise<Page<TreatmentLogRow>>;
  treatmentSummary(filters: TreatmentFilters): Promise<TreatmentSummary>;
  exportTreatments(filters: TreatmentFilters): Promise<void>;
  recurrence(
    entity: RecurrenceEntity,
    filters: OccurrenceFilters,
    options: { minDays: number; order: RecurrenceOrder; limit?: number },
  ): Promise<RecurrenceResult>;
  indicatorsOverview(filters: OccurrenceFilters): Promise<IndicatorsOverview>;
  indicatorDispatchers(filters: OccurrenceFilters, order: DispatcherOrder): Promise<IndicatorList<DispatcherRow>>;
  indicatorDrivers(filters: OccurrenceFilters, order: DriverOrder): Promise<IndicatorList<DriverRow>>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function csrfToken(): string {
  const token = document.cookie
    .split('; ')
    .find((part) => part.startsWith('csrftoken='))
    ?.slice('csrftoken='.length);
  return token ? decodeURIComponent(token) : '';
}

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const body = payload as Record<string, unknown>;
    if (typeof body.detail === 'string') return body.detail;
    const firstField = Object.values(body).find((value) => Array.isArray(value) && value.length > 0);
    if (Array.isArray(firstField) && typeof firstField[0] === 'string') return firstField[0];
  }
  return fallback;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? 'GET').toUpperCase();
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (method === 'POST' || method === 'PUT') {
    headers.set('X-CSRFToken', csrfToken());
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      method,
      headers,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError('Não foi possível conectar à API. Verifique a conexão e tente novamente.', 0, null);
  }

  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') ?? '';
  const payload: unknown = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');
  if (!response.ok) {
    throw new ApiError(errorMessage(payload, `A solicitação falhou (${response.status}).`), response.status, payload);
  }
  return payload as T;
}

function query(filters: OccurrenceFilters, includeWorkFilters: boolean): string {
  const params = new URLSearchParams();
  if (filters.queue) params.set('queue', filters.queue);
  if (filters.regional) params.set('regional', filters.regional);
  if (filters.stations.length) params.set('station_code', filters.stations.join(','));
  if (filters.date_from) params.set('date_from', filters.date_from);
  if (filters.date_to) params.set('date_to', filters.date_to);
  if (filters.shop_id !== undefined) params.set('shop_id', String(filters.shop_id));
  if (filters.driver_id !== undefined) params.set('driver_id', String(filters.driver_id));
  if (filters.route) params.set('route', filters.route);

  if (includeWorkFilters) {
    if (filters.treated) params.set('treated', filters.treated);
    if (filters.search.trim()) params.set('search', filters.search.trim());
    params.set('ordering', filters.ordering);
    params.set('page', String(filters.page));
  }
  return params.toString();
}

function treatmentQuery(filters: TreatmentFilters, list: boolean): string {
  const params = new URLSearchParams();
  if (filters.queue) params.set('queue', filters.queue);
  if (filters.regional) params.set('regional', filters.regional);
  if (filters.stations.length) params.set('station_code', filters.stations.join(','));
  if (filters.date_from) params.set('date_from', filters.date_from);
  if (filters.date_to) params.set('date_to', filters.date_to);
  if (filters.reversed) params.set('reversed', filters.reversed);
  if (filters.justification) params.set('justification', filters.justification);
  if (filters.treated_by) params.set('treated_by', filters.treated_by);
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (list) {
    params.set('ordering', filters.ordering);
    params.set('page', String(filters.page));
  }
  return params.toString();
}

async function downloadCsv(path: string, fallbackName: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { credentials: 'same-origin' });
  } catch {
    throw new ApiError('Não foi possível conectar à API. Verifique a conexão e tente novamente.', 0, null);
  }
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw new ApiError(errorMessage(payload, `A exportação falhou (${response.status}).`), response.status, payload);
  }
  const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function withQuery(path: string, params: string): string {
  return params ? `${path}?${params}` : path;
}

const realApi: ApiClient = {
  me: () => request<Me>('/me/'),
  loginGoogle: (credential) =>
    request<Me>('/auth/google/', { method: 'POST', body: JSON.stringify({ credential }) }),
  logout: () => request<void>('/auth/logout/', { method: 'POST' }),
  queues: () => request<Queue[]>('/queues/'),
  filterOptions: () => request<FilterOption[]>('/occurrences/filter-options/'),
  occurrences: (filters) =>
    request<Page<Occurrence>>(withQuery('/occurrences/', query(filters, true))),
  summary: (filters) =>
    request<Kpis>(withQuery('/occurrences/summary/', query(filters, false))),
  insights: (filters) =>
    request<Insights>(withQuery('/occurrences/insights/', query(filters, false))),
  history: (id) => request<ContactEntry[]>(`/occurrences/${id}/history/`),
  saveTreatment: (id, body) =>
    request<Treatment>(`/occurrences/${id}/treatment/`, { method: 'PUT', body: JSON.stringify(body) }),
  contactOptions: (id) => request<ContactMember[]>(`/occurrences/${id}/contact-options/`),
  contact: (id, memberId) =>
    request<ContactResult>(`/occurrences/${id}/contact/`, {
      method: 'POST',
      body: JSON.stringify({ member_id: memberId }),
    }),
  treatments: (filters) => request<Page<TreatmentLogRow>>(withQuery('/treatments/', treatmentQuery(filters, true))),
  treatmentSummary: (filters) =>
    request<TreatmentSummary>(withQuery('/treatments/summary/', treatmentQuery(filters, false))),
  exportTreatments: (filters) =>
    downloadCsv(withQuery('/treatments/export/', treatmentQuery(filters, false)), 'tratativas.csv'),
  recurrence: (entity, filters, options) => {
    const params = new URLSearchParams(query(filters, false));
    params.set('entity', entity);
    params.set('min_days', String(options.minDays));
    params.set('order', options.order);
    params.set('limit', String(options.limit ?? 50));
    return request<RecurrenceResult>(withQuery('/occurrences/recurrence/', params.toString()));
  },
  indicatorsOverview: (filters) => request<IndicatorsOverview>(withQuery('/indicators/overview/', query(filters, false))),
  indicatorDispatchers: (filters, order) => {
    const params = new URLSearchParams(query(filters, false));
    params.set('order', order);
    return request<IndicatorList<DispatcherRow>>(withQuery('/indicators/dispatchers/', params.toString()));
  },
  indicatorDrivers: (filters, order) => {
    const params = new URLSearchParams(query(filters, false));
    params.set('order', order);
    return request<IndicatorList<DriverRow>>(withQuery('/indicators/drivers/', params.toString()));
  },
};

export const api: ApiClient = import.meta.env.VITE_SKIP_LOGIN === 'true' ? mockApi : realApi;
