import mimetypes
from calendar import monthrange
from datetime import date, datetime, timedelta
from pathlib import Path

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.http import FileResponse
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated

from core.permissions import HasActiveMembership
from rest_framework.response import Response
from rest_framework.views import APIView

from categories.models import TrackingCategory
from categories.serializers import TrackingCategorySerializer
from goals.services import compute_all_goal_progress

from .filters import EntryFilter
from .models import DayReflection, Entry, NightCap
from .serializers import (
    CalendarQuerySerializer,
    CalendarResponseSerializer,
    ChartQuerySerializer,
    ChartResponseSerializer,
    DailySummaryQuerySerializer,
    DashboardResponseSerializer,
    DayReflectionSerializer,
    EntrySerializer,
    ExportResponseSerializer,
    NightCapPhotoSerializer,
    NightCapListSerializer,
    NightCapSerializer,
    NightCapWriteSerializer,
    PeriodSummaryQuerySerializer,
    RecapIndexResponseSerializer,
    RecapMonthQuerySerializer,
    RecapMonthResponseSerializer,
    RecapYearQuerySerializer,
    RecapYearResponseSerializer,
    RitualRequestSerializer,
    RitualResponseSerializer,
    SharedRitualResponseSerializer,
)
from .recaps import build_month_recap, build_year_recap, list_available_recaps
from .services import (
    build_daily_summary,
    calendar_month,
    chart_series,
    finance_totals,
    get_or_create_nightcap,
    shared_ritual_hints,
    sync_day_reflection,
    upsert_ritual,
)


def _parse_path_date(value: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError) as exc:
        from rest_framework.exceptions import ValidationError

        raise ValidationError({"reflection_date": "Use YYYY-MM-DD."}) from exc


def _finance_totals(queryset):
    return finance_totals(queryset)


def _current_streak(user):
    dates = set(
        Entry.objects.filter(user=user)
        .annotate(entry_date=TruncDate("date"))
        .values_list("entry_date", flat=True)
    )
    cursor = timezone.localdate()
    streak = 0
    while cursor in dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _period_bounds(period: str, reference_date=None):
    reference_date = reference_date or timezone.localdate()
    if period == PeriodSummaryQuerySerializer.PERIOD_WEEKLY:
        start = reference_date - timedelta(days=reference_date.weekday())
        return start, start + timedelta(days=6)
    start = reference_date.replace(day=1)
    last_day = monthrange(reference_date.year, reference_date.month)[1]
    end = reference_date.replace(day=last_day)
    return start, end


@extend_schema_view(
    list=extend_schema(tags=["Entries"], summary="List entries"),
    create=extend_schema(tags=["Entries"], summary="Create entry"),
    retrieve=extend_schema(tags=["Entries"], summary="Get entry"),
    update=extend_schema(tags=["Entries"], summary="Update entry"),
    partial_update=extend_schema(tags=["Entries"], summary="Partially update entry"),
    destroy=extend_schema(tags=["Entries"], summary="Delete entry"),
)
class EntryViewSet(viewsets.ModelViewSet):
    serializer_class = EntrySerializer
    permission_classes = [IsAuthenticated, HasActiveMembership]
    queryset = Entry.objects.none()
    filterset_class = EntryFilter
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    search_fields = ["label", "notes", "category__name"]
    ordering_fields = ["date", "created_at", "updated_at", "amount", "quantity"]
    ordering = ["-date", "-created_at"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Entry.objects.none()
        return (
            Entry.objects.filter(user=self.request.user)
            .select_related("category")
            .order_by("-date", "-created_at")
        )

    def perform_create(self, serializer):
        nightcap = get_or_create_nightcap(self.request.user, serializer.validated_data["date"])
        serializer.save(user=self.request.user, nightcap=nightcap)

    @extend_schema(
        tags=["Entries"],
        summary="Daily entry summary",
        parameters=[
            OpenApiParameter(
                name="date",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Date to summarize, defaults to today (YYYY-MM-DD).",
            )
        ],
    )
    @action(detail=False, methods=["get"], url_path="daily-summary")
    def daily_summary(self, request):
        query = DailySummaryQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        selected_date = query.validated_data.get("date") or timezone.localdate()
        return Response(build_daily_summary(request.user, selected_date))

    @extend_schema(
        tags=["Entries"],
        summary="Category totals for weekly or monthly period",
        parameters=[
            OpenApiParameter(
                name="period",
                type=str,
                location=OpenApiParameter.QUERY,
                required=True,
                enum=["weekly", "monthly"],
            )
        ],
    )
    @action(detail=False, methods=["get"], url_path="period-summary")
    def period_summary(self, request):
        query = PeriodSummaryQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        period = query.validated_data["period"]
        start_date, end_date = _period_bounds(period)
        entries = self.get_queryset().filter(date__gte=start_date, date__lte=end_date)
        by_category = (
            entries.values(
                "category_id",
                "category__uuid",
                "category__name",
                "category__type",
                "category__metric_kind",
                "category__unit",
            )
            .annotate(
                entry_count=Count("id"),
                amount_total=Sum("amount"),
                quantity_total=Sum("quantity"),
            )
            .order_by("category__type", "category__name")
        )
        return Response(
            {
                "period": period,
                "start_date": start_date,
                "end_date": end_date,
                "entry_count": entries.count(),
                "finance_totals": _finance_totals(entries),
                "by_category": [
                    {
                        **row,
                        "amount_total": row["amount_total"],
                        "quantity_total": row["quantity_total"],
                        "category_uuid": str(row["category__uuid"])
                        if row.get("category__uuid")
                        else None,
                    }
                    for row in by_category
                ],
            }
        )


@extend_schema(
    tags=["Dashboard"],
    summary="Dashboard summary",
    responses={200: DashboardResponseSerializer},
)
class DashboardView(APIView):
    permission_classes = [IsAuthenticated, HasActiveMembership]

    def get(self, request):
        today = timezone.localdate()
        week_start = today - timedelta(days=today.weekday())
        week_entries = Entry.objects.filter(
            user=request.user,
            date__gte=week_start,
            date__lte=today,
        ).select_related("category")
        weekly_by_day = (
            week_entries.values("date")
            .annotate(
                entry_count=Count("id"),
                expense_total=Sum(
                    "amount",
                    filter=Q(category__type=TrackingCategory.FINANCE_EXPENSE),
                ),
                income_total=Sum(
                    "amount",
                    filter=Q(category__type=TrackingCategory.FINANCE_INCOME),
                ),
            )
            .order_by("date")
        )
        goals = [item.as_dict() for item in compute_all_goal_progress(request.user, today)]
        return Response(
            {
                "current_streak_days": _current_streak(request.user),
                "week": {
                    "start_date": week_start,
                    "end_date": today,
                    "days": list(weekly_by_day),
                },
                "totals": _finance_totals(week_entries),
                "entry_count": week_entries.count(),
                "goals": goals,
            }
        )


@extend_schema(
    tags=["Export"],
    summary="Export user data",
    request=None,
    responses={status.HTTP_200_OK: ExportResponseSerializer},
)
class ExportView(APIView):
    permission_classes = [IsAuthenticated, HasActiveMembership]

    def post(self, request):
        categories = TrackingCategory.objects.filter(user=request.user).order_by("type", "name")
        entries = Entry.objects.filter(user=request.user).select_related("category")
        return Response(
            {
                "generated_at": timezone.now(),
                "categories": TrackingCategorySerializer(categories, many=True).data,
                "entries": EntrySerializer(
                    entries,
                    many=True,
                    context={"request": request},
                ).data,
            }
        )


@extend_schema(
    tags=["Ritual"],
    summary="Save nightly ritual (batch upsert)",
    description=(
        "Creates/updates the NightCap for the date, upserts one entry per category, "
        "and optionally sets reflection. Prefer category groups from "
        "`GET /api/v1/category-groups/for-ritual/` for the UI layout."
    ),
    request=RitualRequestSerializer,
    responses={200: RitualResponseSerializer},
)
class RitualView(APIView):
    permission_classes = [IsAuthenticated, HasActiveMembership]

    def post(self, request):
        serializer = RitualRequestSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = upsert_ritual(
            request.user,
            ritual_date=data["date"],
            items=data.get("items") or [],
            reflection=data.get("reflection"),
            favorite_moment=data.get("favorite_moment"),
            mood=data.get("mood"),
            status=data.get("status"),
            replace_items=bool(data.get("replace_items")),
        )
        return Response(
            {
                "date": result["date"],
                "reflection": result["reflection"],
                "nightcap": NightCapListSerializer(
                    result["nightcap"], context={"request": request}
                ).data,
                "entries": EntrySerializer(
                    result["entries"], many=True, context={"request": request}
                ).data,
                "summary": result["summary"],
            }
        )


@extend_schema(
    tags=["Ritual"],
    summary="Partner values on Together categories",
    description=(
        "For the given NightCap date, returns the other partner's logged values "
        "on categories that have an active Together (shared) goal. Keyed to the "
        "current user's category UUIDs so the ritual UI can display them without "
        "overwriting local input."
    ),
    parameters=[
        OpenApiParameter(
            name="date",
            type=str,
            location=OpenApiParameter.QUERY,
            required=False,
            description="NightCap date, defaults to today (YYYY-MM-DD).",
        )
    ],
    responses={200: SharedRitualResponseSerializer},
)
class RitualSharedView(APIView):
    permission_classes = [IsAuthenticated, HasActiveMembership]

    def get(self, request):
        query = DailySummaryQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        ritual_date = query.validated_data.get("date") or timezone.localdate()
        payload = shared_ritual_hints(request.user, ritual_date)
        serializer = SharedRitualResponseSerializer(
            {"date": ritual_date, **payload}
        )
        return Response(serializer.data)


@extend_schema_view(
    list=extend_schema(tags=["NightCaps"], summary="List NightCaps"),
    create=extend_schema(tags=["NightCaps"], summary="Create or upsert NightCap"),
    retrieve=extend_schema(tags=["NightCaps"], summary="Get NightCap"),
    update=extend_schema(tags=["NightCaps"], summary="Update NightCap"),
    partial_update=extend_schema(tags=["NightCaps"], summary="Partially update NightCap"),
    destroy=extend_schema(tags=["NightCaps"], summary="Delete NightCap"),
)
class NightCapViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, HasActiveMembership]
    queryset = NightCap.objects.none()
    lookup_field = "date"
    lookup_value_regex = r"\d{4}-\d{2}-\d{2}"

    def get_serializer_class(self):
        if self.action == "retrieve":
            return NightCapSerializer
        if self.action == "create":
            return NightCapWriteSerializer
        return NightCapListSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return NightCap.objects.none()
        qs = NightCap.objects.filter(user=self.request.user).annotate(
            entry_count=Count("entries")
        )
        start = self.request.query_params.get("start_date")
        end = self.request.query_params.get("end_date")
        if start:
            qs = qs.filter(date__gte=start)
        if end:
            qs = qs.filter(date__lte=end)
        return qs.order_by("-date")

    def retrieve(self, request, *args, **kwargs):
        nightcap_date = _parse_path_date(str(kwargs["date"]))
        nightcap = get_or_create_nightcap(request.user, nightcap_date)
        nightcap = (
            NightCap.objects.filter(pk=nightcap.pk)
            .prefetch_related("entries__category")
            .first()
        )
        return Response(
            NightCapSerializer(nightcap, context={"request": request}).data
        )

    def create(self, request, *args, **kwargs):
        serializer = NightCapWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        nightcap = get_or_create_nightcap(request.user, data["date"])
        if "reflection" in data:
            nightcap.reflection = data["reflection"]
            sync_day_reflection(request.user, data["date"], data["reflection"])
        if "favorite_moment" in data:
            nightcap.favorite_moment = data.get("favorite_moment") or ""
        if "mood" in data:
            nightcap.mood = data.get("mood") or ""
        if data.get("status") == NightCap.STATUS_COMPLETED:
            nightcap.status = NightCap.STATUS_COMPLETED
            if nightcap.completed_at is None:
                nightcap.completed_at = timezone.now()
        elif data.get("status") == NightCap.STATUS_DRAFT:
            nightcap.status = NightCap.STATUS_DRAFT
            nightcap.completed_at = None
        nightcap.save()
        nightcap = NightCap.objects.filter(pk=nightcap.pk).annotate(
            entry_count=Count("entries")
        ).first()
        return Response(
            NightCapListSerializer(nightcap, context={"request": request}).data, status=status.HTTP_201_CREATED
        )

    def partial_update(self, request, *args, **kwargs):
        nightcap_date = _parse_path_date(str(kwargs["date"]))
        nightcap = get_or_create_nightcap(request.user, nightcap_date)
        reflection = request.data.get("reflection")
        nightcap_status = request.data.get("status")
        if reflection is not None:
            nightcap.reflection = reflection
            sync_day_reflection(request.user, nightcap.date, reflection)
        if "favorite_moment" in request.data:
            nightcap.favorite_moment = request.data.get("favorite_moment") or ""
        if "mood" in request.data:
            nightcap.mood = request.data.get("mood") or ""
        if nightcap_status == NightCap.STATUS_COMPLETED:
            nightcap.status = NightCap.STATUS_COMPLETED
            if nightcap.completed_at is None:
                nightcap.completed_at = timezone.now()
        elif nightcap_status == NightCap.STATUS_DRAFT:
            nightcap.status = NightCap.STATUS_DRAFT
            nightcap.completed_at = None
        nightcap.save()
        nightcap = (
            NightCap.objects.filter(pk=nightcap.pk)
            .prefetch_related("entries__category")
            .first()
        )
        return Response(
            NightCapSerializer(nightcap, context={"request": request}).data
        )

    def update(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

    @extend_schema(
        tags=["NightCaps"],
        summary="Favorite photo of the day",
        description=(
            "GET streams the saved photo. POST multipart field `photo` uploads "
            "or replaces it (JPEG/PNG/WebP, max 8 MB). DELETE removes it. "
            "Photos are private to the signed-in user."
        ),
        request={"multipart/form-data": NightCapPhotoSerializer},
        responses={200: NightCapSerializer, 204: None},
    )
    @action(detail=True, methods=["get", "post", "delete"], url_path="photo")
    def photo(self, request, date=None):
        nightcap_date = _parse_path_date(str(date))
        if request.method == "GET":
            nightcap = NightCap.objects.filter(
                user=request.user, date=nightcap_date
            ).first()
            if nightcap is None or not nightcap.favorite_photo:
                return Response(
                    {"detail": "No photo for this day."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            photo = nightcap.favorite_photo
            content_type = (
                mimetypes.guess_type(photo.name)[0] or "image/jpeg"
            )
            return FileResponse(
                photo.open("rb"),
                as_attachment=False,
                filename=Path(photo.name).name,
                content_type=content_type,
            )

        nightcap = get_or_create_nightcap(request.user, nightcap_date)
        if request.method == "DELETE":
            nightcap.clear_favorite_photo()
            nightcap = (
                NightCap.objects.filter(pk=nightcap.pk)
                .prefetch_related("entries__category")
                .first()
            )
            return Response(
                NightCapSerializer(nightcap, context={"request": request}).data
            )

        serializer = NightCapPhotoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        nightcap.set_favorite_photo(serializer.validated_data["photo"])
        nightcap = (
            NightCap.objects.filter(pk=nightcap.pk)
            .prefetch_related("entries__category")
            .first()
        )
        return Response(
            NightCapSerializer(nightcap, context={"request": request}).data
        )


@extend_schema(
    tags=["DayReflection"],
    summary="Get or update day reflection (legacy; prefer NightCaps)",
)
class DayReflectionDetailView(APIView):
    permission_classes = [IsAuthenticated, HasActiveMembership]

    def get_object(self, user, reflection_date):
        nightcap = get_or_create_nightcap(user, reflection_date)
        obj, _ = DayReflection.objects.get_or_create(
            user=user,
            date=reflection_date,
            defaults={"reflection": nightcap.reflection},
        )
        if obj.reflection != nightcap.reflection:
            obj.reflection = nightcap.reflection
            obj.save(update_fields=["reflection", "updated_at"])
        return obj

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="reflection_date",
                type=str,
                location=OpenApiParameter.PATH,
                description="Date in YYYY-MM-DD.",
            )
        ],
        responses={200: DayReflectionSerializer},
    )
    def get(self, request, reflection_date):
        obj = self.get_object(request.user, _parse_path_date(reflection_date))
        return Response(DayReflectionSerializer(obj).data)

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="reflection_date",
                type=str,
                location=OpenApiParameter.PATH,
                description="Date in YYYY-MM-DD.",
            )
        ],
        request=DayReflectionSerializer,
        responses={200: DayReflectionSerializer},
    )
    def put(self, request, reflection_date):
        parsed = _parse_path_date(reflection_date)
        obj = self.get_object(request.user, parsed)
        serializer = DayReflectionSerializer(
            obj, data={**request.data, "date": parsed.isoformat()}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user, date=parsed)
        nightcap = get_or_create_nightcap(request.user, parsed)
        nightcap.reflection = serializer.instance.reflection
        nightcap.save(update_fields=["reflection", "updated_at"])
        return Response(serializer.data)

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="reflection_date",
                type=str,
                location=OpenApiParameter.PATH,
                description="Date in YYYY-MM-DD.",
            )
        ],
        request=DayReflectionSerializer,
        responses={200: DayReflectionSerializer},
    )
    def patch(self, request, reflection_date):
        parsed = _parse_path_date(reflection_date)
        obj = self.get_object(request.user, parsed)
        serializer = DayReflectionSerializer(
            obj, data={**request.data, "date": parsed.isoformat()}, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user, date=parsed)
        nightcap = get_or_create_nightcap(request.user, parsed)
        nightcap.reflection = serializer.instance.reflection
        nightcap.save(update_fields=["reflection", "updated_at"])
        return Response(serializer.data)


@extend_schema(
    tags=["Calendar"],
    summary="Month calendar markers",
    parameters=[
        OpenApiParameter(name="year", type=int, location=OpenApiParameter.QUERY, required=False),
        OpenApiParameter(name="month", type=int, location=OpenApiParameter.QUERY, required=False),
    ],
    responses={200: CalendarResponseSerializer},
)
class CalendarView(APIView):
    permission_classes = [IsAuthenticated, HasActiveMembership]

    def get(self, request):
        query = CalendarQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        today = timezone.localdate()
        year = query.validated_data.get("year") or today.year
        month = query.validated_data.get("month") or today.month
        payload = calendar_month(request.user, year, month)
        return Response(CalendarResponseSerializer(payload).data)


@extend_schema(
    tags=["Charts"],
    summary="Daily or weekly chart series",
    parameters=[
        OpenApiParameter(
            name="period",
            type=str,
            location=OpenApiParameter.QUERY,
            required=False,
            enum=["daily", "weekly"],
        ),
        OpenApiParameter(
            name="start_date",
            type=str,
            location=OpenApiParameter.QUERY,
            required=False,
        ),
        OpenApiParameter(
            name="end_date",
            type=str,
            location=OpenApiParameter.QUERY,
            required=False,
        ),
        OpenApiParameter(
            name="group",
            type=str,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Category group key or UUID to filter the series.",
        ),
        OpenApiParameter(
            name="with_filter",
            type=str,
            location=OpenApiParameter.QUERY,
            required=False,
            enum=["together", "alone"],
            description="Together (shared goals / with partner) or solo activity.",
        ),
    ],
    responses={200: ChartResponseSerializer},
)
class ChartsView(APIView):
    permission_classes = [IsAuthenticated, HasActiveMembership]

    def get(self, request):
        query = ChartQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data
        payload = chart_series(
            request.user,
            period=data.get("period") or "daily",
            start_date=data.get("start_date"),
            end_date=data.get("end_date"),
            group=data.get("group") or None,
            with_filter=data.get("with_filter") or None,
        )
        return Response(ChartResponseSerializer(payload).data)


@extend_schema(
    tags=["Recaps"],
    summary="Available recaps (past months/years, plus a first-week highlight)",
    responses={200: RecapIndexResponseSerializer},
)
class RecapIndexView(APIView):
    permission_classes = [IsAuthenticated, HasActiveMembership]

    def get(self, request):
        payload = list_available_recaps(request.user)
        return Response(RecapIndexResponseSerializer(payload).data)


@extend_schema(
    tags=["Recaps"],
    summary="Month Recap from NightCaps and daily check-ins",
    parameters=[
        OpenApiParameter(name="year", type=int, location=OpenApiParameter.QUERY, required=False),
        OpenApiParameter(name="month", type=int, location=OpenApiParameter.QUERY, required=False),
    ],
    responses={200: RecapMonthResponseSerializer},
)
class RecapMonthView(APIView):
    permission_classes = [IsAuthenticated, HasActiveMembership]

    def get(self, request):
        query = RecapMonthQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        today = timezone.localdate()
        year = query.validated_data.get("year") or today.year
        month = query.validated_data.get("month") or today.month
        payload = build_month_recap(request.user, year, month, request)
        return Response(RecapMonthResponseSerializer(payload).data)


@extend_schema(
    tags=["Recaps"],
    summary="Year Recap walking through the seasons",
    parameters=[
        OpenApiParameter(name="year", type=int, location=OpenApiParameter.QUERY, required=False),
    ],
    responses={200: RecapYearResponseSerializer},
)
class RecapYearView(APIView):
    permission_classes = [IsAuthenticated, HasActiveMembership]

    def get(self, request):
        query = RecapYearQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        today = timezone.localdate()
        year = query.validated_data.get("year") or today.year
        payload = build_year_recap(request.user, year, request)
        return Response(RecapYearResponseSerializer(payload).data)
