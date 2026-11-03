from django.urls import path
from . import views

urlpatterns = [
    path("health/", views.health),
    path("health/summary/", views.health_summary),
    path("ready/", views.ready),
    path("history/", views.history),
    path("forecast/latest/", views.forecast_latest),
    path("forecast/runs/", views.forecast_runs),
    path("predict/", views.predict),
    path("observations/", views.observations),
    path("models/compare/", views.model_compare),
    path("models/versions/", views.model_versions),
    path("models/retrain/", views.retrain),
]
