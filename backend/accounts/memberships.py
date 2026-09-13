from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts.models import Membership, Partnership, User


def trial_length() -> timedelta:
    days = int(getattr(settings, "IAP_TRIAL_DAYS", 30))
    return timedelta(days=days)


def _now():
    return timezone.now()


def complimentary_is_active(membership: Membership, now=None) -> bool:
    if not membership.complimentary:
        return False
    now = now or _now()
    return membership.complimentary_until is None or membership.complimentary_until > now


def store_is_active(membership: Membership, now=None) -> bool:
    now = now or _now()
    return bool(membership.store_expires_at and membership.store_expires_at > now)


def trial_is_active(membership: Membership, now=None) -> bool:
    now = now or _now()
    return bool(membership.trial_ends_at and membership.trial_ends_at > now)


def membership_is_active(membership: Membership | None, user=None) -> bool:
    if membership is None:
        return False
    now = _now()
    if complimentary_is_active(membership, now) or store_is_active(membership, now) or trial_is_active(membership, now):
        return True
    if user is not None and user.is_staff and getattr(settings, "IAP_STAFF_COMPLIMENTARY", False):
        return True
    return False


def membership_status(membership: Membership) -> str:
    now = _now()
    if complimentary_is_active(membership, now):
        return "complimentary"
    if store_is_active(membership, now):
        return "active"
    if trial_is_active(membership, now):
        return "trial"
    return "expired"


def serialize_membership(membership: Membership | None, user=None) -> dict | None:
    if membership is None:
        return None
    now = _now()
    if user is not None and user.is_staff and getattr(settings, "IAP_STAFF_COMPLIMENTARY", False):
        return {
            "status": "complimentary",
            "is_active": True,
            "plan": membership.plan or None,
            "source": "complimentary",
            "trial_ends_at": membership.trial_ends_at.isoformat() if membership.trial_ends_at else None,
            "expires_at": None,
            "auto_renewing": False,
            "covers_couple": membership.partnership_id is not None,
            "product_id": membership.product_id or None,
        }
    status = membership_status(membership)
    if status == "complimentary":
        expires_at = membership.complimentary_until
        source = "complimentary"
    elif status == "active":
        expires_at = membership.store_expires_at
        source = "store"
    elif status == "trial":
        expires_at = membership.trial_ends_at
        source = "trial"
    else:
        expires_at = membership.store_expires_at or membership.trial_ends_at
        source = "none"
    return {
        "status": status,
        "is_active": status != "expired",
        "plan": membership.plan or None,
        "source": source,
        "trial_ends_at": membership.trial_ends_at.isoformat() if membership.trial_ends_at else None,
        "expires_at": expires_at.isoformat() if expires_at else None,
        "auto_renewing": bool(membership.auto_renewing and store_is_active(membership, now)),
        "covers_couple": membership.partnership_id is not None,
        "product_id": membership.product_id or None,
    }


def start_trial_fields(now=None) -> dict:
    now = now or _now()
    return {
        "trial_started_at": now,
        "trial_ends_at": now + trial_length(),
    }


def create_trial_membership(*, user=None, partnership=None, joined_at=None) -> Membership:
    if bool(user) == bool(partnership):
        raise ValueError("Membership must belong to a user or a partnership.")
    now = joined_at or _now()
    return Membership.objects.create(
        user=user,
        partnership=partnership,
        **start_trial_fields(now),
    )


def ensure_user_membership(user: User) -> Membership:
    from accounts.partnerships import get_user_partnership

    partnership = get_user_partnership(user)
    if partnership is not None:
        existing = Membership.objects.filter(partnership=partnership).first()
        if existing:
            return existing
        personal = Membership.objects.filter(user=user).first()
        if personal:
            return attach_membership_to_partnership(user, partnership)
        return create_trial_membership(partnership=partnership, joined_at=user.date_joined)
    existing = Membership.objects.filter(user=user).first()
    if existing:
        return existing
    return create_trial_membership(user=user, joined_at=user.date_joined)


def get_membership_for_user(user: User) -> Membership | None:
    from accounts.partnerships import get_user_partnership

    partnership = get_user_partnership(user)
    if partnership is not None:
        membership = Membership.objects.filter(partnership=partnership).first()
        if membership:
            return membership
    return Membership.objects.filter(user=user).first()


def is_entitled(user: User) -> bool:
    if user.is_staff and getattr(settings, "IAP_STAFF_COMPLIMENTARY", False):
        return True
    membership = get_membership_for_user(user)
    if membership is None:
        membership = ensure_user_membership(user)
    return membership_is_active(membership, user=user)


def attach_membership_to_partnership(user: User, partnership: Partnership) -> Membership:
    """Move the caller's membership onto the couple space, merging with any existing one."""
    with transaction.atomic():
        couple = Membership.objects.select_for_update().filter(partnership=partnership).first()
        personal = Membership.objects.select_for_update().filter(user=user).first()
        if couple is None and personal is None:
            return create_trial_membership(partnership=partnership, joined_at=user.date_joined)
        if couple is None:
            personal.user = None
            personal.partnership = partnership
            personal.save(update_fields=["user", "partnership", "updated_at"])
            return personal
        if personal is None:
            return couple
        _merge_into(couple, personal)
        personal.delete()
        return couple


def detach_membership_to_user(user: User) -> Membership:
    """Give the user their own membership before they leave a couple space."""
    from accounts.partnerships import get_user_partnership

    partnership = get_user_partnership(user)
    personal = Membership.objects.filter(user=user).first()
    if partnership is None:
        return personal or create_trial_membership(user=user, joined_at=user.date_joined)

    couple = Membership.objects.filter(partnership=partnership).first()
    remaining = partnership.members.exclude(user=user).count()

    if remaining == 0:
        if couple is not None:
            couple.partnership = None
            couple.user = user
            couple.save(update_fields=["user", "partnership", "updated_at"])
            return couple
        return personal or create_trial_membership(user=user, joined_at=user.date_joined)

    if personal is not None:
        return personal

    fields = start_trial_fields(user.date_joined)
    if couple is not None:
        if couple.purchased_by_id == user.id:
            fields.update(
                {
                    "plan": couple.plan,
                    "store": couple.store,
                    "product_id": couple.product_id,
                    "original_transaction_id": couple.original_transaction_id,
                    "latest_transaction_id": couple.latest_transaction_id,
                    "purchase_token": couple.purchase_token,
                    "auto_renewing": couple.auto_renewing,
                    "store_expires_at": couple.store_expires_at,
                    "purchased_by": couple.purchased_by,
                    "trial_started_at": couple.trial_started_at,
                    "trial_ends_at": couple.trial_ends_at,
                }
            )
            couple.plan = ""
            couple.store = ""
            couple.product_id = ""
            couple.original_transaction_id = ""
            couple.latest_transaction_id = ""
            couple.purchase_token = ""
            couple.auto_renewing = False
            couple.store_expires_at = None
            couple.purchased_by = None
            couple.save(
                update_fields=[
                    "plan",
                    "store",
                    "product_id",
                    "original_transaction_id",
                    "latest_transaction_id",
                    "purchase_token",
                    "auto_renewing",
                    "store_expires_at",
                    "purchased_by",
                    "updated_at",
                ]
            )
        else:
            fields["trial_started_at"] = couple.trial_started_at
            fields["trial_ends_at"] = couple.trial_ends_at
            if couple.complimentary and couple.granted_by_id == user.id:
                fields["complimentary"] = True
                fields["complimentary_until"] = couple.complimentary_until
                fields["granted_by"] = couple.granted_by
                fields["granted_at"] = couple.granted_at
                fields["grant_note"] = couple.grant_note
                couple.complimentary = False
                couple.complimentary_until = None
                couple.granted_by = None
                couple.granted_at = None
                couple.grant_note = ""
                couple.save(
                    update_fields=[
                        "complimentary",
                        "complimentary_until",
                        "granted_by",
                        "granted_at",
                        "grant_note",
                        "updated_at",
                    ]
                )
    return Membership.objects.create(user=user, **fields)


def _later(a, b):
    if a is None:
        return b
    if b is None:
        return a
    return max(a, b)


def _merge_into(target: Membership, incoming: Membership) -> None:
    if incoming.complimentary:
        if not target.complimentary:
            target.complimentary = True
            target.complimentary_until = incoming.complimentary_until
            target.granted_by = incoming.granted_by
            target.granted_at = incoming.granted_at
            target.grant_note = incoming.grant_note
        else:
            if target.complimentary_until is not None:
                if incoming.complimentary_until is None:
                    target.complimentary_until = None
                else:
                    target.complimentary_until = _later(
                        target.complimentary_until, incoming.complimentary_until
                    )
    incoming_store = store_is_active(incoming) or (
        incoming.store_expires_at and not store_is_active(target)
    )
    if incoming.original_transaction_id and (
        not target.original_transaction_id or incoming_store
    ):
        if (
            target.original_transaction_id
            and target.original_transaction_id != incoming.original_transaction_id
        ):
            pass
        else:
            target.plan = incoming.plan or target.plan
            target.store = incoming.store or target.store
            target.product_id = incoming.product_id or target.product_id
            target.original_transaction_id = incoming.original_transaction_id
            target.latest_transaction_id = incoming.latest_transaction_id
            target.purchase_token = incoming.purchase_token or target.purchase_token
            target.auto_renewing = incoming.auto_renewing
            target.store_expires_at = _later(target.store_expires_at, incoming.store_expires_at)
            target.purchased_by = incoming.purchased_by or target.purchased_by
    target.trial_started_at = target.trial_started_at or incoming.trial_started_at
    if target.trial_ends_at is None:
        target.trial_ends_at = incoming.trial_ends_at
    target.save()


def grant_complimentary_membership(
    user: User,
    *,
    granted_by=None,
    until=None,
    note: str = "",
) -> Membership:
    membership = ensure_user_membership(user)
    from accounts.partnerships import get_user_partnership

    partnership = get_user_partnership(user)
    if partnership is not None and membership.partnership_id != partnership.id:
        membership = attach_membership_to_partnership(user, partnership)
    membership.complimentary = True
    membership.complimentary_until = until
    membership.granted_by = granted_by
    membership.granted_at = _now()
    membership.grant_note = note
    membership.save(
        update_fields=[
            "complimentary",
            "complimentary_until",
            "granted_by",
            "granted_at",
            "grant_note",
            "updated_at",
        ]
    )
    return membership


def revoke_complimentary_membership(user: User) -> Membership:
    membership = ensure_user_membership(user)
    membership.complimentary = False
    membership.complimentary_until = None
    membership.granted_by = None
    membership.granted_at = None
    membership.grant_note = ""
    membership.save(
        update_fields=[
            "complimentary",
            "complimentary_until",
            "granted_by",
            "granted_at",
            "grant_note",
            "updated_at",
        ]
    )
    return membership


def apply_verified_purchase(user: User, purchase: dict) -> Membership:
    """Attach a verified store subscription to the user's couple (or personal) membership."""
    original_id = purchase.get("original_transaction_id") or ""
    if not original_id:
        raise ValidationError({"purchase_token": "Missing original transaction id."})

    with transaction.atomic():
        membership = ensure_user_membership(user)
        existing = (
            Membership.objects.select_for_update()
            .filter(original_transaction_id=original_id)
            .first()
        )
        if existing and existing.id != membership.id:
            from accounts.partnerships import get_user_partnership

            partnership = get_user_partnership(user)
            same_couple = (
                partnership is not None and existing.partnership_id == partnership.id
            )
            same_buyer = existing.purchased_by_id == user.id or existing.user_id == user.id
            if not (same_couple or same_buyer):
                raise ValidationError(
                    {"purchase_token": "That subscription is already linked to another NightCap account."}
                )
            membership = existing

        membership.plan = purchase["plan"]
        membership.store = purchase["store"]
        membership.product_id = purchase["product_id"]
        membership.original_transaction_id = original_id
        membership.latest_transaction_id = purchase.get("transaction_id") or original_id
        membership.purchase_token = purchase.get("purchase_token") or ""
        membership.auto_renewing = bool(purchase.get("auto_renewing", True))
        membership.store_expires_at = purchase["expires_at"]
        membership.purchased_by = user
        membership.save(
            update_fields=[
                "plan",
                "store",
                "product_id",
                "original_transaction_id",
                "latest_transaction_id",
                "purchase_token",
                "auto_renewing",
                "store_expires_at",
                "purchased_by",
                "updated_at",
            ]
        )
        return membership


def apply_store_notification(original_transaction_id: str, updates: dict) -> Membership | None:
    membership = Membership.objects.filter(original_transaction_id=original_transaction_id).first()
    if membership is None:
        return None
    for field, value in updates.items():
        setattr(membership, field, value)
    membership.save()
    return membership
