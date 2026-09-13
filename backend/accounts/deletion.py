import uuid

from django.db import transaction
from django.utils import timezone

from accounts.models import Membership, PartnershipInvite, User
from accounts.partnerships import get_user_partnership, leave_partnership
from categories.models import CategoryGroup, TrackingCategory
from entries.models import DayReflection, Entry, NightCap
from goals.models import Goal


def _unique_tombstone() -> tuple[str, str]:
    for _ in range(8):
        token = uuid.uuid4()
        email = f"deleted-{token}@deleted.invalid"
        username = f"deleted_{token.hex[:12]}"
        if not User.objects.filter(email__iexact=email).exists() and not User.objects.filter(
            username=username
        ).exists():
            return email, username
    token = uuid.uuid4()
    return f"deleted-{token}@deleted.invalid", f"deleted_{token.hex}"


def _delete_nightcap_photos(user: User) -> None:
    nightcaps = NightCap.objects.filter(user=user).exclude(favorite_photo="")
    for nightcap in nightcaps.iterator():
        if nightcap.favorite_photo:
            nightcap.favorite_photo.delete(save=False)


def delete_user_account(user: User) -> None:
    """Leave any couple space, wipe product data, then soft-delete and scrub PII."""
    with transaction.atomic():
        if get_user_partnership(user) is not None:
            leave_partnership(user)

        _delete_nightcap_photos(user)

        Entry.objects.filter(user=user).delete()
        NightCap.objects.filter(user=user).delete()
        DayReflection.objects.filter(user=user).delete()
        Goal.objects.filter(user=user).delete()
        TrackingCategory.objects.filter(user=user).delete()
        CategoryGroup.objects.filter(user=user).delete()
        Membership.objects.filter(user=user).delete()
        PartnershipInvite.objects.filter(invited_by=user).delete()

        email, username = _unique_tombstone()
        user.email = email
        user.username = username
        user.set_unusable_password()
        user.is_deleted = True
        user.deleted_at = timezone.now()
        user.is_active = False
        user.email_verified = False
        user.email_verification_token = ""
        user.first_name = ""
        user.last_name = ""
        user.save(
            update_fields=[
                "email",
                "username",
                "password",
                "is_deleted",
                "deleted_at",
                "is_active",
                "email_verified",
                "email_verification_token",
                "first_name",
                "last_name",
            ]
        )
