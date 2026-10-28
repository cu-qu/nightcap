import logging

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts.models import (
    ContentReport,
    PartnerBlock,
    Partnership,
    PartnershipInvite,
    PartnershipMember,
    User,
    UserProfile,
    generate_partnership_invite_code,
)

logger = logging.getLogger(__name__)


def get_user_partnership(user) -> Partnership | None:
    try:
        return user.partnership_membership.partnership
    except PartnershipMember.DoesNotExist:
        return None


def partnership_is_paired(partnership: Partnership | None) -> bool:
    """True once both people have joined the couple space."""
    if partnership is None:
        return False
    return partnership.members.count() >= 2


def get_partner_user(user):
    """The other person in the caller's couple space, if linked."""
    partnership = get_user_partnership(user)
    if partnership is None:
        return None
    member = partnership.members.exclude(user=user).select_related("user").first()
    return member.user if member else None


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


def users_are_blocked(left, right) -> bool:
    if left is None or right is None or left.id == right.id:
        return False
    return PartnerBlock.objects.filter(
        Q(blocker=left, blocked=right) | Q(blocker=right, blocked=left)
    ).exists()


def _reject_if_blocked(user, other, *, field: str, message: str) -> None:
    if users_are_blocked(user, other):
        raise ValidationError({field: message})


def send_partner_invite(partnership: Partnership, invited_by, email: str) -> PartnershipInvite:
    from accounts.emails import PartnerInviteEmail

    email = email.strip().lower()
    existing_user = User.objects.filter(email__iexact=email).first()
    _reject_if_blocked(
        invited_by,
        existing_user,
        field="email",
        message="You can't invite this person.",
    )
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

    for member in partnership.members.select_related("user"):
        _reject_if_blocked(
            user,
            member.user,
            field="invite_code",
            message="You can't join this couple space.",
        )

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


def block_partner(user):
    """Unlink and refuse any later invite between these two accounts."""
    partner = get_partner_user(user)
    if partner is None:
        raise ValidationError("You're not linked with a partner.")
    with transaction.atomic():
        PartnerBlock.objects.get_or_create(blocker=user, blocked=partner)
        leave_partnership(user)
    return partner


def report_partner_content(user, *, nightcap_uuid: str | None = None, note: str = "") -> ContentReport:
    """Record a report and hide that moment (or everything they shared) from the reporter."""
    partner = get_partner_user(user)
    if partner is None:
        raise ValidationError("You're not linked with a partner.")

    nightcap = None
    if nightcap_uuid:
        from entries.models import NightCap

        nightcap = NightCap.objects.filter(uuid=nightcap_uuid, user=partner).first()
        if nightcap is None:
            raise ValidationError({"nightcap_uuid": "That moment isn't from your partner."})

    report, _created = ContentReport.objects.get_or_create(
        reporter=user,
        author=partner,
        nightcap=nightcap,
        defaults={"note": (note or "")[:500]},
    )
    _email_content_report(report)
    return report


def _email_content_report(report: ContentReport) -> None:
    recipient = getattr(settings, "SUPPORT_EMAIL", "night_cap_app@proton.me")
    moment = ""
    if report.nightcap_id:
        moment = (
            f"\nDate: {report.nightcap.date.isoformat()}"
            f"\nMoment id: {report.nightcap.uuid}"
        )
    body = (
        f"Reporter: {report.reporter.username}\n"
        f"Partner: {report.author.username}"
        f"{moment}\n"
        f"Note: {report.note or '(none)'}"
    )
    try:
        send_mail(
            subject="NightCap content report",
            message=body,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
            recipient_list=[recipient],
            fail_silently=True,
        )
    except Exception:
        logger.exception("Could not email content report %s", report.pk)
