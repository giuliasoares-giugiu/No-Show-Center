import django_filters as df
from django.db.models import Q

from apps.occurrences.filters import CharInFilter

from .models import Treatment


class TreatmentFilter(df.FilterSet):
    """Aqui date_from/date_to são a data da TRATATIVA (não a da ocorrência): a tela é o registro do que foi feito."""

    queue = df.CharFilter(field_name="occurrence__queue__slug")
    regional = CharInFilter(field_name="occurrence__regional")
    station_code = CharInFilter(field_name="occurrence__station_code")
    date_from = df.DateFilter(field_name="created_at", lookup_expr="date__gte")
    date_to = df.DateFilter(field_name="created_at", lookup_expr="date__lte")
    reversal = df.NumberFilter(field_name="reversal_id")
    reversed = df.BooleanFilter(field_name="reversal__counts_as_reversed")
    justification = df.NumberFilter(field_name="justification_id")
    treated_by = df.CharFilter(field_name="treated_by", lookup_expr="iexact")
    shop_id = df.CharFilter(field_name="occurrence__shop_id")
    driver_id = df.NumberFilter(field_name="occurrence__driver_id")
    search = df.CharFilter(method="filter_search")
    ordering = df.OrderingFilter(fields=(
        ("created_at", "treated_at"), ("occurrence__onhold_order_count", "packages"),
    ))

    class Meta:
        model = Treatment
        fields: list = []

    def filter_search(self, qs, name, value):
        value = value.strip()
        if not value:
            return qs
        q = (Q(occurrence__seller_name__icontains=value) | Q(occurrence__driver_name__icontains=value)
             | Q(treated_by__icontains=value) | Q(occurrence__route_name__icontains=value))
        q |= Q(occurrence__shop_id=value) | Q(occurrence__pickup_task_id=value)
        if value.isdigit():
            q |= Q(occurrence__driver_id=int(value))
        return qs.filter(q)
