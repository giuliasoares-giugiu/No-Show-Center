import csv

from django.db.models import Avg, Count, ExpressionWrapper, F, DurationField, IntegerField, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce, TruncDate
from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .filters import TreatmentFilter
from .models import ContactAttempt, Treatment

REVERSED = Q(reversal__counts_as_reversed=True)


def _hours_to_treat(t):
    occurred = t.occurrence.occurred_at
    if not occurred:
        return None
    return round(max((t.created_at - occurred).total_seconds() / 3600, 0), 1)


class TreatmentLogSerializer(serializers.ModelSerializer):
    treated_at = serializers.DateTimeField(source="created_at")
    reversal_label = serializers.CharField(source="reversal.label")
    reversed = serializers.BooleanField(source="reversal.counts_as_reversed")
    justification_label = serializers.CharField(source="justification.label")
    occurrence_id = serializers.IntegerField(source="occurrence.id")
    pickup_task_id = serializers.CharField(source="occurrence.pickup_task_id")
    occurrence_date = serializers.DateField(source="occurrence.occurrence_date")
    occurred_at = serializers.DateTimeField(source="occurrence.occurred_at")
    fault_type = serializers.CharField(source="occurrence.fault_type")
    seller_name = serializers.CharField(source="occurrence.seller_name")
    shop_id = serializers.CharField(source="occurrence.shop_id")
    station_code = serializers.CharField(source="occurrence.station_code")
    regional = serializers.CharField(source="occurrence.regional")
    driver_id = serializers.IntegerField(source="occurrence.driver_id")
    driver_name = serializers.CharField(source="occurrence.driver_name")
    route_name = serializers.CharField(source="occurrence.route_name")
    allocated_by = serializers.CharField(source="occurrence.allocated_by")
    onhold_order_count = serializers.IntegerField(source="occurrence.onhold_order_count")
    raio = serializers.CharField(source="occurrence.raio")
    horario_funcionamento = serializers.CharField(source="occurrence.horario_funcionamento")
    contact_count = serializers.IntegerField(read_only=True)
    hours_to_treat = serializers.SerializerMethodField()

    class Meta:
        model = Treatment
        fields = [
            "id", "treated_at", "updated_at", "treated_by", "reversal_label", "reversed", "justification_label",
            "justification_text", "occurrence_id", "pickup_task_id", "occurrence_date", "occurred_at", "fault_type",
            "seller_name", "shop_id", "station_code", "regional", "driver_id", "driver_name", "route_name",
            "allocated_by", "onhold_order_count", "raio", "horario_funcionamento", "contact_count", "hours_to_treat",
        ]

    def get_hours_to_treat(self, obj):
        return _hours_to_treat(obj)


class _Echo:
    def write(self, value):
        return value


def _safe_cell(value):
    """Neutraliza injeção de fórmula: o CSV é aberto no Excel e nomes de seller vêm de fora."""
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


class TreatmentLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Registro do que foi tratado. Visível a qualquer usuário logado (como o painel); sem telefones."""

    serializer_class = TreatmentLogSerializer
    filterset_class = TreatmentFilter

    def get_queryset(self):
        contacts = ContactAttempt.objects.filter(occurrence_id=OuterRef("occurrence_id"))
        return (Treatment.objects
                .select_related("occurrence", "reversal", "justification")
                .annotate(contact_count=Coalesce(Subquery(
                    contacts.order_by().values("occurrence_id").annotate(c=Count("id")).values("c")[:1],
                    output_field=IntegerField()), 0))
                .order_by("-created_at", "-id"))

    def _plain_filtered(self):
        params = self.request.query_params.copy()
        params.pop("ordering", None)
        return TreatmentFilter(params, queryset=Treatment.objects.all()).qs

    @action(detail=False, methods=["get"], filter_backends=[], pagination_class=None)
    def summary(self, request):
        qs = self._plain_filtered()
        total = qs.count()
        reversed_n = qs.filter(REVERSED).count()
        avg = qs.filter(occurrence__occurred_at__isnull=False).aggregate(v=Avg(ExpressionWrapper(
            F("created_at") - F("occurrence__occurred_at"), output_field=DurationField())))["v"]
        return Response({
            "total": total,
            "reversed": reversed_n,
            "reversal_rate": round(reversed_n / total, 4) if total else None,
            "avg_hours_to_treat": round(max(avg.total_seconds() / 3600, 0), 1) if avg else None,
            "by_reversal": [
                {"id": r["option_id"], "label": r["label"], "count": r["n"], "reversed": r["reversed"]}
                for r in (qs.values(option_id=F("reversal_id"), label=F("reversal__label"), reversed=F("reversal__counts_as_reversed"))
                          .annotate(n=Count("id")).order_by("-n"))
            ],
            "by_justification": [
                {"id": r["option_id"], "label": r["label"], "count": r["n"]}
                for r in (qs.values(option_id=F("justification_id"), label=F("justification__label"))
                          .annotate(n=Count("id")).order_by("-n"))
            ],
            "by_user": [
                {"treated_by": r["treated_by"], "count": r["n"], "reversed": r["rev"]}
                for r in (qs.values("treated_by").annotate(n=Count("id"), rev=Count("id", filter=REVERSED))
                          .order_by("-n")[:15])
            ],
            "by_day": [
                {"date": r["d"].isoformat(), "count": r["n"]}
                for r in qs.annotate(d=TruncDate("created_at")).values("d").annotate(n=Count("id")).order_by("d")
            ],
        })

    @action(detail=False, methods=["get"], filter_backends=[], pagination_class=None)
    def export(self, request):
        qs = (self._plain_filtered()
              .select_related("occurrence", "reversal", "justification").order_by("-created_at", "-id")[:50_000])
        local = timezone.get_current_timezone()
        fmt = lambda dt: dt.astimezone(local).strftime("%d/%m/%Y %H:%M") if dt else ""
        header = ["Tratada em", "Tratada por", "Resultado", "Revertida", "Justificativa", "Detalhe",
                  "Data da ocorrência", "Hora da ocorrência", "Seller", "Shop ID", "Station", "Regional",
                  "Motorista", "Driver ID", "Rota", "Alocada por", "Pacotes", "Horas até tratar",
                  "Tipo de falha", "Raio", "Horário"]
        writer = csv.writer(_Echo(), delimiter=";")

        def rows():
            yield "\ufeff" + writer.writerow(header)  # BOM: o Excel reconhece UTF-8
            for t in qs:
                o = t.occurrence
                yield writer.writerow([_safe_cell(v) for v in [
                    fmt(t.created_at), t.treated_by, t.reversal.label, "Sim" if t.reversal.counts_as_reversed else "Não",
                    t.justification.label, t.justification_text, o.occurrence_date.strftime("%d/%m/%Y"),
                    fmt(o.occurred_at)[11:], o.seller_name, o.shop_id, o.station_code, o.regional, o.driver_name,
                    o.driver_id or "", o.route_name, o.allocated_by, o.onhold_order_count,
                    _hours_to_treat(t) if _hours_to_treat(t) is not None else "", o.fault_type, o.raio,
                    o.horario_funcionamento]])

        response = StreamingHttpResponse(rows(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="tratativas-{timezone.localdate().isoformat()}.csv"'
        return response
