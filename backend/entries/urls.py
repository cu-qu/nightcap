from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    CalendarView,
    ChartsView,
    DashboardView,
    DayReflectionDetailView,
    EntryViewSet,
    ExportView,
    NightCapViewSet,
    RitualView,
)

router = DefaultRouter()
router.register("entries", EntryViewSet, basename="entry")
router.register("nightcaps", NightCapViewSet, basename="nightcap")

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("export/", ExportView.as_view(), name="export"),
    path("ritual/", RitualView.as_view(), name="ritual"),
    path(
        "day-reflections/<str:reflection_date>/",
        DayReflectionDetailView.as_view(),
        name="day-reflection-detail",
    ),
    path("calendar/", CalendarView.as_view(), name="calendar"),
    path("charts/", ChartsView.as_view(), name="charts"),
]
urlpatterns += router.urls
