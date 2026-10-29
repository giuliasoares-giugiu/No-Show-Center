from django.urls import path

from .views import GoogleLoginView, LogoutView, MeView

urlpatterns = [
    path("auth/google/", GoogleLoginView.as_view()),
    path("auth/logout/", LogoutView.as_view()),
    path("me/", MeView.as_view()),
]
