export interface Me {
  email: string;
  is_admin: boolean;
  stations: string[];
  regionals: string[];
}

export interface Option {
  id: number;
  label: string;
  requires_text: boolean;
}

export interface Queue {
  slug: string;
  name: string;
  reversal_options: Option[];
  justification_options: Option[];
}

export interface Treatment {
  reversal: number;
  reversal_label: string;
  justification: number;
  justification_label: string;
  justification_text: string;
  treated_by: string;
  updated_at: string;
}

export interface Occurrence {
  id: number;
  pickup_task_id: string;
  occurrence_date: string;
  occurred_at: string | null;
  seller_performance: string;
  driver_justification: string;
  fault_type: string;
  shop_id: string;
  seller_name: string;
  station_code: string;
  regional: string;
  driver_id: number | null;
  driver_name: string;
  driver_phone: string;
  route_name: string;
  allocated_by: string;
  pickup_point_id: string;
  /** Prefixo do PUP antes do "_": "1234", "1234_001" e "1234_002" são o grupo "1234". */
  seller_group: string;
  /** Responsável pelo motorista (planilha OF TEAM), em minúsculas; vazio quando a tabela não traz. */
  dispatcher_email: string;
  supervisor_email: string;
  /** NOME do gerente da regional (não é e-mail). */
  regional_manager: string;
  onhold_order_count: number;
  raio: string;
  radius_diff: number | null;
  horario_funcionamento: string;
  open_hour: string;
  close_hour: string;
  queue: string | null;
  recurrence_days: number;
  contact_count: number;
  last_contact_at: string | null;
  last_contact_by: string | null;
  treatment: Treatment | null;
  can_treat: boolean;
}

export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Kpis {
  total: number;
  treated: number;
  pending: number;
  no_contact: number;
  packages_pending: number;
  avg_hours_to_treat: number | null;
  reversal_rate: number | null;
}

export interface StationStat {
  station_code: string;
  regional: string;
  total: number;
  pending: number;
  treated: number;
  packages_pending: number;
}

export interface RepeatSeller {
  shop_id: string;
  name: string;
  days: number;
  occurrences: number;
  pending: number;
}

export interface RepeatDriver {
  driver_id: number;
  name: string;
  station_code: string;
  days: number;
  occurrences: number;
  pending: number;
}

export interface Insights {
  kpis: Kpis;
  daily: { date: string; total: number; treated: number }[];
  aging: { d0: number; d1_2: number; d3_6: number; d7p: number };
  cause: { raio_only: number; horario_only: number; both: number; other: number };
  reversal: { label: string; count: number; reversed: boolean }[];
  justifications: { label: string; count: number }[];
  stations: StationStat[];
  repeat_sellers: RepeatSeller[];
  repeat_drivers: RepeatDriver[];
  by_hour: number[];
}

export interface FilterOption {
  regional: string;
  station_code: string;
}

export interface ContactMember {
  id: number;
  name: string;
  phone_ok: boolean;
  is_me: boolean;
}

export interface ContactResult {
  attempt_id: number;
  message: string;
  whatsapp_url: string;
}

export interface ContactEntry {
  sent_by: string;
  member_name: string;
  sent_at: string;
}

export type Ordering = '-date' | '-packages' | '-recurrence';

export interface OccurrenceFilters {
  queue: string;
  regional: string;
  stations: string[];
  treated: '' | 'true' | 'false';
  search: string;
  date_from: string;
  date_to: string;
  page: number;
  ordering: Ordering;
  // Filtros exatos, usados só pelo painel de detalhe da recorrência (não vão para a URL).
  shop_id?: string;
  driver_id?: number;
  route?: string;
}

export interface TreatmentPayload {
  reversal: number;
  justification: number;
  justification_text: string;
}

export type RecurrenceEntity = 'seller' | 'driver' | 'route';
export type RecurrenceOrder = 'days' | 'occurrences' | 'pending' | 'packages';

export interface RecurrenceRow {
  entity: RecurrenceEntity;
  key: string;
  name: string;
  station_code: string;
  stations: number;
  /** seller: motoristas distintos; motorista: sellers distintos; rota: motoristas distintos. */
  related: number;
  days: number;
  occurrences: number;
  pending: number;
  treated: number;
  reversed: number;
  packages: number;
  first_date: string;
  last_date: string;
  out_radius: number;
  out_hours: number;
}

export interface RecurrenceResult {
  entity: RecurrenceEntity;
  count: number;
  results: RecurrenceRow[];
}

export interface TreatmentLogRow {
  id: number;
  treated_at: string;
  updated_at: string;
  treated_by: string;
  reversal_label: string;
  reversed: boolean;
  justification_label: string;
  justification_text: string;
  occurrence_id: number;
  pickup_task_id: string;
  occurrence_date: string;
  occurred_at: string | null;
  fault_type: string;
  seller_name: string;
  shop_id: string;
  station_code: string;
  regional: string;
  driver_id: number | null;
  driver_name: string;
  route_name: string;
  allocated_by: string;
  onhold_order_count: number;
  raio: string;
  horario_funcionamento: string;
  contact_count: number;
  hours_to_treat: number | null;
}

export interface TreatmentSummary {
  total: number;
  reversed: number;
  reversal_rate: number | null;
  avg_hours_to_treat: number | null;
  by_reversal: { id: number; label: string; count: number; reversed: boolean }[];
  by_justification: { id: number; label: string; count: number }[];
  by_user: { treated_by: string; count: number; reversed: number }[];
  by_day: { date: string; count: number }[];
}

export type TreatmentOrdering = '-treated_at' | '-packages';

/** Aqui date_from/date_to são a data da TRATATIVA (e não a da ocorrência). */
export interface TreatmentFilters {
  queue: string;
  regional: string;
  stations: string[];
  date_from: string;
  date_to: string;
  reversed: '' | 'true' | 'false';
  justification: string;
  treated_by: string;
  search: string;
  ordering: TreatmentOrdering;
  page: number;
}

export type DispatcherOrder = 'routes' | 'messages' | 'routes_reverted' | 'slowest';
export type DriverOrder = 'occurrences' | 'no_show_driver' | 'repeat_sellers' | 'reverted' | 'packages';

export interface IndicatorsOverview {
  occurrences: number;
  treated: number;
  pending: number;
  reverted: number;
  routes: number;
  routes_treated: number;
  routes_reverted: number;
  driver_no_show: number;
  seller_no_show: number;
  reversal_rate: number | null;
  treated_rate: number | null;
  messages: number;
  drivers_contacted: number;
  avg_hours_to_treat: number | null;
  attempts: {
    avg: number | null;
    reversed_treatments: number;
    distribution: { zero: number; one: number; two: number; three_plus: number };
  };
  training: { available: boolean };
}

export interface DispatcherRow {
  key: string;
  name: string;
  email: string | null;
  station_code: string;
  /** Alocou rotas com no-show (dado do DS). */
  has_routes: boolean;
  /** Acionou drivers ou tratou ocorrências aqui (login). */
  has_actions: boolean;
  occurrences: number;
  routes: number;
  routes_treated: number;
  routes_reverted: number;
  pending: number;
  messages: number;
  drivers_contacted: number;
  occurrences_contacted: number;
  treated_by_him: number;
  reverted_by_him: number;
  avg_hours_to_treat: number | null;
}

export interface DriverRow {
  driver_id: number;
  name: string;
  station_code: string;
  stations: number;
  days: number;
  occurrences: number;
  no_show_driver: number;
  no_show_seller: number;
  spx_fault: number;
  sellers: number;
  repeat_sellers: number;
  pending: number;
  treated: number;
  reverted: number;
  packages: number;
}

export interface IndicatorList<T> {
  count: number;
  results: T[];
}
