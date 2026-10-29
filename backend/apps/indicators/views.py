from django.conf import settings
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.access import AccessScope
from apps.occurrences.filters import OccurrenceFilter
from apps.occurrences.models import Occurrence

from . import services


class CanSeeIndicators(BasePermission):
    """Performance individual é mais sensível que a fila: INDICATORS_RESTRICTED=1 limita à coordenação."""

    message = "Esta tela é restrita à coordenação."

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if not getattr(settings, "INDICATORS_RESTRICTED", False):
            return True
        scope = AccessScope(request.user)
        return scope.is_admin or bool(scope.regionals)


class IndicatorView(APIView):
    permission_classes = [CanSeeIndicators]

    def base(self, request):
        params = request.query_params.copy()
        params.pop("ordering", None)
        return services.no_show_only(OccurrenceFilter(params, queryset=Occurrence.objects.all()).qs)

    def _clamp(self, request, name, default, low, high):
        try:
            return min(max(int(request.query_params.get(name, default)), low), high)
        except ValueError:
            return default


class OverviewView(IndicatorView):
    def get(self, request):
        return Response(services.overview(self.base(request)))


class DispatchersView(IndicatorView):
    def get(self, request):
        order = request.query_params.get("order", "routes")
        if order not in services.DISPATCHER_ORDERS:
            return Response({"detail": f"order deve ser um de: {', '.join(services.DISPATCHER_ORDERS)}."}, status=400)
        return Response(services.dispatchers(self.base(request), order, self._clamp(request, "limit", 100, 1, 500)))


class DriversView(IndicatorView):
    def get(self, request):
        order = request.query_params.get("order", "occurrences")
        if order not in services.DRIVER_ORDERS:
            return Response({"detail": f"order deve ser um de: {', '.join(services.DRIVER_ORDERS)}."}, status=400)
        group_by = request.query_params.get("group_by", "shop")
        if group_by not in ("shop", "group"):
            return Response({"detail": "group_by deve ser um de: shop, group."}, status=400)
        return Response(services.drivers(self.base(request), order, self._clamp(request, "limit", 100, 1, 500), group_by))
