from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path, re_path

from .spa import spa_index

urlpatterns = [
    path("admin/", admin.site.urls),
    path("healthz", lambda request: JsonResponse({"status": "ok"})),
    path("api/", include("apps.accounts.urls")),
    path("api/", include("apps.occurrences.urls")),
    path("api/", include("apps.treatments.urls")),
    path("api/", include("apps.indicators.urls")),
    # Sempre por último: qualquer rota do front sem extensão e fora de api/admin/static/assets/healthz.
    re_path(r"^(?!api/|admin/|static/|assets/|healthz)(?P<path>[^.]*)$", spa_index),
]
