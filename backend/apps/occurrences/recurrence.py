"""Recorrência: quem aparece em mais de um dia no recorte (sellers, motoristas e rotas)."""
from django.db.models import Count, Max, Min, Q, Sum

PENDING = Q(treatment__isnull=True)
TREATED = Q(treatment__isnull=False)
OUT_RADIUS = Q(raio="Fora do raio")
OUT_HOURS = Q(horario_funcionamento__startswith="Fora")

ORDERINGS = {
    "days": ("-days", "-occurrences"),
    "occurrences": ("-occurrences", "-days"),
    "pending": ("-pending", "-days"),
    "packages": ("-packages", "-days"),
}

# entidade -> (campo-chave, campo-nome, agregado "relacionado" que faz sentido mostrar)
ENTITIES = {
    "seller": ("shop_id", "seller_name", ("related", Count("driver_id", distinct=True))),
    "driver": ("driver_id", "driver_name", ("related", Count("shop_id", distinct=True))),
    "route": ("route_name", "route_name", ("related", Count("driver_id", distinct=True))),
    # Consolida os PUPs do mesmo seller ("1234", "1234_001"...). O nome exibido é o de um dos PUPs do grupo.
    "seller_group": ("seller_group", "seller_name", ("related", Count("driver_id", distinct=True))),
}


def build_recurrence(qs, entity: str, min_days: int, order: str, limit: int) -> dict:
    key, name_field, (rel_name, rel_agg) = ENTITIES[entity]
    base = qs.exclude(**{f"{key}__isnull": True})
    if entity == "route":
        base = base.exclude(route_name="")
    elif entity == "seller_group":
        base = base.exclude(seller_group="")

    grouped = (
        base.values(key)
        .annotate(
            label=Max(name_field),
            station=Max("station_code"),
            stations_n=Count("station_code", distinct=True),
            pickups_n=Count("pickup_point_id", distinct=True, filter=~Q(pickup_point_id="")),
            days=Count("occurrence_date", distinct=True),
            occurrences=Count("id"),
            pending=Count("id", filter=PENDING),
            treated=Count("id", filter=TREATED),
            packages=Sum("onhold_order_count"),
            first_date=Min("occurrence_date"),
            last_date=Max("occurrence_date"),
            out_radius=Count("id", filter=OUT_RADIUS),
            out_hours=Count("id", filter=OUT_HOURS),
            reversed_n=Count("id", filter=Q(treatment__reversal__counts_as_reversed=True)),
            **{rel_name: rel_agg},
        )
        .filter(days__gte=min_days)
    )
    total = grouped.count()
    rows = [
        {
            "entity": entity,
            "key": str(r[key]),
            "name": r["label"] or str(r[key]),
            "station_code": r["station"],
            "stations": r["stations_n"],
            "pickup_points": r["pickups_n"],
            "related": r["related"],
            "days": r["days"],
            "occurrences": r["occurrences"],
            "pending": r["pending"],
            "treated": r["treated"],
            "reversed": r["reversed_n"],
            "packages": r["packages"] or 0,
            "first_date": r["first_date"].isoformat(),
            "last_date": r["last_date"].isoformat(),
            "out_radius": r["out_radius"],
            "out_hours": r["out_hours"],
        }
        for r in grouped.order_by(*ORDERINGS[order])[:limit]
    ]
    return {"entity": entity, "count": total, "results": rows}
