import uuid

from django.conf import settings
from django.db import models


def default_metric_for_type(category_type: str) -> tuple[str, str]:
    if category_type in (
        TrackingCategory.FINANCE_EXPENSE,
        TrackingCategory.FINANCE_INCOME,
    ):
        return TrackingCategory.METRIC_AMOUNT, "usd"
    if category_type == TrackingCategory.FITNESS:
        return TrackingCategory.METRIC_QUANTITY, "reps"
    if category_type == TrackingCategory.HABIT:
        return TrackingCategory.METRIC_BOOLEAN, "count"
    return TrackingCategory.METRIC_QUANTITY, "count"


class CategoryGroup(models.Model):
    """Ordered section of categories shown during a NightCap ritual."""

    KEY_DAILY_SPEND = "daily_spend"
    KEY_FOLLOW_UP = "follow_up"

    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="category_groups",
    )
    name = models.CharField(max_length=120)
    key = models.SlugField(
        max_length=64,
        help_text="Stable client key, e.g. daily_spend or follow_up (Health group).",
    )
    sort_order = models.PositiveIntegerField(default=0)
    icon = models.CharField(max_length=64, blank=True)
    show_in_ritual = models.BooleanField(
        default=True,
        help_text="When true, this group is offered on the nightly NightCap screens.",
    )
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "categories_categorygroup"
        ordering = ["sort_order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "key"],
                name="unique_category_group_key_per_user",
            ),
            models.UniqueConstraint(
                fields=["user", "name"],
                name="unique_category_group_name_per_user",
            ),
        ]

    def __str__(self):
        return self.name


class TrackingCategory(models.Model):
    FINANCE_EXPENSE = "finance_expense"
    FINANCE_INCOME = "finance_income"
    FITNESS = "fitness"
    HABIT = "habit"
    CUSTOM = "custom"

    TYPE_CHOICES = [
        (FINANCE_EXPENSE, "Finance Expense"),
        (FINANCE_INCOME, "Finance Income"),
        (FITNESS, "Fitness"),
        (HABIT, "Habit"),
        (CUSTOM, "Custom"),
    ]

    METRIC_AMOUNT = "amount"
    METRIC_QUANTITY = "quantity"
    METRIC_BOOLEAN = "boolean"

    METRIC_KIND_CHOICES = [
        (METRIC_AMOUNT, "Amount"),
        (METRIC_QUANTITY, "Quantity"),
        (METRIC_BOOLEAN, "Boolean"),
    ]

    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tracking_categories",
    )
    group = models.ForeignKey(
        CategoryGroup,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="categories",
    )
    name = models.CharField(max_length=120)
    type = models.CharField(max_length=32, choices=TYPE_CHOICES, default=CUSTOM)
    metric_kind = models.CharField(
        max_length=16, choices=METRIC_KIND_CHOICES, default=METRIC_QUANTITY
    )
    unit = models.CharField(max_length=32, blank=True, default="count")
    icon = models.CharField(
        max_length=64,
        blank=True,
        help_text="Optional stable glyph key for clients (e.g. groceries).",
    )
    emoji = models.CharField(
        max_length=16,
        blank=True,
        default="",
        help_text="Display emoji saved for this category (e.g. 🛒).",
    )
    sort_order = models.PositiveIntegerField(default=0)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "categories_trackingcategory"
        ordering = ["group__sort_order", "sort_order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "name", "type"],
                name="unique_category_name_type_per_user",
            )
        ]
        verbose_name_plural = "Tracking categories"

    def __str__(self):
        return self.name

    def uses_completed_with(self) -> bool:
        """With Partner / Alone applies to workouts and habits, not money."""
        if self.metric_kind == self.METRIC_AMOUNT:
            return False
        if self.type in (self.FINANCE_EXPENSE, self.FINANCE_INCOME):
            return False
        return True

    def save(self, *args, **kwargs):
        if not self.unit:
            _, expected_unit = default_metric_for_type(self.type)
            self.unit = expected_unit
        super().save(*args, **kwargs)
