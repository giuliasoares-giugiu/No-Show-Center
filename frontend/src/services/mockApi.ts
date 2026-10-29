import type { ApiClient } from './api';
import type {
  DispatcherOrder,
  DispatcherRow,
  DriverOrder,
  DriverRow,
  IndicatorList,
  IndicatorsOverview,
  ContactEntry,
  ContactMember,
  FilterOption,
  Insights,
  Kpis,
  Occurrence,
  OccurrenceFilters,
  Page,
  Queue,
  RecurrenceEntity,
  RecurrenceOrder,
  RecurrenceResult,
  RecurrenceRow,
  Treatment,
  TreatmentFilters,
  TreatmentLogRow,
  TreatmentPayload,
  TreatmentSummary,
} from '../types';
import { hourInSaoPaulo } from '../lib/format';

const queueData: Queue[] = [
  {
    slug: 'nss-spx-fault',
    name: 'NSS SPX Fault',
    reversal_options: [
      { id: 1, label: 'Coletado', requires_text: false },
      { id: 2, label: 'Batida ajustada', requires_text: false },
      { id: 3, label: 'Não revertido', requires_text: false },
    ],
    justification_options: [
      { id: 4, label: 'Comportamento suspeito driver', requires_text: false },
      { id: 5, label: 'Local físico (galpão, portaria, etc)', requires_text: false },
      { id: 6, label: 'Sinal de GPS', requires_text: false },
      { id: 7, label: 'Problema de endereço ou lat/long', requires_text: false },
      { id: 8, label: 'Problema de sequenciamento da rota', requires_text: false },
      { id: 9, label: 'Seller que dropa pacotes', requires_text: false },
      { id: 10, label: 'Outro (especificar...)', requires_text: true },
    ],
  },
];

function makeOccurrence(
  id: number,
  occurred_at: string,
  seller_name: string,
  station_code: string,
  regional: string,
  driver_name: string,
  shop_id: number,
  driver_id: number,
  onhold_order_count: number,
  raio: string,
  radius_diff: number | null,
  horario_funcionamento: string,
  recurrence_days: number,
  contact_count: number,
  treatment: Treatment | null = null,
  can_treat = true,
  driver_phone = '5531996282117',
): Occurrence {
  return {
    id,
    pickup_task_id: String(2000 + id),
    occurrence_date: occurred_at.slice(0, 10),
    occurred_at,
    seller_performance: 'No Show Seller',
    driver_justification: 'Não havia pacotes para coletar',
    fault_type: 'NSS SPX Fault',
    shop_id: String(shop_id),
    pickup_point_id: `${shop_id}_001`,
    seller_group: String(shop_id),
    dispatcher_email: '',
    supervisor_email: '',
    regional_manager: '',
    seller_name,
    station_code,
    regional,
    driver_id,
    driver_name,
    driver_phone,
    route_name: `ROTA-${station_code}-${driver_id}`,
    allocated_by: 'Central de despacho',
    onhold_order_count,
    raio,
    radius_diff,
    horario_funcionamento,
    open_hour: '09:00',
    close_hour: '18:00',
    queue: 'nss-spx-fault',
    recurrence_days,
    contact_count,
    last_contact_at: contact_count > 0 ? '2026-10-14T11:45:00-03:00' : null,
    last_contact_by: contact_count > 0 ? 'Marina Costa' : null,
    treatment,
    can_treat,
  };
}

const occurrences: Occurrence[] = [
  makeOccurrence(59, '2026-10-14T10:59:00-03:00', 'LOJA EXPRESS', 'FMH-BHZ-03', 'Regional 3', 'FÁBIO RIBEIRO', 900109, 5124, 130, 'Fora do raio', 793, 'Dentro do horário de funcionamento', 3, 1),
  makeOccurrence(60, '2026-10-15T08:22:00-03:00', 'MP PRIME', 'FMH-NSA-01', 'Regional 4', 'HUGO TIGRE', 900104, 5002, 74, 'Dentro do raio', 92, 'Fora do horário de funcionamento', 2, 0),
  makeOccurrence(61, '2026-10-15T11:18:00-03:00', 'ARMAZÉM BETA', 'SOC-RJ2', 'Regional 2', 'DAVI COSTA', 900117, 5043, 46, 'Fora do raio', 822, 'Dentro do horário de funcionamento', 1, 0, null, false),
  makeOccurrence(62, '2026-10-13T12:20:00-03:00', 'ARMAZÉM BETA', 'SOC-RJ2', 'Regional 2', 'DAVI COSTA', 900117, 5043, 14, 'Fora do raio', 822, 'Dentro do horário de funcionamento', 1, 1, {
    reversal: 3,
    reversal_label: 'Não revertido',
    justification: 7,
    justification_label: 'Problema de endereço ou lat/long',
    justification_text: '',
    treated_by: 'bruno@example.com',
    updated_at: '2026-10-15T15:56:28.269710-03:00',
  }),
  makeOccurrence(63, '2026-10-14T16:07:00-03:00', 'LOJA EXPRESS', 'FMH-NSA-01', 'Regional 4', 'HUGO TIGRE', 900109, 5002, 88, 'Fora do raio', 410, 'Fora do horário de funcionamento', 3, 0),
  makeOccurrence(64, '2026-10-12T09:41:00-03:00', 'MP PRIME', 'FMH-NSA-01', 'Regional 4', 'DRIVER UM', 900104, 501, 65, 'Fora do raio', 590, 'Dentro do horário de funcionamento', 3, 1),
  makeOccurrence(65, '2026-10-11T14:12:00-03:00', 'CASA DAS PEÇAS', 'SOC-SP4', 'Regional 1', 'LETÍCIA MOURA', 900121, 5101, 31, 'Dentro do raio', 38, 'Dentro do horário de funcionamento', 1, 0),
  makeOccurrence(66, '2026-10-10T18:35:00-03:00', 'PONTO DO LAR', 'FMH-POA-02', 'Big', 'RENATO ALVES', 900135, 5108, 59, 'NA', null, 'Fora do horário de funcionamento', 2, 0),
  makeOccurrence(67, '2026-10-09T10:05:00-03:00', 'MP PRIME', 'FMH-NSA-01', 'Regional 4', 'HUGO TIGRE', 900104, 5002, 107, 'Fora do raio', 304, 'Dentro do horário de funcionamento', 3, 1),
  makeOccurrence(68, '2026-10-08T13:56:00-03:00', 'ARMAZÉM BETA', 'SOC-RJ2', 'Regional 2', 'DAVI COSTA', 900117, 5043, 44, 'Dentro do raio', 114, 'Dentro do horário de funcionamento', 1, 0),
  makeOccurrence(69, '2026-10-07T07:49:00-03:00', 'LOJA EXPRESS', 'FMH-BHZ-03', 'Regional 3', 'FÁBIO RIBEIRO', 900109, 5124, 95, 'Fora do raio', 650, 'Fora do horário de funcionamento', 3, 1),
  makeOccurrence(70, '2026-10-06T15:27:00-03:00', 'URBANO STORE', 'SOC-SP4', 'Regional 1', 'MATEUS LIMA', 900140, 5140, 22, 'Dentro do raio', 41, 'Dentro do horário de funcionamento', 1, 0),
  makeOccurrence(71, '2026-10-04T09:12:00-03:00', 'MP PRIME', 'FMH-NSA-01', 'Regional 4', 'DRIVER UM', 900104, 501, 48, 'Fora do raio', 460, 'Dentro do horário de funcionamento', 3, 0),
  makeOccurrence(72, '2026-10-02T19:06:00-03:00', 'PONTO DO LAR', 'FMH-POA-02', 'Big', 'RENATO ALVES', 900135, 5108, 27, 'NA', null, 'Fora do horário de funcionamento', 2, 1),
  makeOccurrence(73, '2026-09-28T11:34:00-03:00', 'CASA DAS PEÇAS', 'SOC-SP4', 'Regional 1', 'LETÍCIA MOURA', 900121, 5101, 17, 'Dentro do raio', 79, 'Dentro do horário de funcionamento', 1, 0),
  makeOccurrence(74, '2026-09-20T16:48:00-03:00', 'ARMAZÉM BETA', 'SOC-RJ2', 'Regional 2', 'DAVI COSTA', 900117, 5043, 35, 'Fora do raio', 522, 'Dentro do horário de funcionamento', 1, 1),
  makeOccurrence(75, '2026-09-18T08:05:00-03:00', 'LOJA EXPRESS', 'FMH-BHZ-03', 'Regional 3', 'FÁBIO RIBEIRO', 900109, 5124, 62, 'Fora do raio', 780, 'Fora do horário de funcionamento', 3, 0),
  makeOccurrence(76, '2026-09-12T14:53:00-03:00', 'URBANO STORE', 'SOC-SP4', 'Regional 1', 'MATEUS LIMA', 900140, 5140, 12, 'Dentro do raio', 16, 'Dentro do horário de funcionamento', 1, 0),
  makeOccurrence(77, '2026-08-28T12:02:00-03:00', 'MP PRIME', 'FMH-NSA-01', 'Regional 4', 'HUGO TIGRE', 900104, 5002, 93, 'Fora do raio', 612, 'Dentro do horário de funcionamento', 4, 1),
  makeOccurrence(78, '2026-08-18T17:42:00-03:00', 'LOJA EXPRESS', 'FMH-BHZ-03', 'Regional 3', 'FÁBIO RIBEIRO', 900109, 5124, 39, 'NA', null, 'Dentro do horário de funcionamento', 3, 0),
  makeOccurrence(79, '2026-08-04T10:28:00-03:00', 'ARMAZÉM BETA', 'SOC-RJ2', 'Regional 2', 'DAVI COSTA', 900117, 5043, 21, 'Dentro do raio', 55, 'Dentro do horário de funcionamento', 1, 1),
  makeOccurrence(80, '2026-07-25T14:17:00-03:00', 'MP PRIME', 'FMH-NSA-01', 'Regional 4', 'DRIVER UM', 900104, 501, 71, 'Fora do raio', 530, 'Dentro do horário de funcionamento', 4, 0),
];

const historyById = new Map<number, ContactEntry[]>();
for (const occurrence of occurrences) {
  historyById.set(occurrence.id, occurrence.contact_count > 0 ? [{
    sent_by: occurrence.last_contact_by ?? 'Marina Costa',
    member_name: occurrence.last_contact_by ?? 'Marina Costa',
    sent_at: occurrence.last_contact_at ?? occurrence.occurred_at ?? new Date().toISOString(),
  }] : []);
}

const members: ContactMember[] = [
  { id: 1, name: 'Marina Costa (você)', phone_ok: true, is_me: true },
  { id: 2, name: 'Rafael Almeida', phone_ok: true, is_me: false },
  { id: 3, name: 'Patrícia Souza', phone_ok: false, is_me: false },
];

const filterOptions: FilterOption[] = [
  { regional: 'Big', station_code: 'FMH-POA-02' },
  { regional: 'Regional 1', station_code: 'SOC-SP4' },
  { regional: 'Regional 2', station_code: 'SOC-RJ2' },
  { regional: 'Regional 3', station_code: 'FMH-BHZ-03' },
  { regional: 'Regional 4', station_code: 'FMH-NSA-01' },
];

const pause = (ms = 90) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const clone = <T,>(value: T): T => structuredClone(value);

function matchesBase(occurrence: Occurrence, filters: OccurrenceFilters): boolean {
  if (filters.queue && occurrence.queue !== filters.queue) return false;
  if (filters.regional && occurrence.regional !== filters.regional) return false;
  if (filters.stations.length && !filters.stations.includes(occurrence.station_code)) return false;
  const day = occurrence.occurrence_date;
  if (filters.date_from && day < filters.date_from) return false;
  if (filters.date_to && day > filters.date_to) return false;
  if (filters.shop_id !== undefined && occurrence.shop_id !== filters.shop_id) return false;
  if (filters.driver_id !== undefined && occurrence.driver_id !== filters.driver_id) return false;
  if (filters.route && occurrence.route_name !== filters.route) return false;
  return true;
}

function workSet(filters: OccurrenceFilters, includeWorkFilters: boolean): Occurrence[] {
  const normalizedSearch = filters.search.trim().toLocaleLowerCase('pt-BR');
  return occurrences.filter((item) => {
    if (!matchesBase(item, filters)) return false;
    if (!includeWorkFilters) return true;
    if (filters.treated === 'true' && !item.treatment) return false;
    if (filters.treated === 'false' && item.treatment) return false;
    if (normalizedSearch) {
      const searchable = [item.id, item.shop_id, item.seller_name, item.station_code, item.driver_id, item.driver_name, item.route_name]
        .filter((value) => value !== null)
        .join(' ')
        .toLocaleLowerCase('pt-BR');
      if (!searchable.includes(normalizedSearch)) return false;
    }
    return true;
  });
}

function sorted(items: Occurrence[], filters: OccurrenceFilters): Occurrence[] {
  return [...items].sort((a, b) => {
    if (filters.ordering === '-packages') return b.onhold_order_count - a.onhold_order_count;
    if (filters.ordering === '-recurrence') return b.recurrence_days - a.recurrence_days || b.id - a.id;
    return (b.occurred_at ?? '').localeCompare(a.occurred_at ?? '');
  });
}

function kpis(items: Occurrence[]): Kpis {
  const treated = items.filter((item) => item.treatment !== null);
  const reversed = treated.filter((item) => item.treatment?.reversal_label.toLocaleLowerCase('pt-BR') === 'coletado').length;
  const elapsed = treated.map((item) => {
    const start = item.occurred_at ? new Date(item.occurred_at).getTime() : Number.NaN;
    const end = item.treatment ? new Date(item.treatment.updated_at).getTime() : Number.NaN;
    return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, (end - start) / 3_600_000) : null;
  }).filter((value): value is number => value !== null);
  return {
    total: items.length,
    treated: treated.length,
    pending: items.length - treated.length,
    no_contact: items.filter((item) => item.contact_count === 0 && item.treatment === null).length,
    packages_pending: items.reduce((sum, item) => sum + item.onhold_order_count, 0),
    avg_hours_to_treat: elapsed.length ? elapsed.reduce((sum, value) => sum + value, 0) / elapsed.length : null,
    reversal_rate: treated.length ? reversed / treated.length : null,
  };
}

function insightsFor(items: Occurrence[]): Insights {
  const dailyMap = new Map<string, { date: string; total: number; treated: number }>();
  const stationMap = new Map<string, { station_code: string; regional: string; total: number; pending: number; treated: number; packages_pending: number }>();
  const sellerMap = new Map<string, { shop_id: string; name: string; days: number; occurrences: number; pending: number }>();
  const driverMap = new Map<number, { driver_id: number; name: string; station_code: string; days: number; occurrences: number; pending: number }>();
  const justifications = new Map<string, number>();
  const reversalMap = new Map<string, { label: string; count: number; reversed: boolean }>();
  const aging = { d0: 0, d1_2: 0, d3_6: 0, d7p: 0 };
  const cause = { raio_only: 0, horario_only: 0, both: 0, other: 0 };
  const by_hour = Array.from({ length: 24 }, () => 0);
  const today = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())}T12:00:00-03:00`);

  for (const item of items) {
    const date = item.occurrence_date;
    const day = dailyMap.get(date) ?? { date, total: 0, treated: 0 };
    day.total += 1;
    if (item.treatment) day.treated += 1;
    dailyMap.set(date, day);

    const station = stationMap.get(item.station_code) ?? {
      station_code: item.station_code,
      regional: item.regional,
      total: 0,
      pending: 0,
      treated: 0,
      packages_pending: 0,
    };
    station.total += 1;
    station.packages_pending += item.onhold_order_count;
    if (item.treatment) station.treated += 1;
    else station.pending += 1;
    stationMap.set(item.station_code, station);

    if (!item.treatment) {
      const age = Math.max(0, Math.floor((today.getTime() - new Date(`${date}T12:00:00-03:00`).getTime()) / 86_400_000));
      if (age === 0) aging.d0 += 1;
      else if (age <= 2) aging.d1_2 += 1;
      else if (age <= 6) aging.d3_6 += 1;
      else aging.d7p += 1;
    }
    const outsideRadius = item.raio === 'Fora do raio';
    const outsideHours = item.horario_funcionamento === 'Fora do horário de funcionamento';
    if (outsideRadius && outsideHours) cause.both += 1;
    else if (outsideRadius) cause.raio_only += 1;
    else if (outsideHours) cause.horario_only += 1;
    else cause.other += 1;

    const hour = hourInSaoPaulo(item.occurred_at);
    if (hour !== null) by_hour[hour] += 1;

    const seller = sellerMap.get(item.shop_id) ?? { shop_id: item.shop_id, name: item.seller_name, days: 0, occurrences: 0, pending: 0 };
    seller.days = Math.max(seller.days, item.recurrence_days);
    seller.occurrences += 1;
    if (!item.treatment) seller.pending += 1;
    sellerMap.set(item.shop_id, seller);

    if (item.driver_id !== null) {
      const driver = driverMap.get(item.driver_id) ?? { driver_id: item.driver_id, name: item.driver_name, station_code: item.station_code, days: 0, occurrences: 0, pending: 0 };
      driver.days = Math.max(driver.days, item.recurrence_days);
      driver.occurrences += 1;
      if (!item.treatment) driver.pending += 1;
      driverMap.set(item.driver_id, driver);
    }
    if (item.treatment) {
      const causeLabel = item.treatment.justification_label;
      justifications.set(causeLabel, (justifications.get(causeLabel) ?? 0) + 1);
      const label = item.treatment.reversal_label;
      const entry = reversalMap.get(label) ?? { label, count: 0, reversed: label.toLocaleLowerCase('pt-BR') === 'coletado' };
      entry.count += 1;
      reversalMap.set(label, entry);
    }
  }

  return {
    kpis: kpis(items),
    daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    aging,
    cause,
    reversal: [...reversalMap.values()].sort((a, b) => b.count - a.count),
    justifications: [...justifications.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    stations: [...stationMap.values()].sort((a, b) => b.pending - a.pending || b.total - a.total),
    repeat_sellers: [...sellerMap.values()].filter((item) => item.occurrences > 1).sort((a, b) => b.pending - a.pending || b.occurrences - a.occurrences),
    repeat_drivers: [...driverMap.values()].filter((item) => item.occurrences > 1).sort((a, b) => b.pending - a.pending || b.occurrences - a.occurrences),
    by_hour,
  };
}

function getOccurrence(id: number): Occurrence {
  const occurrence = occurrences.find((item) => item.id === id);
  if (!occurrence) throw new Error('Ocorrência não encontrada no conjunto de demonstração.');
  return occurrence;
}


// ---- Registro de tratativas e recorrência (mesma lógica do backend, sobre os dados de demonstração) ----
const isReversed = (t: Treatment) => t.reversal_label !== 'Não revertido';

function toLogRow(o: Occurrence, t: Treatment): TreatmentLogRow {
  const hours = o.occurred_at ? Math.max((Date.parse(t.updated_at) - Date.parse(o.occurred_at)) / 3_600_000, 0) : null;
  return {
    id: o.id * 10, treated_at: t.updated_at, updated_at: t.updated_at, treated_by: t.treated_by,
    reversal_label: t.reversal_label, reversed: isReversed(t), justification_label: t.justification_label,
    justification_text: t.justification_text, occurrence_id: o.id, pickup_task_id: o.pickup_task_id,
    occurrence_date: o.occurrence_date, occurred_at: o.occurred_at, fault_type: o.fault_type, seller_name: o.seller_name,
    shop_id: o.shop_id, station_code: o.station_code, regional: o.regional, driver_id: o.driver_id,
    driver_name: o.driver_name, route_name: o.route_name, allocated_by: o.allocated_by,
    onhold_order_count: o.onhold_order_count, raio: o.raio, horario_funcionamento: o.horario_funcionamento,
    contact_count: o.contact_count, hours_to_treat: hours === null ? null : Math.round(hours * 10) / 10,
  };
}

function treatmentRows(f: TreatmentFilters): TreatmentLogRow[] {
  const search = f.search.trim().toLocaleLowerCase('pt-BR');
  return occurrences
    .filter((o): o is Occurrence & { treatment: Treatment } => o.treatment !== null)
    .filter((o) => {
      const t = o.treatment;
      const day = t.updated_at.slice(0, 10);
      if (f.queue && o.queue !== f.queue) return false;
      if (f.regional && o.regional !== f.regional) return false;
      if (f.stations.length && !f.stations.includes(o.station_code)) return false;
      if (f.date_from && day < f.date_from) return false;
      if (f.date_to && day > f.date_to) return false;
      if (f.reversed === 'true' && !isReversed(t)) return false;
      if (f.reversed === 'false' && isReversed(t)) return false;
      if (f.justification && String(t.justification) !== f.justification) return false;
      if (f.treated_by && t.treated_by.toLowerCase() !== f.treated_by.toLowerCase()) return false;
      if (search) {
        const text = [o.seller_name, o.driver_name, o.route_name, t.treated_by, o.shop_id, o.driver_id].join(' ').toLocaleLowerCase('pt-BR');
        if (!text.includes(search)) return false;
      }
      return true;
    })
    .map((o) => toLogRow(o, o.treatment))
    .sort((a, b) => (f.ordering === '-packages' ? b.onhold_order_count - a.onhold_order_count : b.treated_at.localeCompare(a.treated_at)));
}

function countBy<T>(items: T[], key: (item: T) => string): [string, number][] {
  const map = new Map<string, number>();
  items.forEach((item) => map.set(key(item), (map.get(key(item)) ?? 0) + 1));
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function treatmentSummaryFor(rows: TreatmentLogRow[]): TreatmentSummary {
  const reversedCount = rows.filter((r) => r.reversed).length;
  const hours = rows.map((r) => r.hours_to_treat).filter((v): v is number => v !== null);
  return {
    total: rows.length,
    reversed: reversedCount,
    reversal_rate: rows.length ? reversedCount / rows.length : null,
    avg_hours_to_treat: hours.length ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10 : null,
    by_reversal: countBy(rows, (r) => r.reversal_label).map(([label, count], id) => ({
      id, label, count, reversed: rows.find((r) => r.reversal_label === label)?.reversed ?? false,
    })),
    by_justification: countBy(rows, (r) => r.justification_label).map(([label, count], id) => ({ id, label, count })),
    by_user: countBy(rows, (r) => r.treated_by).map(([treated_by, count]) => ({
      treated_by, count, reversed: rows.filter((r) => r.treated_by === treated_by && r.reversed).length,
    })),
    by_day: countBy(rows, (r) => r.treated_at.slice(0, 10)).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function recurrenceFor(entity: RecurrenceEntity, items: Occurrence[], minDays: number, order: RecurrenceOrder, limit: number): RecurrenceResult {
  const keyOf = (o: Occurrence): string | null =>
    entity === 'seller' ? String(o.shop_id) : entity === 'driver' ? (o.driver_id === null ? null : String(o.driver_id)) : o.route_name || null;
  const groups = new Map<string, Occurrence[]>();
  items.forEach((o) => {
    const key = keyOf(o);
    if (key !== null) groups.set(key, [...(groups.get(key) ?? []), o]);
  });
  const rows: RecurrenceRow[] = [...groups.entries()]
    .map(([key, list]) => {
      const dates = list.map((o) => o.occurrence_date).sort();
      const relatedKey = (o: Occurrence) => String(entity === 'driver' ? o.shop_id : o.driver_id);
      return {
        entity, key, name: entity === 'seller' ? list[0].seller_name : entity === 'driver' ? list[0].driver_name : key,
        station_code: list[0].station_code, stations: new Set(list.map((o) => o.station_code)).size,
        related: new Set(list.map(relatedKey)).size,
        days: new Set(dates).size, occurrences: list.length,
        pending: list.filter((o) => !o.treatment).length, treated: list.filter((o) => o.treatment).length,
        reversed: list.filter((o) => o.treatment && isReversed(o.treatment)).length,
        packages: list.reduce((sum, o) => sum + o.onhold_order_count, 0),
        first_date: dates[0], last_date: dates[dates.length - 1],
        out_radius: list.filter((o) => o.raio === 'Fora do raio').length,
        out_hours: list.filter((o) => o.horario_funcionamento.startsWith('Fora')).length,
      };
    })
    .filter((r) => r.days >= minDays)
    .sort((a, b) => {
      const main = order === 'days' ? b.days - a.days : order === 'occurrences' ? b.occurrences - a.occurrences : order === 'pending' ? b.pending - a.pending : b.packages - a.packages;
      return main || b.occurrences - a.occurrences;
    });
  return { entity, count: rows.length, results: rows.slice(0, limit) };
}

function toCsv(rows: TreatmentLogRow[]): string {
  const cell = (v: string | number) => {
    const text = String(v);
    return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
  };
  const header = ['Tratada em', 'Tratada por', 'Resultado', 'Justificativa', 'Detalhe', 'Seller', 'Station', 'Motorista', 'Rota', 'Pacotes'];
  const lines = rows.map((r) => [r.treated_at, r.treated_by, r.reversal_label, r.justification_label, r.justification_text, r.seller_name, r.station_code, r.driver_name, r.route_name, r.onhold_order_count].map(cell).join(';'));
  return `\ufeff${[header.map(cell).join(';'), ...lines].join('\n')}`;
}


// ---- Indicadores (dados de demonstração; no backend real, quem aloca e quem aciona são identidades distintas) ----
const NO_SHOW = ['No Show Seller', 'No Show 3PL'];

function indicatorBase(filters: OccurrenceFilters): Occurrence[] {
  return workSet({ ...filters, queue: '' }, false).filter((o) => NO_SHOW.includes(o.seller_performance));
}

function indicatorsOverviewFor(items: Occurrence[]): IndicatorsOverview {
  const treated = items.filter((o) => o.treatment);
  const reverted = treated.filter((o) => isReversed(o.treatment!));
  const attempts = reverted.map((o) => o.contact_count);
  const hours = treated.map((o) => toLogRow(o, o.treatment!).hours_to_treat).filter((v): v is number => v !== null);
  return {
    occurrences: items.length, treated: treated.length, pending: items.length - treated.length, reverted: reverted.length,
    routes: items.length, routes_treated: treated.length, routes_reverted: reverted.length,
    driver_no_show: items.filter((o) => o.seller_performance === 'No Show 3PL').length,
    seller_no_show: items.filter((o) => o.seller_performance === 'No Show Seller').length,
    reversal_rate: treated.length ? reverted.length / treated.length : null,
    treated_rate: items.length ? treated.length / items.length : null,
    messages: items.reduce((sum, o) => sum + o.contact_count, 0),
    drivers_contacted: new Set(items.filter((o) => o.contact_count > 0).map((o) => o.driver_id)).size,
    avg_hours_to_treat: hours.length ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10 : null,
    attempts: {
      avg: attempts.length ? Math.round((attempts.reduce((a, b) => a + b, 0) / attempts.length) * 100) / 100 : null,
      reversed_treatments: attempts.length,
      distribution: {
        zero: attempts.filter((n) => n === 0).length, one: attempts.filter((n) => n === 1).length,
        two: attempts.filter((n) => n === 2).length, three_plus: attempts.filter((n) => n >= 3).length,
      },
    },
    training: { available: false },
  };
}

function dispatchersFor(items: Occurrence[], order: DispatcherOrder): IndicatorList<DispatcherRow> {
  const groups = new Map<string, Occurrence[]>();
  items.filter((o) => o.allocated_by).forEach((o) => groups.set(o.allocated_by, [...(groups.get(o.allocated_by) ?? []), o]));
  const rows: DispatcherRow[] = [...groups.entries()].map(([name, list]) => {
    const treated = list.filter((o) => o.treatment);
    const hours = treated.map((o) => toLogRow(o, o.treatment!).hours_to_treat).filter((v): v is number => v !== null);
    const messages = list.reduce((sum, o) => sum + o.contact_count, 0);
    return {
      key: name.toLocaleLowerCase('pt-BR'), name, email: null, station_code: list[0].station_code,
      has_routes: true, has_actions: messages > 0 || treated.length > 0,
      occurrences: list.length, routes: list.length, routes_treated: treated.length,
      routes_reverted: treated.filter((o) => isReversed(o.treatment!)).length, pending: list.length - treated.length,
      messages, drivers_contacted: new Set(list.filter((o) => o.contact_count > 0).map((o) => o.driver_id)).size,
      occurrences_contacted: list.filter((o) => o.contact_count > 0).length,
      treated_by_him: treated.length, reverted_by_him: treated.filter((o) => isReversed(o.treatment!)).length,
      avg_hours_to_treat: hours.length ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10 : null,
    };
  });
  const sortKey: Record<DispatcherOrder, (r: DispatcherRow) => number> = {
    routes: (r) => r.routes, messages: (r) => r.messages, routes_reverted: (r) => r.routes_reverted, slowest: (r) => r.avg_hours_to_treat ?? 0,
  };
  rows.sort((a, b) => sortKey[order](b) - sortKey[order](a) || b.routes - a.routes);
  return { count: rows.length, results: rows };
}

function driversFor(items: Occurrence[], order: DriverOrder): IndicatorList<DriverRow> {
  const groups = new Map<number, Occurrence[]>();
  items.forEach((o) => { if (o.driver_id !== null) groups.set(o.driver_id, [...(groups.get(o.driver_id) ?? []), o]); });
  const rows: DriverRow[] = [...groups.entries()].map(([driverId, list]) => {
    const bySeller = new Map<string, Set<string>>();
    list.forEach((o) => bySeller.set(o.shop_id, (bySeller.get(o.shop_id) ?? new Set()).add(o.occurrence_date)));
    return {
      driver_id: driverId, name: list[0].driver_name, station_code: list[0].station_code,
      stations: new Set(list.map((o) => o.station_code)).size, days: new Set(list.map((o) => o.occurrence_date)).size,
      occurrences: list.length, no_show_driver: list.filter((o) => o.seller_performance === 'No Show 3PL').length,
      no_show_seller: list.filter((o) => o.seller_performance === 'No Show Seller').length,
      spx_fault: list.filter((o) => o.fault_type === 'NSS SPX Fault').length, sellers: bySeller.size,
      repeat_sellers: [...bySeller.values()].filter((days) => days.size >= 2).length,
      pending: list.filter((o) => !o.treatment).length, treated: list.filter((o) => o.treatment).length,
      reverted: list.filter((o) => o.treatment && isReversed(o.treatment)).length,
      packages: list.reduce((sum, o) => sum + o.onhold_order_count, 0),
    };
  });
  const sortKey: Record<DriverOrder, (r: DriverRow) => number> = {
    occurrences: (r) => r.occurrences, no_show_driver: (r) => r.no_show_driver, repeat_sellers: (r) => r.repeat_sellers,
    reverted: (r) => r.reverted, packages: (r) => r.packages,
  };
  rows.sort((a, b) => sortKey[order](b) - sortKey[order](a) || b.occurrences - a.occurrences);
  return { count: rows.length, results: rows };
}

export const api: ApiClient = {
  async me() {
    await pause();
    return { email: 'marina.costa@operacao.com.br', is_admin: true, stations: ['FMH-NSA-01', 'FMH-BHZ-03'], regionals: ['Regional 3', 'Regional 4'] };
  },
  async loginGoogle() {
    await pause();
    return { email: 'marina.costa@operacao.com.br', is_admin: true, stations: ['FMH-NSA-01', 'FMH-BHZ-03'], regionals: ['Regional 3', 'Regional 4'] };
  },
  async logout() {
    await pause();
  },
  async queues() {
    await pause();
    return clone(queueData);
  },
  async filterOptions() {
    await pause();
    return clone(filterOptions);
  },
  async occurrences(filters: OccurrenceFilters): Promise<Page<Occurrence>> {
    await pause();
    const all = sorted(workSet(filters, true), filters);
    const pageSize = 50;
    const start = (filters.page - 1) * pageSize;
    return {
      count: all.length,
      next: start + pageSize < all.length ? String(filters.page + 1) : null,
      previous: filters.page > 1 ? String(filters.page - 1) : null,
      results: clone(all.slice(start, start + pageSize)),
    };
  },
  async summary(filters: OccurrenceFilters): Promise<Kpis> {
    await pause();
    return kpis(workSet(filters, false));
  },
  async insights(filters: OccurrenceFilters): Promise<Insights> {
    await pause();
    return insightsFor(workSet(filters, false));
  },
  async history(id: number): Promise<ContactEntry[]> {
    await pause();
    return clone(historyById.get(id) ?? []);
  },
  async saveTreatment(id: number, body: TreatmentPayload): Promise<Treatment> {
    await pause();
    const occurrence = getOccurrence(id);
    const queue = queueData.find((item) => item.slug === occurrence.queue) ?? queueData[0];
    const reversal = queue.reversal_options.find((item) => item.id === body.reversal);
    const justification = queue.justification_options.find((item) => item.id === body.justification);
    if (!reversal || !justification) throw new Error('Selecione um resultado e uma justificativa válidos.');
    if (justification.requires_text && !body.justification_text.trim()) throw new Error('Descreva a justificativa para continuar.');
    const treatment: Treatment = {
      reversal: reversal.id,
      reversal_label: reversal.label,
      justification: justification.id,
      justification_label: justification.label,
      justification_text: body.justification_text.trim(),
      treated_by: 'marina.costa@operacao.com.br',
      updated_at: new Date().toISOString(),
    };
    occurrence.treatment = treatment;
    return clone(treatment);
  },
  async contactOptions(id: number): Promise<ContactMember[]> {
    await pause();
    getOccurrence(id);
    return clone(members);
  },
  async contact(id: number, memberId: number) {
    await pause(260);
    const occurrence = getOccurrence(id);
    const member = members.find((item) => item.id === memberId);
    if (!member || !member.phone_ok) throw new Error('Escolha uma pessoa com telefone válido para acionar.');
    occurrence.contact_count += 1;
    occurrence.last_contact_at = new Date().toISOString();
    occurrence.last_contact_by = member.name.replace(' (você)', '');
    const entries = historyById.get(id) ?? [];
    entries.unshift({ sent_by: member.name, member_name: member.name, sent_at: occurrence.last_contact_at });
    historyById.set(id, entries);
    const message = `Olá! Estamos verificando a ocorrência de coleta ${occurrence.id} na loja ${occurrence.seller_name}. Pode nos contar o que aconteceu?`;
    return {
      attempt_id: Math.floor(Date.now() / 10),
      message,
      whatsapp_url: `https://wa.me/5511999990000?text=${encodeURIComponent(message)}`,
    };
  },
  async treatments(filters: TreatmentFilters) {
    await pause();
    const all = treatmentRows(filters);
    const start = (filters.page - 1) * 50;
    return {
      count: all.length,
      next: start + 50 < all.length ? String(filters.page + 1) : null,
      previous: filters.page > 1 ? String(filters.page - 1) : null,
      results: clone(all.slice(start, start + 50)),
    };
  },
  async treatmentSummary(filters: TreatmentFilters) {
    await pause();
    return treatmentSummaryFor(treatmentRows(filters));
  },
  async exportTreatments(filters: TreatmentFilters) {
    await pause();
    const url = URL.createObjectURL(new Blob([toCsv(treatmentRows(filters))], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tratativas-demonstracao.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
  async recurrence(entity: RecurrenceEntity, filters: OccurrenceFilters, options: { minDays: number; order: RecurrenceOrder; limit?: number }) {
    await pause();
    return clone(recurrenceFor(entity, workSet(filters, false), options.minDays, options.order, options.limit ?? 50));
  },
  async indicatorsOverview(filters: OccurrenceFilters) {
    await pause();
    return indicatorsOverviewFor(indicatorBase(filters));
  },
  async indicatorDispatchers(filters: OccurrenceFilters, order: DispatcherOrder) {
    await pause();
    return clone(dispatchersFor(indicatorBase(filters), order));
  },
  async indicatorDrivers(filters: OccurrenceFilters, order: DriverOrder) {
    await pause();
    return clone(driversFor(indicatorBase(filters), order));
  },
};
