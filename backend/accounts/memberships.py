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


_STORE_FIELDS = (
    "plan",
    "store",
    "product_id",
    "original_transaction_id",
    "latest_transaction_id",
    "purchase_token",
    "auto_renewing",
    "store_expires_at",
    "purchased_by",
)


def _snapshot_store(membership: Membership) -> dict | None:
    if not membership.original_transaction_id:
        return None
    return {field: getattr(membership, field) for field in _STORE_FIELDS}


def _clear_store(membership: Membership) -> None:
    membership.plan = ""
    membership.store = ""
    membership.product_id = ""
    membership.original_transaction_id = ""
    membership.latest_transaction_id = ""
    membership.purchase_token = ""
    membership.auto_renewing = False
    membership.store_expires_at = None
    membership.purchased_by = None


def _apply_store(membership: Membership, snapshot: dict) -> None:
    for field, value in snapshot.items():
        setattr(membership, field, value)


def _release_store(membership: Membership) -> None:
    """Clear a receipt and save it before another row takes that transaction id."""
    _clear_store(membership)
    membership.save(update_fields=[*_STORE_FIELDS, "updated_at"])


def _assign_personal_trial(membership: Membership, user: User) -> None:
    trial = start_trial_fields(user.date_joined)
    membership.trial_started_at = trial["trial_started_at"]
    membership.trial_ends_at = trial["trial_ends_at"]


def _clear_complimentary(membership: Membership) -> None:
    membership.complimentary = False
    membership.complimentary_until = None
    membership.granted_by = None
    membership.granted_at = None
    membership.grant_note = ""


def _take_complimentary(membership: Membership, user: User) -> dict | None:
    """Pull a comp grant off a shared membership when the person who granted it leaves."""
    if not membership.complimentary or membership.granted_by_id != user.id:
        return None
    snapshot = {
        "complimentary": True,
        "complimentary_until": membership.complimentary_until,
        "granted_by": membership.granted_by,
        "granted_at": membership.granted_at,
        "grant_note": membership.grant_note,
    }
    _clear_complimentary(membership)
    return snapshot


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
        keep_personal = _merge_into(couple, personal)
        if not keep_personal:
            personal.delete()
        return couple


def detach_membership_to_user(user: User) -> Membership:
    """Give the user their own membership before they leave a couple space.

    The store receipt stays with the person who paid. Everyone else goes back to
    the trial that started when they signed up, not their partner's trial.
    """
    from accounts.partnerships import get_user_partnership

    with transaction.atomic():
        partnership = get_user_partnership(user)
        personal = Membership.objects.select_for_update().filter(user=user).first()
        if partnership is None:
            return personal or create_trial_membership(user=user, joined_at=user.date_joined)

        couple = Membership.objects.select_for_update().filter(partnership=partnership).first()
        stayer = (
            partnership.members.exclude(user=user).select_related("user").first()
        )
        if stayer is None:
            return _detach_last_member(user, personal, couple)
        return _detach_with_stayer(user, personal, couple, stayer.user)


def _detach_last_member(user: User, personal: Membership | None, couple: Membership | None) -> Membership:
    """The only person in the space keeps the receipt if it is theirs."""
    if couple is None:
        return personal or create_trial_membership(user=user, joined_at=user.date_joined)
    if couple.purchased_by_id not in (None, user.id):
        _release_store(couple)
    if personal is not None:
        parked = _snapshot_store(personal)
        if parked and parked["original_transaction_id"] != couple.original_transaction_id:
            _release_store(personal)
            if not couple.original_transaction_id:
                _apply_store(couple, parked)
        personal.delete()
    couple.partnership = None
    couple.user = user
    couple.save(update_fields=["user", "partnership", "updated_at", *_STORE_FIELDS])
    return couple


def _detach_with_stayer(
    user: User,
    personal: Membership | None,
    couple: Membership | None,
    stayer: User,
) -> Membership:
    if (
        personal is not None
        and not personal.original_transaction_id
        and not (personal.complimentary and personal.granted_by_id == user.id)
    ):
        personal.delete()
        personal = None

    if couple is not None and couple.purchased_by_id == user.id:
        leaver_store = _snapshot_store(couple)
        _release_store(couple)
        stayer_personal = Membership.objects.select_for_update().filter(user=stayer).first()
        if stayer_personal is not None and stayer_personal.original_transaction_id:
            stayer_store = _snapshot_store(stayer_personal)
            _release_store(stayer_personal)
            if stayer_store:
                _apply_store(couple, stayer_store)
            stayer_personal.delete()
        comp = _take_complimentary(couple, user)
        _assign_personal_trial(couple, stayer)
        couple.save()
        if personal is not None:
            personal.delete()
        fields = start_trial_fields(user.date_joined)
        if leaver_store:
            fields.update(leaver_store)
        if comp:
            fields.update(comp)
        return Membership.objects.create(user=user, **fields)

    if personal is None:
        personal = Membership(user=user, **start_trial_fields(user.date_joined))
    else:
        _assign_personal_trial(personal, user)
    if couple is not None:
        comp = _take_complimentary(couple, user)
        if comp:
            for field, value in comp.items():
                setattr(personal, field, value)
        _assign_personal_trial(couple, stayer)
        couple.save()
    personal.save()
    return personal


def _later(a, b):
    if a is None:
        return b
    if b is None:
        return a
    return max(a, b)


def _merge_into(target: Membership, incoming: Membership) -> bool:
    """Merge a joining membership into the couple row.

    Returns True when the joiner's row must stay, because it still holds a
    different store receipt than the one covering the couple.
    """
    if incoming.complimentary:
        if not target.complimentary:
            target.complimentary = True
            target.complimentary_until = incoming.complimentary_until
            target.granted_by = incoming.granted_by
            target.granted_at = incoming.granted_at
            target.grant_note = incoming.grant_note
        elif target.complimentary_until is not None:
            if incoming.complimentary_until is None:
                target.complimentary_until = None
            else:
                target.complimentary_until = _later(
                    target.complimentary_until, incoming.complimentary_until
                )
    target.trial_started_at = _earlier(target.trial_started_at, incoming.trial_started_at)
    target.trial_ends_at = _later(target.trial_ends_at, incoming.trial_ends_at)

    target_store = _snapshot_store(target)
    incoming_store = _snapshot_store(incoming)
    keep_personal = False
    if (
        incoming_store
        and target_store
        and incoming_store["original_transaction_id"] != target_store["original_transaction_id"]
    ):
        couple_wins = store_is_active(target) or not store_is_active(incoming)
        _release_store(target)
        _release_store(incoming)
        if couple_wins:
            _apply_store(target, target_store)
            _apply_store(incoming, incoming_store)
            _clear_complimentary(incoming)
            if incoming.user_id is not None:
                _assign_personal_trial(incoming, incoming.user)
            keep_personal = True
        else:
            _apply_store(target, incoming_store)
            _park_store(target_store)
    elif incoming_store:
        _release_store(incoming)
        _apply_store(target, incoming_store)
        if target_store:
            target.store_expires_at = _later(
                target_store["store_expires_at"], incoming_store["store_expires_at"]
            )
            target.purchased_by = incoming_store["purchased_by"] or target_store["purchased_by"]
    target.save()
    if keep_personal:
        incoming.save()
    return keep_personal


def _park_store(snapshot: dict) -> None:
    """Keep a receipt that is not covering the couple on the person who paid."""
    owner = snapshot.get("purchased_by")
    if owner is None:
        return
    personal = Membership.objects.select_for_update().filter(user=owner).first()
    if personal is None:
        personal = Membership(user=owner, **start_trial_fields(owner.date_joined))
    elif personal.original_transaction_id not in ("", snapshot["original_transaction_id"]):
        return
    elif personal.original_transaction_id:
        _release_store(personal)
    _apply_store(personal, snapshot)
    _assign_personal_trial(personal, owner)
    personal.save()


def _earlier(a, b):
    if a is None:
        return b
    if b is None:
        return a
    return min(a, b)


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
