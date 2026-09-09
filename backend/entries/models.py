import uuid

from django.conf import settings
from django.db import models


class NightCap(models.Model):
    """One NightCap day record per user — the container for that night's ritual."""

    STATUS_DRAFT = "draft"
    STATUS_COMPLETED = "completed"
    STATUS_CHOICES = [
        (STATUS_DRAFT, "Draft"),
        (STATUS_COMPLETED, "Completed"),
    ]

    # Suggested presets for clients; any short emoji/string is allowed.
    MOOD_GREAT = "🤩"
    MOOD_GOOD = "🙂"
    MOOD_OKAY = "😐"
    MOOD_LOW = "😔"
    MOOD_ROUGH = "😣"
    SUGGESTED_MOODS = [
        (MOOD_GREAT, "Great"),
        (MOOD_GOOD, "Good"),
        (MOOD_OKAY, "Okay"),
        (MOOD_LOW, "Low"),
        (MOOD_ROUGH, "Rough"),
    ]
    # Back-compat alias used by older serializers/docs snippets.
    MOOD_CHOICES = SUGGESTED_MOODS

    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="nightcaps",
    )
    date = models.DateField(db_index=True)
    reflection = models.TextField(blank=True)
    mood = models.CharField(
        max_length=32,
        blank=True,
        default="",
        help_text="End-of-day mood emoji (suggested: 🤩 🙂 😐 😔 😣; custom allowed).",
    )
    status = models.CharField(
        max_length=16, choices=STATUS_CHOICES, default=STATUS_DRAFT
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "entries_nightcap"
        ordering = ["-date"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "date"],
                name="unique_nightcap_per_user_date",
            )
        ]

    def __str__(self):
        return f"NightCap {self.user_id} {self.date} ({self.status})"


class Entry(models.Model):
    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="entries",
    )
    nightcap = models.ForeignKey(
        NightCap,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="entries",
    )
    date = models.DateField(db_index=True)
    category = models.ForeignKey(
        "categories.TrackingCategory",
        on_delete=models.PROTECT,
        related_name="entries",
    )
    label = models.CharField(max_length=255, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    value = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "entries_entry"
        ordering = ["-date", "-created_at"]
        indexes = [
            models.Index(fields=["user", "date"]),
            models.Index(fields=["user", "category", "date"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "date", "category"],
                name="unique_entry_per_user_date_category",
            )
        ]
        verbose_name_plural = "Entries"

    def __str__(self):
        return f"{self.user_id} {self.date} {self.category_id}"


class DayReflection(models.Model):
    """
    Legacy day-level reflection.

    New code should use NightCap. Kept so existing rows and the
    /day-reflections/ route remain available; writes sync to NightCap.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="day_reflections",
    )
    date = models.DateField(db_index=True)
    reflection = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "entries_dayreflection"
        ordering = ["-date"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "date"],
                name="unique_day_reflection_per_user_date",
            )
        ]

    def __str__(self):
        return f"{self.user_id} {self.date}"
