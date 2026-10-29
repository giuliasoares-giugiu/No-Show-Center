import type { ApiClient } from './api';
import { todayISO } from '../format';
import type {
  ContactEntry, ContactMember, DispatcherRow, DriverRow, FilterOption, Insights, Kpis, Me,
  Occurrence, OccurrenceFilters, Option, Page, Queue, RecurrenceRow, Treatment, TreatmentFilters,
  TreatmentLogRow, TreatmentSummary,
} from '../types';

// Dados de exemplo: usados apenas quando VITE_SKIP_LOGIN=true.

const PAGE_SIZE = 15;
const ME: Me = { email: 'demo@local', is_admin: true, stations: [], regionals: [] };

const wait = <T>(value: T): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), 120));
const sum = (v: number[]): number => v.reduce((a, b) => a + b, 0);
const uniq = (v: string[]): number => new Set(v).size;
const avgOf = (v: number[]): number | null => (v.length ? Math.round((sum(v) / v.length) * 10) / 10 : null);

function groupBy<T>(list: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of list) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

const REVERSALS: Option[] = [
  { id: 1, label: 'Coleta revertida', requires_text: false },
  { id: 2, label: 'Coleta não revertida', requires_text: false },
];
const JUSTIFICATIONS: Option[] = [
  { id: 1, label: 'Motorista com problema no veículo', requires_text: false },
  { id: 2, label: 'Endereço do seller incorreto', requires_text: false },
  { id: 3, label: 'Seller fechado no horário', requires_text: false },
  { id: 4, label: 'Fora do raio permitido', requires_text: false },
  { id: 5, label: 'Outro motivo', requires_text: true },
];
const QUEUES: Queue[] = [
  { slug: 'nss-spx-fault', name: 'No-show · Falha SPX', reversal_options: REVERSALS, justification_options: JUSTIFICATIONS },
  { slug: 'nss-seller', name: 'No-show · Seller', reversal_options: REVERSALS, justification_options: JUSTIFICATIONS },
];

const STATIONS = [
  { code: 'SP-OSASCO', regional: 'SP Capital', manager: 'Carla Menezes' },
  { code: 'SP-GUARULHOS', regional: 'SP Capital', manager: 'Carla Menezes' },
  { code: 'RJ-CAPITAL', regional: 'Rio de Janeiro', manager: 'Paulo Ribeiro' },
  { code: 'MG-BELO-HORIZONTE', regional: 'Minas Gerais', manager: 'Renata Alves' },
  { code: 'PR-CURITIBA', regional: 'Sul', manager: 'Marcos Teixeira' },
];
const SELLERS = ['Loja Aurora', 'Casa do Café', 'Moda Bela', 'Tech Point', 'Pet Feliz', 'Mundo Verde', 'Brinquedos Sol', 'Livraria Central'];
const DRIVERS = ['Carlos Silva', 'João Pereira', 'Marcos Lima', 'André Souza', 'Rafael Costa', 'Bruno Alves', 'Diego Rocha', 'Felipe Santos'];
const DISPATCHERS = ['Ana Paula', 'Bruno Martins', 'Camila Ferraz', 'Daniel Moura'];
const FAULTS = ['No-show Driver', 'No-show Seller', 'Falha SPX'];
const REASONS = ['Trânsito intenso', 'Endereço não localizado', 'Loja fechada', 'Sem justificativa'];
const TREATERS = ['demo@local', 'ana.paula@demo.local', 'bruno.martins@demo.local'];

type Base = Omit<Occurrence, 'treatment' | 'contact_count' | 'last_contact_at' | 'last_contact_by' | 'recurrence_days' | 'can_treat'>;

const BASE: Base[] = Array.from({ length: 40 }, (_, i): Base => {
  const d = (i * 3 + 1) % 8;
  const s = (i * 5 + 2) % 8;
  const st = STATIONS[d % 5];
  const date = todayISO(-(i % 10));
  const hh = String(9 + (i % 9)).padStart(2, '0');
  const mm = String((i * 7) % 60).padStart(2, '0');
  const shop = String(50100 + s * 13);
  const outRadius = i % 3 === 0;
  return {
    id: 1000 + i,
    pickup_task_id: `PT${240000 + i * 37}`,
    occurrence_date: date,
    occurred_at: `${date}T${hh}:${mm}:00-03:00`,
    seller_performance: 'Seller aguardando coleta',
    driver_justification: REASONS[i % 4],
    fault_type: FAULTS[i % 3],
    shop_id: shop,
    seller_name: SELLERS[s],
    station_code: st.code,
    regional: st.regional,
    driver_id: 7000 + d,
    driver_name: DRIVERS[d],
    driver_phone: `(11) 9${8000 + d * 111}-${1000 + i * 3}`,
    route_name: `ROTA-${st.code.slice(0, 2)}-${String(d + 1).padStart(2, '0')}`,
    allocated_by: DISPATCHERS[d % 4],
    pickup_point_id: `${shop}_00${1 + (i % 2)}`,
    seller_group: shop,
    dispatcher_email: `${DISPATCHERS[d % 4].toLowerCase().replace(' ', '.')}@demo.local`,
    supervisor_email: `sup.${st.code.toLowerCase()}@demo.local`,
    regional_manager: st.manager,
    onhold_order_count: 3 + ((i * 7) % 38),
    raio: outRadius ? 'Fora do raio' : 'Dentro do raio',
    radius_diff: outRadius ? 120 + ((i * 13) % 400) : null,
    horario_funcionamento: i % 4 === 1 ? 'Fora do horário' : 'Dentro do horário',
    open_hour: '08:00',
    close_hour: '18:00',
    queue: i % 6 === 5 ? 'nss-seller' : 'nss-spx-fault',
  };
});

const recurrenceDays = new Map<string, number>(
  Array.from(groupBy(BASE, (b) => b.shop_id).entries()).map(
    ([k, v]) => [k, uniq(v.map((b) => b.occurrence_date))] as [string, number],
  ),
);

const treatments = new Map<number, Treatment>();
const contacts = new Map<number, ContactEntry[]>();

function stamp(b: Base, hours: number): string {
  const start = Date.parse(b.occurred_at ?? `${b.occurrence_date}T12:00:00-03:00`);
  return new Date(Math.min(Date.now(), start + hours * 3.6e6)).toISOString();
}

BASE.forEach((b, i) => {
  if (i % 3 === 0 || i % 5 === 0) {
    const n = 1 + ((i % 4) % 3);
    contacts.set(
      b.id,
      Array.from({ length: n }, (_, k): ContactEntry => ({
        sent_by: TREATERS[(i + k) % 3],
        member_name: b.driver_name,
        sent_at: stamp(b, 0.5 + k * 0.5),
      })),
    );
  }
  if (i % 5 === 0) {
    const rev = REVERSALS[(i / 5) % 3 === 2 ? 1 : 0];
    const just = JUSTIFICATIONS[i % JUSTIFICATIONS.length];
    treatments.set(b.id, {
      reversal: rev.id,
      reversal_label: rev.label,
      justification: just.id,
      justification_label: just.label,
      justification_text: just.requires_text ? 'Apurado com o motorista (dado de exemplo).' : '',
      treated_by: TREATERS[i % 3],
      updated_at: stamp(b, 2 + (i % 6)),
    });
  }
});

function view(b: Base): Occurrence {
  const log = contacts.get(b.id) ?? [];
  const last = log[log.length - 1];
  return {
    ...b,
    recurrence_days: recurrenceDays.get(b.shop_id) ?? 1,
    contact_count: log.length,
    last_contact_at: last ? last.sent_at : null,
    last_contact_by: last ? last.sent_by : null,
    treatment: treatments.get(b.id) ?? null,
    can_treat: true,
  };
}

const isReversed = (o: Occurrence): boolean => o.treatment?.reversal === 1;
const outRadius = (o: Occurrence): boolean => o.raio === 'Fora do raio';
const outHours = (o: Occurrence): boolean => o.horario_funcionamento.startsWith('Fora');

function hoursToTreat(o: Occurrence): number {
  if (!o.treatment || !o.occurred_at) return 0;
  return Math.max(0, (Date.parse(o.treatment.updated_at) - Date.parse(o.occurred_at)) / 3.6e6);
}

function scope(f: OccurrenceFilters, work: boolean): Occurrence[] {
  const queueKnown = QUEUES.some((q) => q.slug === f.queue);
  const term = f.search.trim().toLowerCase();
  const list = BASE.map(view).filter(
    (o) =>
      (!queueKnown || o.queue === f.queue) &&
      (!f.regional || o.regional === f.regional) &&
      (!f.stations.length || f.stations.includes(o.station_code)) &&
      (!f.date_from || o.occurrence_date >= f.date_from) &&
      (!f.date_to || o.occurrence_date <= f.date_to) &&
      (f.shop_id === undefined || o.shop_id === String(f.shop_id)) &&
      (f.driver_id === undefined || o.driver_id === f.driver_id) &&
      (!f.route || o.route_name === f.route) &&
      (!work ||
        ((f.treated === '' || (f.treated === 'true') === (o.treatment !== null)) &&
          (!term ||
            [o.seller_name, o.shop_id, o.driver_name, o.route_name, o.pickup_task_id, String(o.driver_id)].some((v) =>
              v.toLowerCase().includes(term),
            )))),
  );
  if (work) {
    list.sort((a, b) => {
      if (f.ordering === '-packages') return b.onhold_order_count - a.onhold_order_count;
      if (f.ordering === '-recurrence') return b.recurrence_days - a.recurrence_days;
      return Date.parse(b.occurred_at ?? '') - Date.parse(a.occurred_at ?? '');
    });
  }
  return list;
}

function kpisOf(list: Occurrence[]): Kpis {
  const done = list.filter((o) => o.treatment);
  const pend = list.filter((o) => !o.treatment);
  return {
    total: list.length,
    treated: done.length,
    pending: pend.length,
    no_contact: pend.filter((o) => o.contact_count === 0).length,
    packages_pending: sum(pend.map((o) => o.onhold_order_count)),
    avg_hours_to_treat: avgOf(done.map(hoursToTreat)),
    reversal_rate: done.length ? done.filter(isReversed).length / done.length : null,
  };
}

function insightsOf(list: Occurrence[]): Insights {
  const today = Date.parse(`${todayISO()}T12:00:00Z`);
  const ages = list
    .filter((o) => !o.treatment)
    .map((o) => Math.round((today - Date.parse(`${o.occurrence_date}T12:00:00Z`)) / 864e5));
  const byHour = Array.from({ length: 24 }, () => 0);
  list.forEach((o) => {
    const h = o.occurred_at ? Number(o.occurred_at.slice(11, 13)) : -1;
    if (h >= 0 && h < 24) byHour[h] += 1;
  });
  return {
    kpis: kpisOf(list),
    daily: Array.from(groupBy(list, (o) => o.occurrence_date).entries())
      .map(([date, items]) => ({ date, total: items.length, treated: items.filter((o) => o.treatment).length }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    aging: {
      d0: ages.filter((a) => a <= 0).length,
      d1_2: ages.filter((a) => a >= 1 && a <= 2).length,
      d3_6: ages.filter((a) => a >= 3 && a <= 6).length,
      d7p: ages.filter((a) => a >= 7).length,
    },
    cause: {
      raio_only: list.filter((o) => outRadius(o) && !outHours(o)).length,
      horario_only: list.filter((o) => !outRadius(o) && outHours(o)).length,
      both: list.filter((o) => outRadius(o) && outHours(o)).length,
      other: list.filter((o) => !outRadius(o) && !outHours(o)).length,
    },
    reversal: REVERSALS.map((r) => ({
      label: r.label,
      count: list.filter((o) => o.treatment?.reversal === r.id).length,
      reversed: r.id === 1,
    })),
    justifications: JUSTIFICATIONS.map((j) => ({
      label: j.label,
      count: list.filter((o) => o.treatment?.justification === j.id).length,
    })).filter((j) => j.count > 0),
    stations: Array.from(groupBy(list, (o) => o.station_code).entries()).map(([station_code, items]) => ({
      station_code,
      regional: items[0].regional,
      total: items.length,
      pending: items.filter((o) => !o.treatment).length,
      treated: items.filter((o) => o.treatment).length,
      packages_pending: sum(items.filter((o) => !o.treatment).map((o) => o.onhold_order_count)),
    })),
    repeat_sellers: Array.from(groupBy(list, (o) => o.shop_id).entries())
      .map(([shop_id, items]) => ({
        shop_id,
        name: items[0].seller_name,
        days: uniq(items.map((o) => o.occurrence_date)),
        occurrences: items.length,
        pending: items.filter((o) => !o.treatment).length,
      }))
      .filter((r) => r.days >= 2)
      .sort((a, b) => b.days - a.days)
      .slice(0, 5),
    repeat_drivers: Array.from(groupBy(list, (o) => String(o.driver_id)).entries())
      .map(([, items]) => ({
        driver_id: items[0].driver_id ?? 0,
        name: items[0].driver_name,
        station_code: items[0].station_code,
        days: uniq(items.map((o) => o.occurrence_date)),
        occurrences: items.length,
        pending: items.filter((o) => !o.treatment).length,
      }))
      .filter((r) => r.days >= 2)
      .sort((a, b) => b.days - a.days)
      .slice(0, 5),
    by_hour: byHour,
  };
}

function logRows(f: TreatmentFilters): TreatmentLogRow[] {
  const queueKnown = QUEUES.some((q) => q.slug === f.queue);
  const term = f.search.trim().toLowerCase();
  const rows: TreatmentLogRow[] = [];
  BASE.map(view).forEach((o) => {
    const t = o.treatment;
    if (!t) return;
    const day = t.updated_at.slice(0, 10);
    if (queueKnown && o.queue !== f.queue) return;
    if (f.regional && o.regional !== f.regional) return;
    if (f.stations.length && !f.stations.includes(o.station_code)) return;
    if (f.date_from && day < f.date_from) return;
    if (f.date_to && day > f.date_to) return;
    if (f.reversed && (f.reversed === 'true') !== (t.reversal === 1)) return;
    if (f.justification && String(t.justification) !== f.justification && t.justification_label !== f.justification) return;
    if (f.treated_by && t.treated_by !== f.treated_by) return;
    if (term && ![o.seller_name, o.shop_id, o.driver_name, o.pickup_task_id].some((v) => v.toLowerCase().includes(term))) return;
    rows.push({
      id: o.id,
      treated_at: t.updated_at,
      updated_at: t.updated_at,
      treated_by: t.treated_by,
      reversal_label: t.reversal_label,
      reversed: t.reversal === 1,
      justification_label: t.justification_label,
      justification_text: t.justification_text,
      occurrence_id: o.id,
      pickup_task_id: o.pickup_task_id,
      occurrence_date: o.occurrence_date,
      occurred_at: o.occurred_at,
      fault_type: o.fault_type,
      seller_name: o.seller_name,
      shop_id: o.shop_id,
      station_code: o.station_code,
      regional: o.regional,
      driver_id: o.driver_id,
      driver_name: o.driver_name,
      route_name: o.route_name,
      allocated_by: o.allocated_by,
      onhold_order_count: o.onhold_order_count,
      raio: o.raio,
      horario_funcionamento: o.horario_funcionamento,
      contact_count: o.contact_count,
      hours_to_treat: Math.round(hoursToTreat(o) * 10) / 10,
    });
  });
  rows.sort((a, b) =>
    f.ordering === '-packages'
      ? b.onhold_order_count - a.onhold_order_count
      : Date.parse(b.treated_at) - Date.parse(a.treated_at),
  );
  return rows;
}

function summaryOf(rows: TreatmentLogRow[]): TreatmentSummary {
  const reversed = rows.filter((r) => r.reversed).length;
  return {
    total: rows.length,
    reversed,
    reversal_rate: rows.length ? reversed / rows.length : null,
    avg_hours_to_treat: avgOf(rows.map((r) => r.hours_to_treat ?? 0)),
    by_reversal: REVERSALS.map((r) => ({
      id: r.id,
      label: r.label,
      count: rows.filter((x) => x.reversal_label === r.label).length,
      reversed: r.id === 1,
    })),
    by_justification: JUSTIFICATIONS.map((j) => ({
      id: j.id,
      label: j.label,
      count: rows.filter((x) => x.justification_label === j.label).length,
    })).filter((j) => j.count > 0),
    by_user: Array.from(groupBy(rows, (r) => r.treated_by).entries()).map(([treated_by, items]) => ({
      treated_by,
      count: items.length,
      reversed: items.filter((r) => r.reversed).length,
    })),
    by_day: Array.from(groupBy(rows, (r) => r.treated_at.slice(0, 10)).entries())
      .map(([date, items]) => ({ date, count: items.length }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

const filterOptions: FilterOption[] = STATIONS.map((s) => ({ regional: s.regional, station_code: s.code }));

const membersOf = (o: Occurrence): ContactMember[] => [
  { id: 1, name: o.driver_name, phone_ok: true, is_me: false },
  { id: 2, name: 'Você (demo)', phone_ok: true, is_me: true },
];

export const mockApi: ApiClient = {
  me: () => wait(ME),
  loginGoogle: () => wait(ME),
  logout: () => wait(undefined),
  queues: () => wait(QUEUES),
  filterOptions: () => wait(filterOptions),
  occurrences: (f) => {
    const list = scope(f, true);
    const start = (f.page - 1) * PAGE_SIZE;
    const page: Page<Occurrence> = {
      count: list.length,
      next: start + PAGE_SIZE < list.length ? 'next' : null,
      previous: f.page > 1 ? 'previous' : null,
      results: list.slice(start, start + PAGE_SIZE),
    };
    return wait(page);
  },
  summary: (f) => wait(kpisOf(scope(f, false))),
  insights: (f) => wait(insightsOf(scope(f, false))),
  history: (id) => wait([...(contacts.get(id) ?? [])]),
  saveTreatment: (id, body) => {
    const t: Treatment = {
      reversal: body.reversal,
      reversal_label: REVERSALS.find((r) => r.id === body.reversal)?.label ?? '',
      justification: body.justification,
      justification_label: JUSTIFICATIONS.find((j) => j.id === body.justification)?.label ?? '',
      justification_text: body.justification_text,
      treated_by: ME.email,
      updated_at: new Date().toISOString(),
    };
    treatments.set(id, t);
    return wait(t);
  },
  contactOptions: (id) => {
    const b = BASE.find((x) => x.id === id);
    return wait(b ? membersOf(view(b)) : []);
  },
  contact: (id, memberId) => {
    const b = BASE.find((x) => x.id === id);
    const o = b ? view(b) : null;
    const member = o ? membersOf(o).find((m) => m.id === memberId) : undefined;
    const log = contacts.get(id) ?? [];
    log.push({ sent_by: ME.email, member_name: member?.name ?? 'Motorista', sent_at: new Date().toISOString() });
    contacts.set(id, log);
    const message = `Olá! Aqui é da operação First Mile. Podemos falar sobre a coleta da rota ${o?.route_name ?? ''}?`;
    return wait({
      attempt_id: id * 100 + log.length,
      message,
      whatsapp_url: `https://wa.me/?text=${encodeURIComponent(message)}`,
    });
  },
  treatments: (f) => {
    const rows = logRows(f);
    const start = (f.page - 1) * PAGE_SIZE;
    const page: Page<TreatmentLogRow> = {
      count: rows.length,
      next: start + PAGE_SIZE < rows.length ? 'next' : null,
      previous: f.page > 1 ? 'previous' : null,
      results: rows.slice(start, start + PAGE_SIZE),
    };
    return wait(page);
  },
  treatmentSummary: (f) => wait(summaryOf(logRows(f))),
  exportTreatments: (f) => {
    const lines = logRows(f).map((r) =>
      [r.occurrence_id, r.treated_at, r.treated_by, r.reversal_label, r.justification_label, r.seller_name, r.station_code].join(';'),
    );
    const header = 'ocorrencia;tratado_em;tratado_por;resultado;justificativa;seller;station';
    const blob = new Blob(['\uFEFF' + [header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tratativas-demo.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return Promise.resolve();
  },
  recurrence: (entity, f, options) => {
    const keyOf = (o: Occurrence): string =>
      entity === 'seller' ? o.shop_id : entity === 'driver' ? String(o.driver_id ?? '') : o.route_name;
    const relatedOf = (o: Occurrence): string => (entity === 'driver' ? o.shop_id : String(o.driver_id));
    const nameOf = (o: Occurrence): string =>
      entity === 'seller' ? o.seller_name : entity === 'driver' ? o.driver_name : o.route_name;
    const rows: RecurrenceRow[] = Array.from(groupBy(scope(f, false), keyOf).entries()).map(([key, items]) => {
      const dates = items.map((o) => o.occurrence_date).sort();
      const done = items.filter((o) => o.treatment);
      return {
        entity,
        key,
        name: nameOf(items[0]),
        station_code: items[0].station_code,
        stations: uniq(items.map((o) => o.station_code)),
        related: uniq(items.map(relatedOf)),
        days: uniq(dates),
        occurrences: items.length,
        pending: items.length - done.length,
        treated: done.length,
        reversed: done.filter(isReversed).length,
        packages: sum(items.map((o) => o.onhold_order_count)),
        first_date: dates[0],
        last_date: dates[dates.length - 1],
        out_radius: items.filter(outRadius).length,
        out_hours: items.filter(outHours).length,
      };
    });
    const kept = rows.filter((r) => r.days >= options.minDays).sort((a, b) => b[options.order] - a[options.order]);
    return wait({ entity, count: kept.length, results: kept.slice(0, options.limit ?? 50) });
  },
  indicatorsOverview: (f) => {
    const list = scope(f, false);
    const done = list.filter((o) => o.treatment);
    const rev = done.filter(isReversed);
    const contacted = list.filter((o) => o.contact_count > 0);
    return wait({
      occurrences: list.length,
      treated: done.length,
      pending: list.length - done.length,
      reverted: rev.length,
      routes: uniq(list.map((o) => o.route_name)),
      routes_treated: uniq(done.map((o) => o.route_name)),
      routes_reverted: uniq(rev.map((o) => o.route_name)),
      driver_no_show: list.filter((o) => o.fault_type === 'No-show Driver').length,
      seller_no_show: list.filter((o) => o.fault_type === 'No-show Seller').length,
      reversal_rate: done.length ? rev.length / done.length : null,
      treated_rate: list.length ? done.length / list.length : null,
      messages: sum(list.map((o) => o.contact_count)),
      drivers_contacted: uniq(contacted.map((o) => String(o.driver_id))),
      avg_hours_to_treat: avgOf(done.map(hoursToTreat)),
      attempts: {
        avg: avgOf(rev.map((o) => o.contact_count)),
        reversed_treatments: rev.length,
        distribution: {
          zero: rev.filter((o) => o.contact_count === 0).length,
          one: rev.filter((o) => o.contact_count === 1).length,
          two: rev.filter((o) => o.contact_count === 2).length,
          three_plus: rev.filter((o) => o.contact_count >= 3).length,
        },
      },
      training: { available: false },
    });
  },
  indicatorDispatchers: (f, order) => {
    const rows: DispatcherRow[] = Array.from(groupBy(scope(f, false), (o) => o.allocated_by).entries()).map(
      ([name, items]) => {
        const done = items.filter((o) => o.treatment);
        const rev = done.filter(isReversed);
        const contacted = items.filter((o) => o.contact_count > 0);
        return {
          key: name.toLowerCase().replace(/\s+/g, '.'),
          name,
          email: items[0].dispatcher_email,
          station_code: items[0].station_code,
          has_routes: true,
          has_actions: true,
          occurrences: items.length,
          routes: uniq(items.map((o) => o.route_name)),
          routes_treated: uniq(done.map((o) => o.route_name)),
          routes_reverted: uniq(rev.map((o) => o.route_name)),
          pending: items.length - done.length,
          messages: sum(items.map((o) => o.contact_count)),
          drivers_contacted: uniq(contacted.map((o) => String(o.driver_id))),
          occurrences_contacted: contacted.length,
          treated_by_him: done.length,
          reverted_by_him: rev.length,
          avg_hours_to_treat: avgOf(done.map(hoursToTreat)),
        };
      },
    );
    const metric = (r: DispatcherRow): number => (order === 'slowest' ? r.avg_hours_to_treat ?? -1 : r[order]);
    const sorted = rows.sort((a, b) => metric(b) - metric(a));
    return wait({ count: sorted.length, results: sorted });
  },
  indicatorDrivers: (f, order) => {
    const rows: DriverRow[] = Array.from(groupBy(scope(f, false), (o) => String(o.driver_id)).entries()).map(
      ([, items]) => {
        const done = items.filter((o) => o.treatment);
        return {
          driver_id: items[0].driver_id ?? 0,
          name: items[0].driver_name,
          station_code: items[0].station_code,
          stations: uniq(items.map((o) => o.station_code)),
          days: uniq(items.map((o) => o.occurrence_date)),
          occurrences: items.length,
          no_show_driver: items.filter((o) => o.fault_type === 'No-show Driver').length,
          no_show_seller: items.filter((o) => o.fault_type === 'No-show Seller').length,
          spx_fault: items.filter((o) => o.fault_type === 'Falha SPX').length,
          sellers: uniq(items.map((o) => o.shop_id)),
          repeat_sellers: Array.from(groupBy(items, (o) => o.shop_id).values()).filter((g) => g.length >= 2).length,
          pending: items.length - done.length,
          treated: done.length,
          reverted: done.filter(isReversed).length,
          packages: sum(items.map((o) => o.onhold_order_count)),
        };
      },
    );
    const sorted = rows.sort((a, b) => b[order] - a[order]);
    return wait({ count: sorted.length, results: sorted });
  },
};