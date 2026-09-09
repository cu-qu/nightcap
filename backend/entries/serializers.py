from decimal import Decimal

from rest_framework import serializers

from categories.models import TrackingCategory
from categories.serializers import TrackingCategorySerializer

from .models import DayReflection, Entry, NightCap


def validate_entry_metric_fields(category, amount, quantity):
    """Shared metric validation for entry and ritual item serializers."""
    metric_kind = category.metric_kind
    if metric_kind == TrackingCategory.METRIC_AMOUNT:
        if amount is None:
            raise serializers.ValidationError({"amount": "Amount is required for this category."})
        return {"amount": amount, "quantity": None}
    if metric_kind == TrackingCategory.METRIC_QUANTITY:
        if quantity is None:
            raise serializers.ValidationError({"quantity": "Quantity is required for this category."})
        return {"amount": None, "quantity": quantity}
    if metric_kind == TrackingCategory.METRIC_BOOLEAN:
        if quantity is None:
            raise serializers.ValidationError(
                {"quantity": "Completion count is required (0 or 1)."}
            )
        q = Decimal(quantity)
        if q not in (Decimal("0"), Decimal("1")):
            raise serializers.ValidationError({"quantity": "Must be 0 or 1 for habit check-ins."})
        return {"amount": None, "quantity": q}
    return {"amount": amount, "quantity": quantity}


class EntrySerializer(serializers.ModelSerializer):
    category_detail = TrackingCategorySerializer(source="category", read_only=True)
    category_uuid = serializers.UUIDField(source="category.uuid", read_only=True)
    nightcap_uuid = serializers.UUIDField(
        source="nightcap.uuid", read_only=True, allow_null=True
    )

    class Meta:
        model = Entry
        fields = (
            "id",
            "uuid",
            "nightcap",
            "nightcap_uuid",
            "date",
            "category",
            "category_uuid",
            "category_detail",
            "label",
            "amount",
            "quantity",
            "notes",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "uuid",
            "nightcap",
            "nightcap_uuid",
            "category_uuid",
            "category_detail",
            "created_at",
            "updated_at",
        )

    def validate_category(self, value):
        request = self.context.get("request")
        if request and value.user_id != request.user.id:
            raise serializers.ValidationError("Category does not belong to this user.")
        return value

    def validate(self, attrs):
        category = attrs.get("category") or getattr(self.instance, "category", None)
        if category is None:
            return attrs

        amount = attrs.get("amount", getattr(self.instance, "amount", None))
        quantity = attrs.get("quantity", getattr(self.instance, "quantity", None))
        attrs.update(validate_entry_metric_fields(category, amount, quantity))
        return attrs


class DailySummaryQuerySerializer(serializers.Serializer):
    date = serializers.DateField(required=False)


class PeriodSummaryQuerySerializer(serializers.Serializer):
    PERIOD_WEEKLY = "weekly"
    PERIOD_MONTHLY = "monthly"

    period = serializers.ChoiceField(choices=[PERIOD_WEEKLY, PERIOD_MONTHLY])


class ExportResponseSerializer(serializers.Serializer):
    generated_at = serializers.DateTimeField()
    categories = TrackingCategorySerializer(many=True)
    entries = EntrySerializer(many=True)


class DashboardDaySerializer(serializers.Serializer):
    date = serializers.DateField()
    entry_count = serializers.IntegerField()
    expense_total = serializers.DecimalField(
        max_digits=12, decimal_places=2, allow_null=True, required=False
    )
    income_total = serializers.DecimalField(
        max_digits=12, decimal_places=2, allow_null=True, required=False
    )


class DashboardWeekSerializer(serializers.Serializer):
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    days = DashboardDaySerializer(many=True)


class DashboardTotalsSerializer(serializers.Serializer):
    income = serializers.DecimalField(max_digits=12, decimal_places=2)
    expense = serializers.DecimalField(max_digits=12, decimal_places=2)
    net = serializers.DecimalField(max_digits=12, decimal_places=2)


class DashboardResponseSerializer(serializers.Serializer):
    current_streak_days = serializers.IntegerField()
    week = DashboardWeekSerializer()
    totals = DashboardTotalsSerializer()
    entry_count = serializers.IntegerField()
    goals = serializers.ListField(child=serializers.DictField())


class DayReflectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DayReflection
        fields = ("date", "reflection", "created_at", "updated_at")
        read_only_fields = ("date", "created_at", "updated_at")


class NightCapSerializer(serializers.ModelSerializer):
    entries = EntrySerializer(many=True, read_only=True)
    entry_count = serializers.SerializerMethodField()

    class Meta:
        model = NightCap
        fields = (
            "id",
            "uuid",
            "date",
            "reflection",
            "mood",
            "status",
            "completed_at",
            "entry_count",
            "entries",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "uuid",
            "completed_at",
            "entry_count",
            "entries",
            "created_at",
            "updated_at",
        )

    def get_entry_count(self, obj):
        if hasattr(obj, "_entry_count"):
            return obj._entry_count
        return obj.entries.count()


class NightCapListSerializer(serializers.ModelSerializer):
    entry_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = NightCap
        fields = (
            "id",
            "uuid",
            "date",
            "reflection",
            "mood",
            "status",
            "completed_at",
            "entry_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class NightCapWriteSerializer(serializers.Serializer):
    date = serializers.DateField()
    reflection = serializers.CharField(required=False, allow_blank=True)
    mood = serializers.CharField(required=False, allow_blank=True, max_length=32)
    status = serializers.ChoiceField(
        choices=[NightCap.STATUS_DRAFT, NightCap.STATUS_COMPLETED],
        required=False,
    )


class RitualItemSerializer(serializers.Serializer):
    category = serializers.IntegerField(required=False)
    category_uuid = serializers.UUIDField(required=False)
    label = serializers.CharField(required=False, allow_blank=True, max_length=255)
    notes = serializers.CharField(required=False, allow_blank=True)
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )
    quantity = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )

    def validate(self, attrs):
        category_id = attrs.get("category")
        category_uuid = attrs.get("category_uuid")
        if category_id is None and category_uuid is None:
            raise serializers.ValidationError(
                "Provide category (int id) or category_uuid."
            )
        if category_id is not None and category_uuid is not None:
            raise serializers.ValidationError(
                "Provide only one of category or category_uuid."
            )

        request = self.context.get("request")
        user = request.user if request else None
        if user is None:
            raise serializers.ValidationError("Authentication required.")

        try:
            if category_uuid is not None:
                category = TrackingCategory.objects.get(user=user, uuid=category_uuid)
            else:
                category = TrackingCategory.objects.get(user=user, pk=category_id)
        except TrackingCategory.DoesNotExist as exc:
            raise serializers.ValidationError(
                {"category": "Category not found for this user."}
            ) from exc

        metrics = validate_entry_metric_fields(
            category, attrs.get("amount"), attrs.get("quantity")
        )
        attrs["category"] = category
        attrs["amount"] = metrics["amount"]
        attrs["quantity"] = metrics["quantity"]
        return attrs


class RitualRequestSerializer(serializers.Serializer):
    date = serializers.DateField()
    reflection = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    mood = serializers.CharField(required=False, allow_blank=True, max_length=32)
    status = serializers.ChoiceField(
        choices=[NightCap.STATUS_DRAFT, NightCap.STATUS_COMPLETED],
        required=False,
        default=NightCap.STATUS_COMPLETED,
    )
    items = RitualItemSerializer(many=True, required=False)

    def validate(self, attrs):
        attrs.setdefault("items", [])
        return attrs


class RitualResponseSerializer(serializers.Serializer):
    date = serializers.DateField()
    reflection = serializers.CharField(allow_blank=True)
    nightcap = NightCapListSerializer()
    entries = EntrySerializer(many=True)
    summary = serializers.DictField()


class CalendarGroupSummarySerializer(serializers.Serializer):
    """Per-day summary for a category group that had NightCap activity."""

    uuid = serializers.UUIDField(allow_null=True)
    key = serializers.CharField(allow_null=True, allow_blank=True)
    name = serializers.CharField()
    icon = serializers.CharField(allow_blank=True)
    entry_count = serializers.IntegerField()
    expense_total = serializers.DecimalField(max_digits=12, decimal_places=2)
    amount_total = serializers.DecimalField(
        max_digits=12, decimal_places=2, allow_null=True, required=False
    )
    quantity_total = serializers.DecimalField(
        max_digits=12, decimal_places=2, allow_null=True, required=False
    )
    category_emojis = serializers.ListField(
        child=serializers.CharField(), allow_empty=True
    )


class CalendarDaySerializer(serializers.Serializer):
    date = serializers.DateField()
    has_entries = serializers.BooleanField()
    has_reflection = serializers.BooleanField()
    has_nightcap = serializers.BooleanField()
    nightcap_status = serializers.CharField(allow_null=True, required=False)
    mood = serializers.CharField(allow_blank=True, required=False)
    entry_count = serializers.IntegerField()
    expense_total = serializers.DecimalField(max_digits=12, decimal_places=2)
    habit_count = serializers.IntegerField()
    groups = CalendarGroupSummarySerializer(many=True)


class CalendarResponseSerializer(serializers.Serializer):
    year = serializers.IntegerField()
    month = serializers.IntegerField()
    days = CalendarDaySerializer(many=True)


class CalendarQuerySerializer(serializers.Serializer):
    year = serializers.IntegerField(min_value=2000, max_value=2100, required=False)
    month = serializers.IntegerField(min_value=1, max_value=12, required=False)


class ChartPointSerializer(serializers.Serializer):
    date = serializers.DateField(allow_null=True, required=False)
    week_start = serializers.DateField(allow_null=True, required=False)
    entry_count = serializers.IntegerField()
    expense_total = serializers.DecimalField(max_digits=12, decimal_places=2)
    income_total = serializers.DecimalField(max_digits=12, decimal_places=2)


class ChartQuerySerializer(serializers.Serializer):
    period = serializers.ChoiceField(choices=["daily", "weekly"], default="daily")
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)


class ChartResponseSerializer(serializers.Serializer):
    period = serializers.CharField()
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    points = ChartPointSerializer(many=True)
    by_category = serializers.ListField(child=serializers.DictField())
