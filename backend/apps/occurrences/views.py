from datetime import timedelta

from django.db.models import Count, IntegerField, OuterRef, Subquery
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.accounts.access import AccessScope
from apps.accounts.models import StationMember, is_valid_phone, normalize_phone
from apps.treatments.models import ContactAttempt
from apps.treatments.whatsapp import build_whatsapp_url, render_message

from .filters import OccurrenceFilter
from .insights import build_insights, kpis
from .recurrence import ENTITIES, ORDERINGS, build_recurrence
from .models import Occurrence, Queue
from .serializers import OccurrenceSerializer, QueueSerializer, TreatmentSerializer, TreatmentWriteSerializer

RECURRENCE_WINDOW_DAYS = 30


def _recurrence_subquery():
    since = timezone.localdate() - timedelta(days=RECURRENCE_WINDOW_DAYS)

    return Coalesce(
        Subquery(
            operational_occurrences()
            .filter(
                shop_id=OuterRef("shop_id"),
                queue_id=OuterRef("queue_id"),
                occurrence_date__gte=since,
            )
            .values("shop_id")
            .annotate(n=Count("occurrence_date", distinct=True))
            .values("n")[:1],
            output_field=IntegerField(),
        ),
        0,
    )



class QueueViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Queue.objects.filter(is_active=True).prefetch_related("options")
    serializer_class = QueueSerializer
    lookup_field = "slug"
    pagination_class = None
    filter_backends: list = []


class OccurrenceViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = OccurrenceSerializer
    filterset_class = OccurrenceFilter

    def get_queryset(self):
        contacts = ContactAttempt.objects.filter(occurrence_id=OuterRef("pk"))
        return (Occurrence.objects
                .select_related("queue", "treatment__reversal", "treatment__justification")
                .annotate(
                    recurrence_days=_recurrence_subquery(),
                    contact_count=Coalesce(Subquery(
                        contacts.order_by().values("occurrence_id").annotate(c=Count("id")).values("c")[:1],
                        output_field=IntegerField()), 0),
                    last_contact_at=Subquery(contacts.order_by("-sent_at").values("sent_at")[:1]),
                    last_contact_by=Subquery(contacts.order_by("-sent_at").values("member_name")[:1]),
                ))

    def _plain_filtered(self):
        """Mesmos filtros da lista, sem anotações (agregações) e sem ordenação."""
        params = self.request.query_params.copy()
        params.pop("ordering", None)
        return OccurrenceFilter(params, queryset=Occurrence.objects.all()).qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["scope"] = AccessScope(self.request.user)
        return ctx

    def _require_treat(self, occ):
        if not AccessScope(self.request.user).can_treat(occ.station_code, occ.regional):
            raise PermissionDenied("Você não está cadastrado nesta station.")

    @action(detail=False, methods=["get"], url_path="filter-options", filter_backends=[], pagination_class=None)
    def filter_options(self, request):
        """Pares regional/station existentes, para popular os filtros (independe da paginação)."""
        rows = (Occurrence.objects.order_by("regional", "station_code")
                .values("regional", "station_code").distinct())
        return Response(list(rows))

    @action(detail=False, methods=["get"])
    def summary(self, request):
        return Response(kpis(self._plain_filtered()))

    @action(detail=False, methods=["get"], filter_backends=[], pagination_class=None)
    def insights(self, request):
        return Response(build_insights(self._plain_filtered()))

    @action(detail=False, methods=["get"], filter_backends=[], pagination_class=None)
    def recurrence(self, request):
        """Ranking de reincidência por seller, motorista ou rota, no recorte filtrado."""
        entity = request.query_params.get("entity", "seller")
        if entity not in ENTITIES:
            return Response({"detail": f"entity deve ser um de: {', '.join(ENTITIES)}."}, status=400)
        order = request.query_params.get("order", "days")
        if order not in ORDERINGS:
            return Response({"detail": f"order deve ser um de: {', '.join(ORDERINGS)}."}, status=400)

        def clamp(name, default, low, high):
            try:
                return min(max(int(request.query_params.get(name, default)), low), high)
            except ValueError:
                return default

        return Response(build_recurrence(
            self._plain_filtered(), entity, clamp("min_days", 2, 1, 60), order, clamp("limit", 50, 1, 200)))

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        occ = self.get_object()
        return Response([
            {"sent_by": c.sent_by, "member_name": c.member_name, "sent_at": c.sent_at}
            for c in occ.contacts.all()
        ])

    @action(detail=True, methods=["put"])
    def treatment(self, request, pk=None):
        occ = self.get_object()
        self._require_treat(occ)
        ser = TreatmentWriteSerializer(data=request.data, context={"occurrence": occ})
        ser.is_valid(raise_exception=True)
        treatment = ser.save(treated_by=request.user.email)
        return Response(TreatmentSerializer(treatment).data)

    @action(detail=True, methods=["get"], url_path="contact-options")
    def contact_options(self, request, pk=None):
        occ = self.get_object()
        self._require_treat(occ)
        me = (request.user.email or "").lower()
        members = StationMember.objects.filter(station_code=occ.station_code, is_active=True)
        return Response([
            {"id": m.id, "name": m.name, "phone_ok": m.phone_ok, "is_me": m.email == me}
            for m in members
        ])

    @action(detail=True, methods=["post"])
    def contact(self, request, pk=None):
        occ = self.get_object()
        self._require_treat(occ)

        template = getattr(occ.queue, "message_template", None) if occ.queue_id else None
        if template is None:
            return Response({"detail": "Fila sem template de mensagem."}, status=400)
        try:
            member = StationMember.objects.get(
                pk=request.data.get("member_id"), station_code=occ.station_code, is_active=True)
        except (StationMember.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "Membro inválido para esta station."}, status=400)
        if not member.phone_ok:
            return Response({"detail": "Membro sem telefone válido cadastrado."}, status=400)
        driver_phone = normalize_phone(occ.driver_phone)
        if not is_valid_phone(driver_phone):
            return Response({"detail": "Driver sem telefone válido."}, status=400)

        message = render_message(template.body, occ, member)
        attempt = ContactAttempt.objects.create(
            occurrence=occ, sent_by=request.user.email, member=member,
            member_name=member.name, member_phone=member.phone, message=message)
        return Response({
            "attempt_id": attempt.id,
            "message": message,
            "whatsapp_url": build_whatsapp_url(driver_phone, message),
        }, status=status.HTTP_201_CREATED)
