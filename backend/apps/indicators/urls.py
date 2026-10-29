from django.urls import path

from .views import DispatchersView, DriversView, OverviewView

urlpatterns = [
    path("indicators/overview/", OverviewView.as_view()),
    path("indicators/dispatchers/", DispatchersView.as_view()),
    path("indicators/drivers/", DriversView.as_view()),
]
