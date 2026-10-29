"""Indicadores de performance de dispatchers (monitores) e de drivers.

Escopo de todos os números: ocorrências de NO-SHOW (No Show Seller + No Show 3PL) dentro do recorte
filtrado (período pela data da ocorrência, regional, station). As ações (contatos, tratativas) contam
quando feitas SOBRE essas ocorrências, não importa o dia em que foram feitas.
"""
import unicodedata
from collections import defaultdict

from django.db.models import (
    Avg, Count, DurationField, ExpressionWrapper, F, IntegerField, Max, OuterRef, Q, Subquery, Sum)
from django.db.models.functions import Coalesce

from apps.accounts.models import StationMember
from apps.treatments.models import ContactAttempt, Treatment

SELLER_NO_SHOW = "No Show Seller"
DRIVER_NO_SHOW = "No Show 3PL"  # "no-show driver": o motorista não foi ao seller
NO_SHOW = (SELLER_NO_SHOW, DRIVER_NO_SHOW)
SPX_FAULT = "NSS SPX Fault"

TREATED = Q(treatment__isnull=False)
PENDING = Q(treatment__isnull=True)
REVERSED = Q(treatment__reversal__counts_as_reversed=True)

DISPATCHER_ORDERS = {
    "routes": lambda r: (-r["routes"], -r["messages"]),
    "messages": lambda r: (-r["messages"], -r["routes"]),
    "routes_reverted": lambda r: (-r["routes_reverted"], -r["routes"]),
    "slowest": lambda r: (-(r["avg_hours_to_treat"] or 0), -r["routes"]),
}
DRIVER_ORDERS = {
    "occurrences": lambda r: (-r["occurrences"], -r["days"]),
    "no_show_driver": lambda r: (-r["no_show_driver"], -r["occurrences"]),
    "repeat_sellers": lambda r: (-r["repeat_sellers"], -r["occurrences"]),
    "reverted": lambda r: (-r["reverted"], -r["occurrences"]),
    "packages": lambda r: (-r["packages"], -r["occurrences"]),
}

_RESOLUTION = ExpressionWrapper(F("created_at") - F("occurrence__occurred_at"), output_field=DurationField())


def no_show_only(qs):
    return qs.filter(seller_performance__in=NO_SHOW)


def norm(name: str) -> str:
    """Nome sem acento, caixa ou espaços repetidos: 'ANA  Dispatcher' == 'Ana Dispatcher'."""
    ascii_name = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode()
    return " ".join(ascii_name.lower().split())


def _hours(delta):
    return round(max(delta.total_seconds() / 3600, 0), 1) if delta else None


def overview(base) -> dict:
    occ = base.aggregate(
        occurrences=Count("id"),
        treated=Count("id", filter=TREATED),
        pending=Count("id", filter=PENDING),
        reverted=Count("id", filter=REVERSED),
        routes=Count("trip_id", distinct=True),
        routes_treated=Count("trip_id", distinct=True, filter=TREATED),
        routes_reverted=Count("trip_id", distinct=True, filter=REVERSED),
        driver_no_show=Count("id", filter=Q(seller_performance=DRIVER_NO_SHOW)),
        seller_no_show=Count("id", filter=Q(seller_performance=SELLER_NO_SHOW)),
    )
    contacts = ContactAttempt.objects.filter(occurrence__in=base).aggregate(
        messages=Count("id"), drivers_contacted=Count("occurrence__driver_id", distinct=True))
    treatments = Treatment.objects.filter(occurrence__in=base)
    avg = treatments.filter(occurrence__occurred_at__isnull=False).aggregate(v=Avg(_RESOLUTION))["v"]

    # Tentativas até o sucesso: acionamentos feitos até a tratativa que reverteu.
    before_success = (ContactAttempt.objects
                      .filter(occurrence_id=OuterRef("occurrence_id"), sent_at__lte=OuterRef("updated_at"))
                      .order_by().values("occurrence_id").annotate(c=Count("id")).values("c")[:1])
    reversed_t = (treatments.filter(reversal__counts_as_reversed=True)
                  .annotate(n=Coalesce(Subquery(before_success, output_field=IntegerField()), 0)))
    attempts = reversed_t.aggregate(
        avg=Avg("n"), total=Count("id"),
        zero=Count("id", filter=Q(n=0)), one=Count("id", filter=Q(n=1)),
        two=Count("id", filter=Q(n=2)), three_plus=Count("id", filter=Q(n__gte=3)))

    treated = occ["treated"]
    return {
        **occ,
        "reversal_rate": round(occ["reverted"] / treated, 4) if treated else None,
        "treated_rate": round(treated / occ["occurrences"], 4) if occ["occurrences"] else None,
        "messages": contacts["messages"],
        "drivers_contacted": contacts["drivers_contacted"],
        "avg_hours_to_treat": _hours(avg),
        "attempts": {
            "avg": round(attempts["avg"], 2) if attempts["avg"] is not None else None,
            "reversed_treatments": attempts["total"],
            "distribution": {k: attempts[k] for k in ("zero", "one", "two", "three_plus")},
        },
        # Participação em treinamentos: depende da tabela do time de treinamentos (Sheets, DS).
        "training": {"available": False},
    }


def dispatchers(base, order: str, limit: int) -> dict:
    """Une o que cada dispatcher TEM (rotas com no-show) ao que ele FEZ (acionamentos e tratativas).

    O vínculo é pelo **e-mail** quando a tabela do DS o traz (`dispatcher_email`, o responsável pelo motorista).
    Sem e-mail, cai no nome de quem alocou a rota (`allocated_by`), ligado ao membro da station pelo nome."""
    route_fields = dict(occurrences=Count("id"), routes=Count("trip_id", distinct=True),
                        routes_treated=Count("trip_id", distinct=True, filter=TREATED),
                        routes_reverted=Count("trip_id", distinct=True, filter=REVERSED),
                        pending=Count("id", filter=PENDING))
    email_rows = (base.exclude(dispatcher_email="").values("dispatcher_email")
                  .annotate(station=Max("station_code"), **route_fields))
    name_rows = (base.filter(dispatcher_email="").exclude(allocated_by="").values("allocated_by")
                 .annotate(station=Max("station_code"), **route_fields))
    contact_rows = (ContactAttempt.objects.filter(occurrence__in=base).values("sent_by")
                    .annotate(messages=Count("id"), drivers=Count("occurrence__driver_id", distinct=True),
                              contacted=Count("occurrence", distinct=True)))
    treat_rows = (Treatment.objects.filter(occurrence__in=base).values("treated_by")
                  .annotate(treated=Count("id"), reverted=Count("id", filter=Q(reversal__counts_as_reversed=True)),
                            avg=Avg(_RESOLUTION)))

    emails = ({r["sent_by"].lower() for r in contact_rows} | {r["treated_by"].lower() for r in treat_rows}
              | {r["dispatcher_email"].lower() for r in email_rows})
    member_name = {}
    for m in StationMember.objects.filter(email__in=emails).order_by("-is_active", "id"):
        member_name.setdefault(m.email, m.name)

    rows: dict = {}

    def new_row(key, name):
        return rows.setdefault(key, {
            "key": key, "name": name, "email": None, "station_code": "", "has_routes": False, "has_actions": False,
            "occurrences": 0, "routes": 0, "routes_treated": 0, "routes_reverted": 0, "pending": 0,
            "messages": 0, "drivers_contacted": 0, "occurrences_contacted": 0,
            "treated_by_him": 0, "reverted_by_him": 0, "avg_hours_to_treat": None,
        })

    def add_routes(row, r):
        row["has_routes"] = True
        row["station_code"] = row["station_code"] or r["station"]
        for field in ("occurrences", "routes", "routes_treated", "routes_reverted", "pending"):
            row[field] += r[field]

    for r in email_rows:
        email = r["dispatcher_email"].lower()
        row = new_row(f"email:{email}", member_name.get(email) or email)
        row["email"] = email
        add_routes(row, r)
    for r in name_rows:
        # "Ana Dispatcher" e "ANA  dispatcher" são a mesma pessoa: as grafias se somam.
        add_routes(new_row(norm(r["allocated_by"]), r["allocated_by"]), r)

    def action_row(email):
        email = email.lower()
        key = f"email:{email}"
        name = member_name.get(email)
        if key in rows:
            row = rows[key]
        elif name and norm(name) in rows:   # ligação pelo nome (dados sem e-mail do dispatcher)
            row = rows[norm(name)]
        else:
            row = new_row(key, name or email)
        row["email"] = email
        row["has_actions"] = True
        return row

    for r in contact_rows:
        row = action_row(r["sent_by"])
        row["messages"] += r["messages"]
        row["drivers_contacted"] += r["drivers"]
        row["occurrences_contacted"] += r["contacted"]
    hours_parts = defaultdict(list)
    for r in treat_rows:
        row = action_row(r["treated_by"])
        row["treated_by_him"] += r["treated"]
        row["reverted_by_him"] += r["reverted"]
        if r["avg"] is not None:
            hours_parts[row["key"]].append((_hours(r["avg"]), r["treated"]))
    for key, parts in hours_parts.items():
        total = sum(n for _, n in parts)
        rows[key]["avg_hours_to_treat"] = round(sum(h * n for h, n in parts) / total, 1) if total else None

    result = sorted(rows.values(), key=DISPATCHER_ORDERS[order])
    return {"count": len(result), "results": result[:limit]}


def drivers(base, order: str, limit: int, group_by: str = "shop") -> dict:
    """`group_by`: "shop" conta sellers por shop_id (PUP/Shop); "group" consolida por seller group."""
    with_driver = base.filter(driver_id__isnull=False)
    by_group = group_by == "group"
    seller_key = "seller_group" if by_group else "shop_id"
    if by_group:
        with_driver = with_driver.exclude(seller_group="")  # sem grupo não dá para consolidar
    rows = (with_driver.values("driver_id")
            .annotate(label=Max("driver_name"), station=Max("station_code"),
                      stations_n=Count("station_code", distinct=True), days=Count("occurrence_date", distinct=True),
                      occurrences=Count("id"),
                      no_show_driver=Count("id", filter=Q(seller_performance=DRIVER_NO_SHOW)),
                      no_show_seller=Count("id", filter=Q(seller_performance=SELLER_NO_SHOW)),
                      spx_fault=Count("id", filter=Q(fault_type=SPX_FAULT)),
                      sellers=Count(seller_key, distinct=True),
                      pending=Count("id", filter=PENDING), treated=Count("id", filter=TREATED),
                      reverted=Count("id", filter=REVERSED), packages=Sum("onhold_order_count")))
    repeat = defaultdict(int)  # sellers com no-show em 2+ dias para o mesmo driver
    for p in (with_driver.values("driver_id", seller_key)
              .annotate(d=Count("occurrence_date", distinct=True)).filter(d__gte=2)):
        repeat[p["driver_id"]] += 1

    result = sorted(({
        "driver_id": r["driver_id"], "name": r["label"] or str(r["driver_id"]), "station_code": r["station"],
        "stations": r["stations_n"], "days": r["days"], "occurrences": r["occurrences"],
        "no_show_driver": r["no_show_driver"], "no_show_seller": r["no_show_seller"], "spx_fault": r["spx_fault"],
        "sellers": r["sellers"], "repeat_sellers": repeat.get(r["driver_id"], 0),
        "pending": r["pending"], "treated": r["treated"], "reverted": r["reverted"],
        "packages": r["packages"] or 0,
    } for r in rows), key=DRIVER_ORDERS[order])
    return {"count": len(result), "results": result[:limit]}
