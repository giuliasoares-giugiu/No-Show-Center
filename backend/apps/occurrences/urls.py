from rest_framework.routers import DefaultRouter

from .views import OccurrenceViewSet, QueueViewSet

router = DefaultRouter()
router.register("occurrences", OccurrenceViewSet, basename="occurrence")
router.register("queues", QueueViewSet, basename="queue")
urlpatterns = router.urls
