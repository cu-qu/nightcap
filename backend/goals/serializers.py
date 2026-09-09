from decimal import Decimal

from rest_framework import serializers

from categories.models import TrackingCategory

from .models import Goal
from .services import compute_goal_progress


class GroupGoalCategorySerializer(serializers.Serializer):
    uuid = serializers.UUIDField()
    name = serializers.CharField()
    emoji = serializers.CharField(allow_blank=True)
    icon = serializers.CharField(allow_blank=True)
    metric_kind = serializers.CharField()
    unit = serializers.CharField()


class WeeklyNativeProgressSerializer(serializers.Serializer):
    target_value = serializers.DecimalField(max_digits=12, decimal_places=2)
    current_value = serializers.DecimalField(max_digits=12, decimal_places=2)
    remaining_value = serializers.DecimalField(max_digits=12, decimal_places=2)
    percent_used = serializers.FloatField()
    period_start = serializers.DateField()
    period_end = serializers.DateField()
    health = serializers.CharField()


class GroupGoalItemSerializer(serializers.Serializer):
    uuid = serializers.UUIDField()
    id = serializers.IntegerField()
    display_name = serializers.CharField()
    mode = serializers.ChoiceField(choices=["stay_under", "pass", "completed"])
    health = serializers.ChoiceField(
        choices=["healthy", "close", "behind", "passed", "over"]
    )
    period = serializers.CharField()
    rolls_into_month = serializers.BooleanField()
    weeks_in_month = serializers.IntegerField(allow_null=True, required=False)
    base_target_value = serializers.DecimalField(
        max_digits=12, decimal_places=2, allow_null=True, required=False
    )
    direction = serializers.CharField()
    target_value = serializers.DecimalField(max_digits=12, decimal_places=2)
    current_value = serializers.DecimalField(max_digits=12, decimal_places=2)
    remaining_value = serializers.DecimalField(max_digits=12, decimal_places=2)
    percent_used = serializers.FloatField()
    period_start = serializers.DateField()
    period_end = serializers.DateField()
    warn_at_percent = serializers.IntegerField()
    category = GroupGoalCategorySerializer()
    weekly_progress = WeeklyNativeProgressSerializer(required=False, allow_null=True)


class GroupGoalCountsSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    healthy = serializers.IntegerField()
    close = serializers.IntegerField()
    behind = serializers.IntegerField()
    passed = serializers.IntegerField()
    over = serializers.IntegerField()
    stay_under = serializers.IntegerField()
    completed = serializers.IntegerField()

    def to_representation(self, instance):
        return {
            "total": instance["total"],
            "healthy": instance["healthy"],
            "close": instance["close"],
            "behind": instance["behind"],
            "passed": instance["passed"],
            "over": instance["over"],
            "stay_under": instance["stay_under"],
            "pass": instance["pass"],
            "completed": instance["completed"],
        }


class ModeGoalTotalsSerializer(serializers.Serializer):
    goal_count = serializers.IntegerField()
    target_total = serializers.DecimalField(max_digits=14, decimal_places=2)
    current_total = serializers.DecimalField(max_digits=14, decimal_places=2)
    remaining_total = serializers.DecimalField(max_digits=14, decimal_places=2)
    percent_used = serializers.FloatField()
    healthy = serializers.IntegerField()
    close = serializers.IntegerField()
    behind = serializers.IntegerField()
    passed = serializers.IntegerField()
    over = serializers.IntegerField()


def _decimal_str(value) -> str:
    return f"{Decimal(value):.2f}"


class GroupGoalMetricsSerializer(serializers.Serializer):
    def to_representation(self, instance):
        return {
            "stay_under": ModeGoalTotalsSerializer(instance["stay_under"]).data,
            "pass": ModeGoalTotalsSerializer(instance["pass"]).data,
            "completed": ModeGoalTotalsSerializer(instance["completed"]).data,
            "target_total": _decimal_str(instance["target_total"]),
            "current_total": _decimal_str(instance["current_total"]),
            "remaining_total": _decimal_str(instance["remaining_total"]),
            "percent_used": instance["percent_used"],
            "avg_percent_used": instance["avg_percent_used"],
        }


class MetricsByPeriodSerializer(serializers.Serializer):
    def to_representation(self, instance):
        return {
            "weekly": GroupGoalMetricsSerializer(instance["weekly"]).data,
            "monthly": GroupGoalMetricsSerializer(instance["monthly"]).data,
            "daily": GroupGoalMetricsSerializer(instance["daily"]).data,
        }


class CategoryGroupGoalBucketSerializer(serializers.Serializer):
    uuid = serializers.UUIDField(allow_null=True)
    key = serializers.CharField(allow_null=True)
    name = serializers.CharField()
    icon = serializers.CharField(allow_blank=True)
    counts = GroupGoalCountsSerializer()
    metrics = GroupGoalMetricsSerializer()
    metrics_by_period = MetricsByPeriodSerializer()
    goals = GroupGoalItemSerializer(many=True)


class CategoryGroupGoalSummarySerializer(serializers.Serializer):
    period = serializers.CharField(allow_null=True, required=False)
    includes_weekly_rolled_in = serializers.BooleanField()
    weeks_in_month = serializers.IntegerField(allow_null=True, required=False)
    reference_date = serializers.DateField()
    counts = GroupGoalCountsSerializer()
    metrics = GroupGoalMetricsSerializer()
    metrics_by_period = MetricsByPeriodSerializer()
    groups = CategoryGroupGoalBucketSerializer(many=True)


class GoalCategorySummarySerializer(serializers.ModelSerializer):
    """Minimal category payload so goals stay clearly tied to one category."""

    class Meta:
        model = TrackingCategory
        fields = (
            "id",
            "uuid",
            "name",
            "type",
            "metric_kind",
            "unit",
            "icon",
            "emoji",
            "group",
        )
        read_only_fields = fields


class GoalProgressSerializer(serializers.Serializer):
    goal_id = serializers.IntegerField()
    goal_uuid = serializers.UUIDField(required=False)
    category_id = serializers.IntegerField()
    category_uuid = serializers.UUIDField(required=False)
    category_name = serializers.CharField()
    period = serializers.CharField()
    period_start = serializers.DateField()
    period_end = serializers.DateField()
    direction = serializers.CharField()
    target_value = serializers.DecimalField(max_digits=12, decimal_places=2)
    current_value = serializers.DecimalField(max_digits=12, decimal_places=2)
    remaining_value = serializers.DecimalField(max_digits=12, decimal_places=2)
    percent_used = serializers.FloatField()
    status = serializers.CharField()
    status_label = serializers.CharField()
    warn_at_percent = serializers.IntegerField()


class GoalSerializer(serializers.ModelSerializer):
    """
    Simple category-tied goal.

    Create with:
      { "category_uuid": "...", "target_value": "200", "period": "monthly" }

    Tracking is derived from that category's entries for the goal period.
    """

    display_name = serializers.CharField(read_only=True)
    category_uuid = serializers.UUIDField(write_only=True, required=False)
    category_detail = GoalCategorySummarySerializer(source="category", read_only=True)
    progress = serializers.SerializerMethodField()

    class Meta:
        model = Goal
        fields = (
            "id",
            "uuid",
            "category",
            "category_uuid",
            "category_detail",
            "name",
            "display_name",
            "period",
            "direction",
            "target_value",
            "warn_at_percent",
            "is_active",
            "progress",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "uuid",
            "display_name",
            "category_detail",
            "progress",
            "created_at",
            "updated_at",
        )
        extra_kwargs = {
            "category": {"required": False},
            "name": {"required": False, "allow_blank": True},
            "warn_at_percent": {"required": False},
            "direction": {"required": False},
            "period": {"required": False},
        }

    def get_progress(self, obj):
        if not obj.is_active:
            return None
        reference = self.context.get("reference_date")
        return compute_goal_progress(obj, reference_date=reference).as_dict()

    def validate_category(self, value):
        request = self.context.get("request")
        if request and value.user_id != request.user.id:
            raise serializers.ValidationError("Category does not belong to this user.")
        return value

    def validate_warn_at_percent(self, value):
        if value < 1 or value > 100:
            raise serializers.ValidationError("Must be between 1 and 100.")
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        category = attrs.get("category")
        category_uuid = attrs.pop("category_uuid", None)

        if category is not None and category_uuid is not None:
            raise serializers.ValidationError(
                "Provide only one of category or category_uuid."
            )

        if category_uuid is not None:
            if request is None:
                raise serializers.ValidationError(
                    {"category_uuid": "Authentication required."}
                )
            try:
                category = TrackingCategory.objects.get(
                    user=request.user, uuid=category_uuid
                )
            except TrackingCategory.DoesNotExist as exc:
                raise serializers.ValidationError(
                    {"category_uuid": "Category not found for this user."}
                ) from exc
            attrs["category"] = category

        if attrs.get("category") is None and self.instance is None:
            raise serializers.ValidationError(
                {"category_uuid": "Provide category_uuid (preferred) or category."}
            )

        category = attrs.get("category") or getattr(self.instance, "category", None)
        if self.instance is None and "direction" not in attrs and category is not None:
            if category.metric_kind == TrackingCategory.METRIC_AMOUNT:
                attrs["direction"] = Goal.DIRECTION_MAX
            else:
                attrs["direction"] = Goal.DIRECTION_MIN

        if self.instance is None:
            attrs.setdefault("period", Goal.PERIOD_MONTHLY)

        # One active goal per category (weekly OR monthly, not both).
        if (
            category is not None
            and request is not None
            and not self.context.get("allow_replace")
        ):
            qs = Goal.objects.filter(
                user=request.user, category=category, is_active=True
            )
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                existing = qs.first()
                raise serializers.ValidationError(
                    {
                        "category_uuid": (
                            f"An active {existing.period} goal already exists for this "
                            "category. Use POST /goals/set/ to replace it, or deactivate "
                            "the existing goal first. Only one goal per category is allowed."
                        )
                    }
                )

        return attrs
