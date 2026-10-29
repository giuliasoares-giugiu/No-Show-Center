import { useCallback, useEffect, useState } from "react";
import { todayISO } from "../format";
import type { OccurrenceFilters, Ordering, Queue } from "../types";

const ORDERINGS: Ordering[] = ["-date", "-packages", "-recurrence"];

const defaults = (): OccurrenceFilters => ({
  queue: "", regional: "", stations: [], treated: "false", search: "",
  date_from: todayISO(-7), date_to: todayISO(), page: 1, ordering: "-date",
});

// Os filtros vivem na URL: dá para mandar o link de uma visão filtrada para outra pessoa.
function readUrl(): OccurrenceFilters {
  const d = defaults();
  const p = new URLSearchParams(window.location.search);
  const treated = p.get("treated");
  const ordering = p.get("order") as Ordering | null;
  return {
    ...d,
    queue: p.get("queue") ?? d.queue,
    regional: p.get("regional") ?? "",
    stations: p.get("stations")?.split(",").filter(Boolean) ?? [],
    treated: treated === "all" ? "" : treated === "true" ? "true" : "false",
    search: p.get("q") ?? "",
    date_from: p.get("from") ?? d.date_from,
    date_to: p.get("to") ?? d.date_to,
    ordering: ordering && ORDERINGS.includes(ordering) ? ordering : d.ordering,
  };
}

function writeUrl(f: OccurrenceFilters) {
  const d = defaults();
  const p = new URLSearchParams();
  if (f.queue) p.set("queue", f.queue);
  if (f.regional) p.set("regional", f.regional);
  if (f.stations.length) p.set("stations", f.stations.join(","));
  if (f.treated !== d.treated) p.set("treated", f.treated === "" ? "all" : f.treated);
  if (f.search) p.set("q", f.search);
  if (f.date_from !== d.date_from) p.set("from", f.date_from);
  if (f.date_to !== d.date_to) p.set("to", f.date_to);
  if (f.ordering !== d.ordering) p.set("order", f.ordering);
  const qs = p.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
}

export function useFilters(queues: Queue[]) {
  const [filters, setFilters] = useState<OccurrenceFilters>(readUrl);
  const [searchInput, setSearchInput] = useState(filters.search);

  useEffect(() => {
    if (queues.length && !queues.some((q) => q.slug === filters.queue)) {
      setFilters((f) => ({ ...f, queue: queues[0].slug }));
    }
  }, [queues, filters.queue]);

  useEffect(() => {
    const id = setTimeout(
      () => setFilters((f) => (f.search === searchInput.trim() ? f : { ...f, search: searchInput.trim(), page: 1 })),
      300,
    );
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => writeUrl(filters), [filters]);

  const update = useCallback(
    (patch: Partial<OccurrenceFilters>) => setFilters((f) => ({ ...f, page: 1, ...patch })),
    [],
  );
  const setPage = useCallback((page: number) => setFilters((f) => ({ ...f, page })), []);

  return { filters, update, setPage, searchInput, setSearchInput };
}
