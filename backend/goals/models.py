import uuid

from django.conf import settings
from django.db import models

from categories.models import TrackingCategory


class Goal(models.Model):
    PERIOD_DAILY = "daily"
    PERIOD_WEEKLY = "weekly"
    PERIOD_MONTHLY = "monthly"

    PERIOD_CHOICES = [
        (PERIOD_DAILY, "Daily"),
        (PERIOD_WEEKLY, "Weekly"),
        (PERIOD_MONTHLY, "Monthly"),
    ]

    DIRECTION_MAX = "max"
    DIRECTION_MIN = "min"

    DIRECTION_CHOICES = [
        (DIRECTION_MAX, "Maximum"),
        (DIRECTION_MIN, "Minimum"),
    ]

    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="goals",
    )
    category = models.ForeignKey(
        "categories.TrackingCategory",
        on_delete=models.CASCADE,
        related_name="goals",
    )
    name = models.CharField(max_length=120, blank=True)
    period = models.CharField(max_length=16, choices=PERIOD_CHOICES, default=PERIOD_MONTHLY)
    direction = models.CharField(max_length=8, choices=DIRECTION_CHOICES, default=DIRECTION_MAX)
    target_value = models.DecimalField(max_digits=12, decimal_places=2)
    warn_at_percent = models.PositiveSmallIntegerField(default=80)
    SCOPE_PERSONAL = "personal"
    SCOPE_SHARED = "shared"
    SCOPE_CHOICES = [
        (SCOPE_PERSONAL, "Just me"),
        (SCOPE_SHARED, "Together"),
    ]
    scope = models.CharField(
        max_length=16,
        choices=SCOPE_CHOICES,
        default=SCOPE_PERSONAL,
        db_index=True,
    )
    partnership = models.ForeignKey(
        "accounts.Partnership",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="goals",
    )
    template_slug = models.SlugField(max_length=80, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "goals_goal"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "category"],
                condition=models.Q(is_active=True),
                name="unique_active_goal_per_category",
            )
        ]

    def __str__(self):
        return self.display_name

    @property
    def display_name(self) -> str:
        return self.name or self.category.name


class GoalTemplate(models.Model):
    GROUP_FINANCE = "finance"
    GROUP_FITNESS = "fitness"
    GROUP_HABIT = "habit"

    GROUP_CHOICES = [
        (GROUP_FINANCE, "Finance"),
        (GROUP_FITNESS, "Fitness"),
        (GROUP_HABIT, "Habit"),
    ]

    AUDIENCE_PERSONAL = "personal"
    AUDIENCE_COUPLE = "couple"
    AUDIENCE_BOTH = "both"
    AUDIENCE_CHOICES = [
        (AUDIENCE_PERSONAL, "Personal"),
        (AUDIENCE_COUPLE, "Couple"),
        (AUDIENCE_BOTH, "Both"),
    ]

    SCOPE_PERSONAL = Goal.SCOPE_PERSONAL
    SCOPE_SHARED = Goal.SCOPE_SHARED

    slug = models.SlugField(max_length=80, unique=True)
    title = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    example_entry_label = models.CharField(
        max_length=255,
        blank=True,
        help_text="Short hint shown during onboarding, e.g. '$12 at the bar'",
    )
    category_name = models.CharField(max_length=120)
    category_type = models.CharField(
        max_length=32,
        choices=TrackingCategory.TYPE_CHOICES,
        default=TrackingCategory.FINANCE_EXPENSE,
    )
    category_icon = models.CharField(max_length=64, blank=True)
    category_emoji = models.CharField(max_length=16, blank=True)
    category_group_key = models.SlugField(
        max_length=64,
        blank=True,
        help_text="daily_spend or follow_up. Blank = infer from category type.",
    )
    period = models.CharField(max_length=16, choices=Goal.PERIOD_CHOICES, default=Goal.PERIOD_MONTHLY)
    direction = models.CharField(max_length=8, choices=Goal.DIRECTION_CHOICES, default=Goal.DIRECTION_MAX)
    target_value = models.DecimalField(max_digits=12, decimal_places=2)
    warn_at_percent = models.PositiveSmallIntegerField(default=80)
    group = models.CharField(max_length=16, choices=GROUP_CHOICES, default=GROUP_FINANCE)
    audience = models.CharField(
        max_length=16,
        choices=AUDIENCE_CHOICES,
        default=AUDIENCE_BOTH,
    )
    suggested_scope = models.CharField(
        max_length=16,
        choices=Goal.SCOPE_CHOICES,
        default=Goal.SCOPE_PERSONAL,
    )
    suggest_solo = models.BooleanField(default=False)
    suggest_couple = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "goals_goaltemplate"
        ordering = ["group", "sort_order", "title"]

    def __str__(self):
        return self.title
