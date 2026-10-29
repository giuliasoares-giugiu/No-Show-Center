"""Agregações do painel de insights. Todas recebem um queryset já filtrado (mesmos filtros da fila)."""
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.db.models import Avg, Count, DurationField, Exists, ExpressionWrapper, F, Max, OuterRef, Q, Sum
from django.db.models.functions import ExtractHour
from django.utils import timezone

from apps.treatments.models import ContactAttempt

TZ = ZoneInfo("America/Sao_Paulo")
OUT_RADIUS = Q(raio="Fora do raio")
OUT_HOURS = Q(horario_funcionamento="Fora do horário de funcionamento")
PENDING = Q(treatment__isnull=True)
TREATED = Q(treatment__isnull=False)


def kpis(qs) -> dict:
    agg = qs.aggregate(
        total=Count("id"),
        treated=Count("id", filter=TREATED),
        pending=Count("id", filter=PENDING),
        packages_pending=Sum("onhold_order_count", filter=PENDING),
    )
    no_contact = (qs.filter(PENDING)
                  .filter(~Exists(ContactAttempt.objects.filter(occurrence_id=OuterRef("pk"))))
                  .count())
    avg = (qs.filter(TREATED, occurred_at__isnull=False)
           .aggregate(v=Avg(ExpressionWrapper(F("treatment__created_at") - F("occurred_at"),
                                              output_field=DurationField())))["v"])
    reversed_n = qs.filter(TREATED, treatment__reversal__counts_as_reversed=True).count()
    treated = agg["treated"]
    return {
        "total": agg["total"],
        "treated": treated,
        "pending": agg["pending"],
        "no_contact": no_contact,
        "packages_pending": agg["packages_pending"] or 0,
        "avg_hours_to_treat": round(max(avg.total_seconds() / 3600, 0), 1) if avg else None,
        "reversal_rate": round(reversed_n / treated, 4) if treated else None,
    }


def build_insights(qs) -> dict:
    today = timezone.localdate()
    pending = qs.filter(PENDING)

    daily = (qs.values("occurrence_date")
             .annotate(total=Count("id"), treated=Count("id", filter=TREATED))
             .order_by("occurrence_date"))

    aging = pending.aggregate(
        d0=Count("id", filter=Q(occurrence_date=today)),
        d1_2=Count("id", filter=Q(occurrence_date__gte=today - timedelta(days=2),
                                  occurrence_date__lte=today - timedelta(days=1))),
        d3_6=Count("id", filter=Q(occurrence_date__gte=today - timedelta(days=6),
                                  occurrence_date__lte=today - timedelta(days=3))),
        d7p=Count("id", filter=Q(occurrence_date__lte=today - timedelta(days=7))),
    )

    cause = qs.aggregate(
        raio_only=Count("id", filter=OUT_RADIUS & ~OUT_HOURS),
        horario_only=Count("id", filter=OUT_HOURS & ~OUT_RADIUS),
        both=Count("id", filter=OUT_RADIUS & OUT_HOURS),
        other=Count("id", filter=~OUT_RADIUS & ~OUT_HOURS),
    )

    treated = qs.filter(TREATED)
    reversal = [
        {"label": r["label"], "count": r["n"], "reversed": r["reversed"]}
        for r in (treated.values(label=F("treatment__reversal__label"), reversed=F("treatment__reversal__counts_as_reversed"))
                  .annotate(n=Count("id")).order_by("-n"))
    ]
    justifications = [
        {"label": r["label"], "count": r["n"]}
        for r in (treated.values(label=F("treatment__justification__label"))
                  .annotate(n=Count("id")).order_by("-n"))
    ]

    stations = [
        {"station_code": r["station_code"], "regional": r["regional"], "total": r["total"],
         "pending": r["pending"], "treated": r["treated"], "packages_pending": r["packages"] or 0}
        for r in (qs.values("station_code", "regional")
                  .annotate(total=Count("id"), pending=Count("id", filter=PENDING),
                            treated=Count("id", filter=TREATED),
                            packages=Sum("onhold_order_count", filter=PENDING))
                  .order_by("-pending", "-total", "station_code")[:50])
    ]

    repeat_sellers = [
        {"shop_id": r["shop_id"], "name": r["name"], "days": r["days"],
         "occurrences": r["occurrences"], "pending": r["pending"]}
        for r in (qs.values("shop_id")
                  .annotate(name=Max("seller_name"), days=Count("occurrence_date", distinct=True),
                            occurrences=Count("id"), pending=Count("id", filter=PENDING))
                  .filter(days__gte=2).order_by("-days", "-occurrences")[:10])
    ]
    repeat_drivers = [
        {"driver_id": r["driver_id"], "name": r["name"], "station_code": r["station"], "days": r["days"],
         "occurrences": r["occurrences"], "pending": r["pending"]}
        for r in (qs.filter(driver_id__isnull=False).values("driver_id")
                  .annotate(name=Max("driver_name"), station=Max("station_code"),
                            days=Count("occurrence_date", distinct=True),
                            occurrences=Count("id"), pending=Count("id", filter=PENDING))
                  .filter(occurrences__gte=2).order_by("-occurrences", "-days")[:10])
    ]

    by_hour = [0] * 24
    for r in (qs.filter(occurred_at__isnull=False)
              .annotate(h=ExtractHour("occurred_at", tzinfo=TZ)).values("h").annotate(n=Count("id"))):
        by_hour[r["h"]] = r["n"]

    return {
        "kpis": kpis(qs),
        "daily": [{"date": d["occurrence_date"].isoformat(), "total": d["total"], "treated": d["treated"]} for d in daily],
        "aging": aging,
        "cause": cause,
        "reversal": reversal,
        "justifications": justifications,
        "stations": stations,
        "repeat_sellers": repeat_sellers,
        "repeat_drivers": repeat_drivers,
        "by_hour": by_hour,
    }
