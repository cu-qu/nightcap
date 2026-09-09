import secrets
import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone

from core.constants import LANGUAGE_CHOICES


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    preferred_language = models.CharField(
        max_length=10, choices=LANGUAGE_CHOICES, default="en"
    )
    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    email_verified = models.BooleanField(default=False, db_index=True)
    email_verification_token = models.CharField(max_length=128, blank=True, db_index=True)
    email_verification_sent_at = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["email"]

    class Meta:
        db_table = "accounts_user"

    def regenerate_email_verification_token(self) -> str:
        self.email_verification_token = secrets.token_urlsafe(32)
        self.email_verification_sent_at = timezone.now()
        self.save(
            update_fields=["email_verification_token", "email_verification_sent_at"]
        )
        return self.email_verification_token

    def mark_email_verified(self) -> None:
        self.email_verified = True
        self.email_verification_token = ""
        self.save(update_fields=["email_verified", "email_verification_token"])


class UserProfile(models.Model):
    MODE_SOLO = "solo"
    MODE_COUPLE = "couple"
    MODE_CHOICES = [
        (MODE_SOLO, "Just me"),
        (MODE_COUPLE, "With a partner"),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    preferred_language = models.CharField(
        max_length=10, choices=LANGUAGE_CHOICES, default="en"
    )
    tracking_mode = models.CharField(
        max_length=16,
        choices=MODE_CHOICES,
        default=MODE_SOLO,
        help_text="Whether this person uses NightCap alone or with a partner.",
    )
    onboarding_completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "accounts_userprofile"

    def __str__(self):
        return f"{self.user.username} profile"


def generate_partnership_invite_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(6))


class Partnership(models.Model):
    """A two-person couple space for shared goals."""

    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    invite_code = models.CharField(max_length=12, unique=True, db_index=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="created_partnerships",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "accounts_partnership"

    def __str__(self):
        return f"Partnership {self.invite_code}"

    def save(self, *args, **kwargs):
        if not self.invite_code:
            for _ in range(8):
                candidate = generate_partnership_invite_code()
                if not Partnership.objects.filter(invite_code=candidate).exists():
                    self.invite_code = candidate
                    break
            else:
                self.invite_code = generate_partnership_invite_code()
        super().save(*args, **kwargs)

    @property
    def is_full(self) -> bool:
        return self.members.count() >= 2


class PartnershipMember(models.Model):
    ROLE_OWNER = "owner"
    ROLE_PARTNER = "partner"
    ROLE_CHOICES = [
        (ROLE_OWNER, "Owner"),
        (ROLE_PARTNER, "Partner"),
    ]

    partnership = models.ForeignKey(
        Partnership, on_delete=models.CASCADE, related_name="members"
    )
    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="partnership_membership"
    )
    role = models.CharField(max_length=16, choices=ROLE_CHOICES, default=ROLE_OWNER)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "accounts_partnershipmember"
        constraints = [
            models.UniqueConstraint(
                fields=["partnership", "user"],
                name="unique_partnership_member",
            )
        ]

    def __str__(self):
        return f"{self.user.username} in {self.partnership.invite_code}"


class PartnershipInvite(models.Model):
    """Optional email invite tied to a partnership's share code."""

    partnership = models.ForeignKey(
        Partnership, on_delete=models.CASCADE, related_name="email_invites"
    )
    email = models.EmailField()
    invited_by = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="sent_partner_invites"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    accepted_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="accepted_partner_invites",
    )

    class Meta:
        db_table = "accounts_partnershipinvite"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Invite {self.email} ({self.partnership.invite_code})"
