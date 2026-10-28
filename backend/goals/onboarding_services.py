from decimal import Decimal

from django.utils import timezone

from accounts.models import UserProfile
from categories.defaults import create_default_groups_for_user
from categories.models import CategoryGroup, TrackingCategory, default_metric_for_type
from entries.models import Entry
from goals.models import Goal, GoalTemplate


QUANTITY_UNITS = {
    "minutes",
    "miles",
    "km",
    "reps",
    "sessions",
    "count",
    "pages",
    "glasses",
}


def _metric_for_template(template: GoalTemplate) -> tuple[str, str]:
    metric_kind, unit = default_metric_for_type(template.category_type)
    custom = (getattr(template, "category_unit", "") or "").strip()
    if not custom:
        return metric_kind, unit
    if custom == "usd":
        return TrackingCategory.METRIC_AMOUNT, custom
    if custom in QUANTITY_UNITS:
        return TrackingCategory.METRIC_QUANTITY, custom
    return TrackingCategory.METRIC_QUANTITY, custom


def _group_for_template(user, template: GoalTemplate):
    groups = create_default_groups_for_user(user)
    key = template.category_group_key
    if key and key in groups:
        return groups[key]
    if template.category_type in (
        TrackingCategory.FINANCE_EXPENSE,
        TrackingCategory.FINANCE_INCOME,
    ):
        return groups.get(CategoryGroup.KEY_DAILY_SPEND)
    return groups.get(CategoryGroup.KEY_FOLLOW_UP)


def ensure_category_for_template(user, template: GoalTemplate) -> tuple[TrackingCategory, bool]:
    metric_kind, unit = _metric_for_template(template)
    group = _group_for_template(user, template)
    defaults = {
        "metric_kind": metric_kind,
        "unit": unit,
        "icon": template.category_icon,
        "emoji": getattr(template, "category_emoji", "") or "",
        "is_default": True,
        "group": group,
    }
    category, created = TrackingCategory.objects.get_or_create(
        user=user,
        name=template.category_name,
        type=template.category_type,
        defaults=defaults,
    )
    updates = []
    if template.category_icon and not category.icon:
        category.icon = template.category_icon
        updates.append("icon")
    emoji = getattr(template, "category_emoji", "") or ""
    if emoji and not category.emoji:
        category.emoji = emoji
        updates.append("emoji")
    if group and category.group_id is None:
        category.group = group
        updates.append("group")
    unit_changed = category.unit != unit or category.metric_kind != metric_kind
    if unit_changed and (
        created or not Entry.objects.filter(category=category).exists()
    ):
        category.unit = unit
        category.metric_kind = metric_kind
        updates.extend(["unit", "metric_kind"])
    if updates:
        updates.append("updated_at")
        category.save(update_fields=list(dict.fromkeys(updates)))
    return category, created


def ensure_category_like(user, source: TrackingCategory) -> TrackingCategory:
    groups = create_default_groups_for_user(user)
    group = None
    if source.group_id and source.group:
        group = groups.get(source.group.key)
    category, created = TrackingCategory.objects.get_or_create(
        user=user,
        name=source.name,
        type=source.type,
        defaults={
            "metric_kind": source.metric_kind,
            "unit": source.unit,
            "icon": source.icon,
            "emoji": source.emoji,
            "is_default": True,
            "group": group,
        },
    )
    if not created:
        updates = []
        if source.emoji and not category.emoji:
            category.emoji = source.emoji
            updates.append("emoji")
        if group and category.group_id is None:
            category.group = group
            updates.append("group")
        if updates:
            updates.append("updated_at")
            category.save(update_fields=updates)
    return category


def _clear_personal_snapshot(goal: Goal) -> None:
    goal.personal_snapshot_target = None
    goal.personal_snapshot_period = ""
    goal.personal_snapshot_direction = ""


def accept_shared_goal(goal: Goal) -> None:
    goal.accepted = True
    _clear_personal_snapshot(goal)
    goal.save(
        update_fields=[
            "accepted",
            "personal_snapshot_target",
            "personal_snapshot_period",
            "personal_snapshot_direction",
            "updated_at",
        ]
    )


def _keep_as_personal(goal: Goal) -> None:
    goal.scope = Goal.SCOPE_PERSONAL
    goal.partnership = None
    goal.proposed_by = None
    goal.accepted = True
    _clear_personal_snapshot(goal)
    goal.save(
        update_fields=[
            "scope",
            "partnership",
            "proposed_by",
            "accepted",
            "personal_snapshot_target",
            "personal_snapshot_period",
            "personal_snapshot_direction",
            "updated_at",
        ]
    )


def _restore_or_drop_copy(goal: Goal) -> None:
    """Decline a proposal. Restore a personal goal when one was overwritten."""
    if goal.personal_snapshot_period:
        goal.scope = Goal.SCOPE_PERSONAL
        goal.target_value = goal.personal_snapshot_target
        goal.period = goal.personal_snapshot_period
        goal.direction = goal.personal_snapshot_direction
        goal.partnership = None
        goal.proposed_by = None
        goal.accepted = True
        goal.is_active = True
        _clear_personal_snapshot(goal)
        goal.save(
            update_fields=[
                "scope",
                "target_value",
                "period",
                "direction",
                "partnership",
                "proposed_by",
                "accepted",
                "is_active",
                "personal_snapshot_target",
                "personal_snapshot_period",
                "personal_snapshot_direction",
                "updated_at",
            ]
        )
        return
    goal.is_active = False
    goal.partnership = None
    goal.save(update_fields=["is_active", "partnership", "updated_at"])


def _shared_copies(goal: Goal):
    if not goal.partnership_id:
        return [goal]
    return list(
        Goal.objects.filter(
            partnership_id=goal.partnership_id,
            scope=Goal.SCOPE_SHARED,
            is_active=True,
            category__name=goal.category.name,
            category__type=goal.category.type,
        ).select_related("category")
    )


def withdraw_together_proposal(goal: Goal) -> None:
    """Stop a Together proposal. The proposer keeps it as a personal goal."""
    related = _shared_copies(goal)
    proposer_id = next((item.proposed_by_id for item in related if item.proposed_by_id), None)
    if proposer_id is None:
        proposer_id = goal.user_id
    for item in related:
        if item.user_id == proposer_id:
            _keep_as_personal(item)
        else:
            _restore_or_drop_copy(item)


def release_other_shared_copies(goal: Goal) -> None:
    """When one person leaves a Together goal, settle the other person's copy."""
    if goal.scope != Goal.SCOPE_SHARED or not goal.partnership_id:
        return
    others = [item for item in _shared_copies(goal) if item.pk != goal.pk]
    for other in others:
        if other.accepted and not other.personal_snapshot_period:
            _keep_as_personal(other)
        else:
            _restore_or_drop_copy(other)


def _upsert_goal_for_category(
    *,
    user,
    category: TrackingCategory,
    name: str,
    period: str,
    direction: str,
    target_value: Decimal,
    warn_at_percent: int,
    scope: str,
    partnership,
    template_slug: str,
    accepted: bool = True,
    proposed_by=None,
) -> tuple[Goal, bool]:
    existing = Goal.objects.filter(user=user, category=category, is_active=True).first()
    previously_personal = existing is not None and existing.scope != Goal.SCOPE_SHARED
    snapshot = None
    if previously_personal and existing is not None:
        snapshot = (existing.target_value, existing.period, existing.direction)
    goal, created = Goal.objects.update_or_create(
        user=user,
        category=category,
        is_active=True,
        defaults={
            "name": name,
            "period": period,
            "direction": direction,
            "target_value": target_value,
            "warn_at_percent": warn_at_percent,
            "scope": scope,
            "partnership": partnership if scope == Goal.SCOPE_SHARED else None,
            "template_slug": template_slug,
        },
    )
    if scope != Goal.SCOPE_SHARED:
        return goal, created

    proposer_id = getattr(proposed_by, "pk", None)
    incoming = proposer_id is not None and proposer_id != user.id
    updates: list[str] = []
    if incoming and (created or previously_personal):
        goal.accepted = False
        updates.append("accepted")
        if previously_personal and snapshot and not goal.personal_snapshot_period:
            goal.personal_snapshot_target = snapshot[0]
            goal.personal_snapshot_period = snapshot[1]
            goal.personal_snapshot_direction = snapshot[2]
            updates.extend(
                [
                    "personal_snapshot_target",
                    "personal_snapshot_period",
                    "personal_snapshot_direction",
                ]
            )
    elif created or previously_personal:
        goal.accepted = accepted
        updates.append("accepted")
    if proposed_by is not None and goal.proposed_by_id != proposer_id:
        goal.proposed_by = proposed_by
        updates.append("proposed_by")
    if updates:
        updates.append("updated_at")
        goal.save(update_fields=list(dict.fromkeys(updates)))
    return goal, created


def mirror_shared_goal(source_goal: Goal) -> None:
    if source_goal.scope != Goal.SCOPE_SHARED or not source_goal.partnership_id:
        return
    members = source_goal.partnership.members.exclude(user_id=source_goal.user_id).select_related(
        "user"
    )
    for member in members:
        category = ensure_category_like(member.user, source_goal.category)
        _upsert_goal_for_category(
            user=member.user,
            category=category,
            name=source_goal.name,
            period=source_goal.period,
            direction=source_goal.direction,
            target_value=source_goal.target_value,
            warn_at_percent=source_goal.warn_at_percent,
            scope=Goal.SCOPE_SHARED,
            partnership=source_goal.partnership,
            template_slug=source_goal.template_slug,
            accepted=False,
            proposed_by=source_goal.proposed_by or source_goal.user,
        )


def copy_shared_goals_to_user(partnership, user) -> int:
    """When a partner joins, copy the couple's shared goals onto their account."""
    copied = 0
    sources = (
        Goal.objects.filter(
            partnership=partnership,
            scope=Goal.SCOPE_SHARED,
            is_active=True,
            accepted=True,
        )
        .exclude(user=user)
        .select_related("category", "category__group", "proposed_by")
    )
    seen: set[tuple] = set()
    for goal in sources:
        key = (goal.category.name, goal.category.type, goal.period)
        if key in seen:
            continue
        seen.add(key)
        category = ensure_category_like(user, goal.category)
        _, created = _upsert_goal_for_category(
            user=user,
            category=category,
            name=goal.name,
            period=goal.period,
            direction=goal.direction,
            target_value=goal.target_value,
            warn_at_percent=goal.warn_at_percent,
            scope=Goal.SCOPE_SHARED,
            partnership=partnership,
            template_slug=goal.template_slug,
            accepted=False,
            proposed_by=goal.proposed_by or goal.user,
        )
        if created:
            copied += 1
    return copied


def apply_goal_templates(user, template_selections: list[dict], partnership=None) -> dict:
    """
    Copy selected templates into the user's categories and goals.

    Each selection: {"slug": "...", "target_value": optional, "scope": optional, "period": optional}
    """
    created_goals = []
    updated_goals = []
    created_categories = []
    from accounts.partnerships import partnership_is_paired

    paired = partnership_is_paired(partnership)

    for selection in template_selections:
        slug = selection["slug"]
        template = GoalTemplate.objects.get(slug=slug, is_active=True)
        target_value = selection.get("target_value", template.target_value)
        if not isinstance(target_value, Decimal):
            target_value = Decimal(str(target_value))
        scope = selection.get("scope") or Goal.SCOPE_PERSONAL
        if scope == Goal.SCOPE_SHARED and not paired:
            scope = Goal.SCOPE_PERSONAL
        period = selection.get("period") or template.period
        if period not in (Goal.PERIOD_WEEKLY, Goal.PERIOD_MONTHLY, Goal.PERIOD_DAILY):
            period = template.period

        category, was_created = ensure_category_for_template(user, template)
        if was_created:
            created_categories.append(category)

        goal, goal_created = _upsert_goal_for_category(
            user=user,
            category=category,
            name=template.title,
            period=period,
            direction=template.direction,
            target_value=target_value,
            warn_at_percent=template.warn_at_percent,
            scope=scope,
            partnership=partnership,
            template_slug=template.slug,
            accepted=True,
            proposed_by=user if scope == Goal.SCOPE_SHARED else None,
        )
        if goal_created:
            created_goals.append(goal)
        else:
            updated_goals.append(goal)
        if scope == Goal.SCOPE_SHARED:
            mirror_shared_goal(goal)

    return {
        "created_goals": created_goals,
        "updated_goals": updated_goals,
        "created_categories": created_categories,
    }


def inherited_shared_template_slugs(user) -> list[str]:
    return list(
        Goal.objects.filter(
            user=user,
            is_active=True,
            scope=Goal.SCOPE_SHARED,
            accepted=True,
        )
        .exclude(template_slug="")
        .values_list("template_slug", flat=True)
    )


def _onboarding_group_for_goal(goal: Goal) -> str:
    if goal.template_slug:
        template = GoalTemplate.objects.filter(slug=goal.template_slug).first()
        if template:
            return template.group
    category = goal.category
    if category.group_id and category.group and category.group.key == CategoryGroup.KEY_DAILY_SPEND:
        return GoalTemplate.GROUP_FINANCE
    if category.type == TrackingCategory.FITNESS:
        return GoalTemplate.GROUP_FITNESS
    if category.type in (
        TrackingCategory.FINANCE_EXPENSE,
        TrackingCategory.FINANCE_INCOME,
    ):
        return GoalTemplate.GROUP_FINANCE
    return GoalTemplate.GROUP_HABIT


def _target_label(goal: Goal) -> str:
    category = goal.category
    target = goal.target_value
    period = {
        Goal.PERIOD_DAILY: "day",
        Goal.PERIOD_WEEKLY: "week",
        Goal.PERIOD_MONTHLY: "month",
    }.get(goal.period, goal.period)
    if category.metric_kind == TrackingCategory.METRIC_AMOUNT or category.type in (
        TrackingCategory.FINANCE_EXPENSE,
        TrackingCategory.FINANCE_INCOME,
    ):
        amount = f"${target:.0f}" if target == target.to_integral_value() else f"${target}"
        return f"{amount} / {period}"
    unit = (category.unit or "").strip()
    qty = f"{target:.0f}" if target == target.to_integral_value() else f"{target}"
    if unit:
        return f"{qty} {unit} / {period}"
    return f"{qty} / {period}"


def serialize_together_goal(goal: Goal) -> dict:
    category = goal.category
    proposer = goal.proposed_by or None
    return {
        "uuid": str(goal.uuid),
        "name": goal.display_name,
        "category_name": category.name,
        "category_emoji": (category.emoji or "").strip(),
        "category_icon": category.icon or "",
        "category_type": category.type,
        "category_unit": category.unit or "",
        "group": _onboarding_group_for_goal(goal),
        "period": goal.period,
        "direction": goal.direction,
        "target_value": str(goal.target_value),
        "target_label": _target_label(goal),
        "template_slug": goal.template_slug,
        "proposed_by_username": proposer.username if proposer else "",
        "accepted": bool(goal.accepted),
    }


def together_goals_for_onboarding(user) -> list[dict]:
    """Together goals the user should review — pending copies plus partner's existing ones."""
    from accounts.partnerships import get_user_partnership

    partnership = get_user_partnership(user)
    if partnership is None:
        return []
    own = list(
        Goal.objects.filter(
            user=user,
            partnership=partnership,
            scope=Goal.SCOPE_SHARED,
            is_active=True,
        ).select_related("category", "category__group", "proposed_by")
    )
    if own:
        return [serialize_together_goal(goal) for goal in own]

    partner_member = (
        partnership.members.exclude(user=user).select_related("user").first()
    )
    if partner_member is None:
        return []
    sources = (
        Goal.objects.filter(
            user=partner_member.user,
            partnership=partnership,
            scope=Goal.SCOPE_SHARED,
            is_active=True,
            accepted=True,
        ).select_related("category", "category__group", "proposed_by")
    )
    return [serialize_together_goal(goal) for goal in sources]


def resolve_together_approvals(user, approve_uuids: list) -> None:
    """Accept selected Together goals; drop the rest of this user's pending copies."""
    wanted = {str(item) for item in approve_uuids}
    pending = list(
        Goal.objects.filter(
            user=user,
            is_active=True,
            scope=Goal.SCOPE_SHARED,
            accepted=False,
        )
    )
    for goal in pending:
        if str(goal.uuid) in wanted:
            accept_shared_goal(goal)
        else:
            withdraw_together_proposal(goal)


def list_pending_together_goals(user) -> list[dict]:
    """Together goals that are proposed but not yet approved by both people."""
    from accounts.partnerships import get_partner_user, get_user_partnership, partnership_is_paired
    from goals.services import mutually_accepted_category_keys

    partnership = get_user_partnership(user)
    if not partnership_is_paired(partnership):
        return []
    partner = get_partner_user(user)
    partner_name = partner.username if partner else ""
    live = mutually_accepted_category_keys(partnership.id)
    goals = Goal.objects.filter(
        user=user,
        partnership=partnership,
        scope=Goal.SCOPE_SHARED,
        is_active=True,
    ).select_related("category", "proposed_by")
    rows = []
    for goal in goals:
        if (goal.category.name, goal.category.type) in live:
            continue
        proposer = goal.proposed_by
        rows.append(
            {
                "id": goal.id,
                "uuid": goal.uuid,
                "display_name": goal.display_name,
                "category_name": goal.category.name,
                "category_emoji": (goal.category.emoji or "").strip(),
                "category_icon": goal.category.icon or "",
                "target_label": _target_label(goal),
                "period": goal.period,
                "proposed_by_username": proposer.username if proposer else "",
                "partner_username": partner_name,
                "status": "needs_you" if not goal.accepted else "waiting_on_partner",
            }
        )
    return rows


def get_onboarding_status(user) -> dict:
    from accounts.partnerships import get_user_partnership, serialize_partnership

    profile = UserProfile.objects.filter(user=user).first()
    onboarding_completed = bool(
        profile and profile.onboarding_completed_at is not None
    )
    active_templates = GoalTemplate.objects.filter(is_active=True).count()
    active_goals = (
        Goal.objects.filter(user=user, is_active=True)
        .exclude(scope=Goal.SCOPE_SHARED, accepted=False)
        .count()
    )
    if not onboarding_completed and active_goals > 0:
        onboarding_completed = True
    partnership = get_user_partnership(user)
    return {
        "onboarding_completed": onboarding_completed,
        "onboarding_completed_at": (
            profile.onboarding_completed_at if profile else None
        ),
        "tracking_mode": (
            profile.tracking_mode if profile else UserProfile.MODE_SOLO
        ),
        "active_goal_count": active_goals,
        "available_template_count": active_templates,
        "inherited_shared_templates": inherited_shared_template_slugs(user),
        "together_goals": together_goals_for_onboarding(user),
        "partnership": serialize_partnership(partnership),
    }


def complete_onboarding(user) -> None:
    profile, _ = UserProfile.objects.get_or_create(
        user=user,
        defaults={"preferred_language": user.preferred_language},
    )
    profile.onboarding_completed_at = timezone.now()
    profile.save(update_fields=["onboarding_completed_at", "updated_at"])


def setup_onboarding(
    user,
    *,
    mode: str,
    templates: list[dict],
    invite_email: str = "",
    approve_together: list | None = None,
) -> dict:
    from accounts.partnerships import (
        ensure_partnership,
        send_partner_invite,
        serialize_partnership,
    )

    profile, _ = UserProfile.objects.get_or_create(
        user=user,
        defaults={"preferred_language": user.preferred_language},
    )
    profile.tracking_mode = (
        UserProfile.MODE_COUPLE if mode == UserProfile.MODE_COUPLE else UserProfile.MODE_SOLO
    )
    profile.save(update_fields=["tracking_mode", "updated_at"])

    partnership = None
    email_sent = False
    if mode == UserProfile.MODE_COUPLE:
        partnership = ensure_partnership(user)
        if invite_email:
            try:
                send_partner_invite(partnership, user, invite_email)
                email_sent = True
            except Exception:
                email_sent = False
        for selection in templates:
            if not selection.get("scope"):
                slug = selection.get("slug")
                tmpl = GoalTemplate.objects.filter(slug=slug).first()
                selection["scope"] = (
                    tmpl.suggested_scope if tmpl else Goal.SCOPE_PERSONAL
                )
    else:
        for selection in templates:
            selection["scope"] = Goal.SCOPE_PERSONAL

    if approve_together is not None:
        resolve_together_approvals(user, approve_together)

    accepted_slugs = set(inherited_shared_template_slugs(user))
    templates = [
        selection
        for selection in templates
        if selection.get("slug") not in accepted_slugs
    ]

    result = apply_goal_templates(user, templates, partnership=partnership)
    complete_onboarding(user)
    return {
        **result,
        "email_sent": email_sent,
        "partnership": serialize_partnership(partnership),
        "onboarding": get_onboarding_status(user),
    }
