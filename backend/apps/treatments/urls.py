from rest_framework.routers import DefaultRouter

from .views import TreatmentLogViewSet

router = DefaultRouter()
router.register("treatments", TreatmentLogViewSet, basename="treatment-log")
urlpatterns = router.urls
