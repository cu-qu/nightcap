from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts.models import (
    Partnership,
    PartnershipInvite,
    PartnershipMember,
    UserProfile,
    generate_partnership_invite_code,
)


def get_user_partnership(user) -> Partnership | None:
    try:
        return user.partnership_membership.partnership
    except PartnershipMember.DoesNotExist:
        return None


def serialize_partnership(partnership: Partnership | None) -> dict | None:
    if partnership is None:
        return None
    members = (
        partnership.members.select_related("user")
        .order_by("joined_at")
    )
    pending = (
        partnership.email_invites.filter(accepted_at__isnull=True)
        .order_by("-created_at")
        .first()
    )
    return {
        "uuid": str(partnership.uuid),
        "invite_code": partnership.invite_code,
        "is_full": partnership.members.count() >= 2,
        "pending_email": pending.email if pending else None,
        "members": [
            {
                "id": str(member.user_id),
                "username": member.user.username,
                "email": member.user.email,
                "role": member.role,
            }
            for member in members
        ],
    }


def ensure_partnership(user) -> Partnership:
    existing = get_user_partnership(user)
    if existing:
        return existing
    with transaction.atomic():
        partnership = Partnership(created_by=user)
        partnership.save()
        PartnershipMember.objects.create(
            partnership=partnership,
            user=user,
            role=PartnershipMember.ROLE_OWNER,
        )
        profile, _ = UserProfile.objects.get_or_create(
            user=user,
            defaults={"preferred_language": user.preferred_language},
        )
        if profile.tracking_mode != UserProfile.MODE_COUPLE:
            profile.tracking_mode = UserProfile.MODE_COUPLE
            profile.save(update_fields=["tracking_mode", "updated_at"])
    from accounts.memberships import attach_membership_to_partnership

    attach_membership_to_partnership(user, partnership)
    return partnership


def regenerate_invite_code(partnership: Partnership) -> Partnership:
    for _ in range(8):
        code = generate_partnership_invite_code()
        if not Partnership.objects.filter(invite_code=code).exists():
            partnership.invite_code = code
            partnership.save(update_fields=["invite_code", "updated_at"])
            return partnership
    raise ValidationError("Could not generate a new invite code. Try again.")


def send_partner_invite(partnership: Partnership, invited_by, email: str) -> PartnershipInvite:
    from accounts.emails import PartnerInviteEmail

    email = email.strip().lower()
    invite = PartnershipInvite.objects.create(
        partnership=partnership,
        email=email,
        invited_by=invited_by,
    )
    PartnerInviteEmail(
        to_email=email,
        inviter_name=invited_by.username,
        invite_code=partnership.invite_code,
    ).send()
    return invite


def abandon_unpaired_partnership(user) -> None:
    """Drop a 1-person couple space so the user can join someone else's code."""
    existing = get_user_partnership(user)
    if existing is None:
        return
    if existing.members.count() >= 2:
        raise ValidationError(
            {"invite_code": "You're already connected with a partner on NightCap."}
        )
    from accounts.memberships import detach_membership_to_user

    detach_membership_to_user(user)
    partnership_id = existing.id
    PartnershipMember.objects.filter(user=user, partnership=existing).delete()
    if not PartnershipMember.objects.filter(partnership_id=partnership_id).exists():
        Partnership.objects.filter(id=partnership_id).delete()


def _personalize_partnership_goals(partnership: Partnership) -> None:
    """Together goals stop rolling up once the couple is no longer linked."""
    from goals.models import Goal

    now = timezone.now()
    Goal.objects.filter(
        partnership=partnership,
        scope=Goal.SCOPE_SHARED,
        accepted=False,
    ).update(is_active=False, partnership=None, updated_at=now)
    Goal.objects.filter(partnership=partnership).update(
        scope=Goal.SCOPE_PERSONAL,
        partnership=None,
        proposed_by=None,
        accepted=True,
        updated_at=now,
    )


def leave_partnership(user) -> None:
    """Unlink from the current couple space. The other person keeps waiting with a new code."""
    existing = get_user_partnership(user)
    if existing is None:
        raise ValidationError("You're not in a couple space.")

    with transaction.atomic():
        from accounts.memberships import detach_membership_to_user

        detach_membership_to_user(user)
        _personalize_partnership_goals(existing)
        remaining = list(
            PartnershipMember.objects.filter(partnership=existing).exclude(user=user)
        )
        PartnershipMember.objects.filter(user=user, partnership=existing).delete()
        PartnershipInvite.objects.filter(
            partnership=existing,
            accepted_at__isnull=True,
        ).delete()

        profile, _ = UserProfile.objects.get_or_create(
            user=user,
            defaults={"preferred_language": user.preferred_language},
        )
        if profile.tracking_mode != UserProfile.MODE_SOLO:
            profile.tracking_mode = UserProfile.MODE_SOLO
            profile.save(update_fields=["tracking_mode", "updated_at"])

        if remaining:
            PartnershipMember.objects.filter(id=remaining[0].id).update(
                role=PartnershipMember.ROLE_OWNER
            )
            regenerate_invite_code(existing)
        else:
            Partnership.objects.filter(id=existing.id).delete()


def accept_invite_code(user, code: str) -> Partnership:
    normalized = (code or "").strip().upper().replace(" ", "").replace("-", "")
    if not normalized:
        raise ValidationError({"invite_code": "Enter an invite code."})

    partnership = Partnership.objects.filter(invite_code=normalized).first()
    if partnership is None:
        raise ValidationError({"invite_code": "That invite code is invalid."})

    existing = get_user_partnership(user)
    if existing is not None:
        if existing.id == partnership.id:
            return existing
        if existing.members.count() >= 2:
            raise ValidationError(
                {"invite_code": "You're already connected with a partner on NightCap."}
            )

    if partnership.members.count() >= 2:
        raise ValidationError({"invite_code": "This couple already has two people."})

    with transaction.atomic():
        abandon_unpaired_partnership(user)
        PartnershipMember.objects.create(
            partnership=partnership,
            user=user,
            role=PartnershipMember.ROLE_PARTNER,
        )
        profile, _ = UserProfile.objects.get_or_create(
            user=user,
            defaults={"preferred_language": user.preferred_language},
        )
        profile.tracking_mode = UserProfile.MODE_COUPLE
        profile.save(update_fields=["tracking_mode", "updated_at"])
        PartnershipInvite.objects.filter(
            partnership=partnership,
            email__iexact=user.email,
            accepted_at__isnull=True,
        ).update(accepted_at=timezone.now(), accepted_by=user)

    from accounts.memberships import attach_membership_to_partnership
    from goals.onboarding_services import copy_shared_goals_to_user

    attach_membership_to_partnership(user, partnership)

    copy_shared_goals_to_user(partnership, user)
    return partnership
