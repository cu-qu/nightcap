from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Goal
from .serializers import (
    CategoryGroupGoalSummarySerializer,
    GoalProgressSerializer,
    GoalSerializer,
)
from .services import (
    compute_all_goal_progress,
    compute_goal_progress,
    compute_group_goal_summary,
)


@extend_schema_view(
    list=extend_schema(
        tags=["Goals"],
        summary="List goals (with progress)",
        description=(
            "Each goal is tied to one category. Response includes `category_detail` and "
            "live `progress` from that category's entries for the goal period."
        ),
        parameters=[
            OpenApiParameter(
                name="category_uuid",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
            ),
            OpenApiParameter(
                name="active",
                type=bool,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Defaults to true (active goals only). Pass false for all.",
            ),
        ],
    ),
    create=extend_schema(
        tags=["Goals"],
        summary="Create a category goal",
        description=(
            'Simple create: `{ "category_uuid": "...", "target_value": "200", '
            '"period": "monthly" }`. Direction defaults to max for money categories '
            "and min for habits/quantity."
        ),
    ),
    retrieve=extend_schema(tags=["Goals"], summary="Get goal with progress"),
    update=extend_schema(tags=["Goals"], summary="Update goal"),
    partial_update=extend_schema(tags=["Goals"], summary="Partially update goal"),
    destroy=extend_schema(
        tags=["Goals"],
        summary="Deactivate goal",
        description="Soft-deactivates the goal (is_active=false). Does not delete history.",
    ),
)
class GoalViewSet(viewsets.ModelViewSet):
    serializer_class = GoalSerializer
    permission_classes = [IsAuthenticated]
    queryset = Goal.objects.none()
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["created_at", "period", "target_value"]
    ordering = ["-created_at"]
    lookup_field = "pk"

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Goal.objects.none()
        qs = Goal.objects.filter(user=self.request.user).select_related(
            "category", "category__group", "partnership"
        )
        category_uuid = self.request.query_params.get("category_uuid")
        if category_uuid:
            qs = qs.filter(category__uuid=category_uuid)
        # Default list to active only; ?active=false returns all
        active = self.request.query_params.get("active")
        if active is None or str(active).lower() in ("1", "true", "yes"):
            if self.action == "list":
                qs = qs.filter(is_active=True)
        elif str(active).lower() in ("0", "false", "no"):
            pass  # all
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def destroy(self, request, *args, **kwargs):
        goal = self.get_object()
        goal.is_active = False
        goal.save(update_fields=["is_active", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(
        tags=["Goals"],
        summary="Goal progress for current period",
        responses={200: GoalProgressSerializer},
    )
    @action(detail=True, methods=["get"], url_path="progress")
    def progress(self, request, pk=None):
        goal = self.get_object()
        return Response(compute_goal_progress(goal).as_dict())

    @extend_schema(
        tags=["Goals"],
        summary="All active goals with current period progress",
        description="Convenience list of progress only. Prefer GET /goals/ which embeds progress.",
        responses={200: GoalProgressSerializer(many=True)},
    )
    @action(detail=False, methods=["get"], url_path="progress")
    def all_progress(self, request):
        progress = [item.as_dict() for item in compute_all_goal_progress(request.user)]
        return Response(progress)

    @extend_schema(
        tags=["Goals"],
        summary="Category-group goal health summary",
        description=(
            "Active goals grouped by category group (Daily Spend, Health, …) with "
            "simple health: healthy | close | behind | passed | over, and mode: "
            "stay_under | pass | completed. "
            "`period=monthly` includes weekly goals rolled into the month "
            "(`includes_weekly_rolled_in=true`): weekly targets are scaled by "
            "`weeks_in_month` (Mondays in that month, 4 or 5) and current uses "
            "full-month entries. Use `metrics_by_period` / `weekly_progress` for "
            "native this-week vs month-scaled totals."
        ),
        parameters=[
            OpenApiParameter(
                name="period",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                enum=["daily", "weekly", "monthly"],
                description=(
                    "weekly = week goals only; monthly = month goals + weekly goals "
                    "scaled into the month (target × Mondays-in-month); daily = daily only."
                ),
            ),
        ],
        responses={200: CategoryGroupGoalSummarySerializer},
    )
    @action(detail=False, methods=["get"], url_path="group-summary")
    def group_summary(self, request):
        period = request.query_params.get("period") or None
        if period and period not in (
            Goal.PERIOD_DAILY,
            Goal.PERIOD_WEEKLY,
            Goal.PERIOD_MONTHLY,
        ):
            return Response(
                {"detail": "period must be daily, weekly, or monthly."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        payload = compute_group_goal_summary(request.user, period=period)
        serializer = CategoryGroupGoalSummarySerializer(payload)
        return Response(serializer.data)

    @extend_schema(
        tags=["Goals"],
        summary="Set or replace goal for a category",
        description=(
            "Upsert helper: one active goal per category. If an active goal already exists "
            "for this user/category (any period), update it — including switching "
            "weekly ↔ monthly. Otherwise create. Body same as create."
        ),
        request=GoalSerializer,
        responses={200: GoalSerializer, 201: GoalSerializer},
    )
    @action(detail=False, methods=["post"], url_path="set")
    def set_goal(self, request):
        serializer = GoalSerializer(data=request.data, context={"request": request})
        # Skip the “already exists” create check; we upsert by category.
        serializer.context["allow_replace"] = True
        serializer.is_valid(raise_exception=True)
        category = serializer.validated_data["category"]
        existing = Goal.objects.filter(
            user=request.user,
            category=category,
            is_active=True,
        ).first()
        if existing:
            update_serializer = GoalSerializer(
                existing,
                data=request.data,
                partial=True,
                context={"request": request, "allow_replace": True},
            )
            update_serializer.is_valid(raise_exception=True)
            goal = update_serializer.save()
            return Response(
                GoalSerializer(goal, context={"request": request}).data,
                status=status.HTTP_200_OK,
            )
        goal = serializer.save(user=request.user)
        return Response(
            GoalSerializer(goal, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )
