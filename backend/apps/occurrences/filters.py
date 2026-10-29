import django_filters as df
from django.db.models import Q

from .models import Occurrence


class CharInFilter(df.BaseInFilter, df.CharFilter):
    pass


class StableOrdering(df.OrderingFilter):
    """Ordena pelo critério escolhido e desempata por id (paginação estável)."""

    def filter(self, qs, value):
        qs = super().filter(qs, value)
        return qs.order_by(*qs.query.order_by, "-id") if value else qs


class OccurrenceFilter(df.FilterSet):
    regional = CharInFilter(field_name="regional")
    station_code = CharInFilter(field_name="station_code")
    queue = df.CharFilter(field_name="queue__slug")
    date_from = df.DateFilter(field_name="occurrence_date", lookup_expr="gte")
    date_to = df.DateFilter(field_name="occurrence_date", lookup_expr="lte")
    treated = df.BooleanFilter(method="filter_treated")
    search = df.CharFilter(method="filter_search")
    shop_id = df.CharFilter(field_name="shop_id")
    pickup_point_id = df.CharFilter(field_name="pickup_point_id")
    seller_group = df.CharFilter(field_name="seller_group")
    driver_id = df.NumberFilter(field_name="driver_id")
    route = df.CharFilter(field_name="route_name", lookup_expr="exact")
    ordering = StableOrdering(fields=(
        ("occurrence_date", "date"), ("onhold_order_count", "packages"), ("recurrence_days", "recurrence"),
    ))

    class Meta:
        model = Occurrence
        fields: list = []

    def filter_treated(self, qs, name, value):
        return qs.filter(treatment__isnull=not value)

    def filter_search(self, qs, name, value):
        value = value.strip()
        if not value:
            return qs
        q = Q(seller_name__icontains=value) | Q(driver_name__icontains=value) | Q(route_name__icontains=value)
        q |= Q(shop_id=value) | Q(pickup_point_id=value) | Q(seller_group=value) | Q(pickup_task_id=value)
        if value.isdigit():
            q |= Q(driver_id=int(value))
        return qs.filter(q)
