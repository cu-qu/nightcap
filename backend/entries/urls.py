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
    RecapIndexView,
    RecapMonthView,
    RecapYearView,
    RitualSharedView,
    RitualView,
)

router = DefaultRouter()
router.register("entries", EntryViewSet, basename="entry")
router.register("nightcaps", NightCapViewSet, basename="nightcap")

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("export/", ExportView.as_view(), name="export"),
    path("ritual/shared/", RitualSharedView.as_view(), name="ritual-shared"),
    path("ritual/", RitualView.as_view(), name="ritual"),
    path(
        "day-reflections/<str:reflection_date>/",
        DayReflectionDetailView.as_view(),
        name="day-reflection-detail",
    ),
    path("calendar/", CalendarView.as_view(), name="calendar"),
    path("charts/", ChartsView.as_view(), name="charts"),
    path("recaps/month/", RecapMonthView.as_view(), name="recap-month"),
    path("recaps/year/", RecapYearView.as_view(), name="recap-year"),
    path("recaps/", RecapIndexView.as_view(), name="recap-index"),
]
urlpatterns += router.urls
