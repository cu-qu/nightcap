import uuid
from pathlib import Path

from django.conf import settings
from django.core.validators import FileExtensionValidator
from django.db import models

PHOTO_MAX_BYTES = 8 * 1024 * 1024
PHOTO_EXTENSIONS = ("jpg", "jpeg", "png", "webp")


def nightcap_photo_upload_to(instance, filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext.lstrip(".") not in PHOTO_EXTENSIONS:
        ext = ".jpg"
    return f"nightcaps/{instance.user_id}/{instance.date}/{uuid.uuid4().hex}{ext}"


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
    favorite_moment = models.TextField(
        blank=True,
        help_text="Favorite text moment of the day.",
    )
    favorite_photo = models.ImageField(
        upload_to=nightcap_photo_upload_to,
        blank=True,
        null=True,
        validators=[FileExtensionValidator(PHOTO_EXTENSIONS)],
        help_text="Favorite photo of the day.",
    )
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

    @property
    def has_favorite_photo(self) -> bool:
        return bool(self.favorite_photo)

    def set_favorite_photo(self, uploaded_file) -> None:
        if self.favorite_photo:
            self.favorite_photo.delete(save=False)
        self.favorite_photo = uploaded_file
        self.save(update_fields=["favorite_photo", "updated_at"])

    def clear_favorite_photo(self) -> None:
        if not self.favorite_photo:
            return
        self.favorite_photo.delete(save=False)
        self.favorite_photo = None
        self.save(update_fields=["favorite_photo", "updated_at"])

    def delete(self, using=None, keep_parents=False):
        photo = self.favorite_photo
        result = super().delete(using=using, keep_parents=keep_parents)
        if photo:
            photo.delete(save=False)
        return result


class Entry(models.Model):
    COMPLETED_ALONE = "alone"
    COMPLETED_WITH_PARTNER = "with_partner"
    COMPLETED_WITH_CHOICES = [
        (COMPLETED_ALONE, "Alone"),
        (COMPLETED_WITH_PARTNER, "With Partner"),
    ]

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
    completed_with = models.CharField(
        max_length=16,
        choices=COMPLETED_WITH_CHOICES,
        default=COMPLETED_ALONE,
        help_text="Whether this category was completed alone or with a partner.",
    )
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
