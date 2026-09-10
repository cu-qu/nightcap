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
) -> tuple[Goal, bool]:
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
        )


def copy_shared_goals_to_user(partnership, user) -> int:
    """When a partner joins, copy the couple's shared goals onto their account."""
    copied = 0
    sources = (
        Goal.objects.filter(
            partnership=partnership,
            scope=Goal.SCOPE_SHARED,
            is_active=True,
        )
        .exclude(user=user)
        .select_related("category", "category__group")
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

    for selection in template_selections:
        slug = selection["slug"]
        template = GoalTemplate.objects.get(slug=slug, is_active=True)
        target_value = selection.get("target_value", template.target_value)
        if not isinstance(target_value, Decimal):
            target_value = Decimal(str(target_value))
        scope = selection.get("scope") or Goal.SCOPE_PERSONAL
        if scope == Goal.SCOPE_SHARED and partnership is None:
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
        Goal.objects.filter(user=user, is_active=True, scope=Goal.SCOPE_SHARED)
        .exclude(template_slug="")
        .values_list("template_slug", flat=True)
    )


def get_onboarding_status(user) -> dict:
    from accounts.partnerships import get_user_partnership, serialize_partnership

    profile = UserProfile.objects.filter(user=user).first()
    onboarding_completed = bool(
        profile and profile.onboarding_completed_at is not None
    )
    active_templates = GoalTemplate.objects.filter(is_active=True).count()
    active_goals = Goal.objects.filter(user=user, is_active=True).count()
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
        "partnership": serialize_partnership(partnership),
    }


def complete_onboarding(user) -> None:
    profile, _ = UserProfile.objects.get_or_create(
        user=user,
        defaults={"preferred_language": user.preferred_language},
    )
    profile.onboarding_completed_at = timezone.now()
    profile.save(update_fields=["onboarding_completed_at", "updated_at"])


def setup_onboarding(user, *, mode: str, templates: list[dict], invite_email: str = "") -> dict:
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

    result = apply_goal_templates(user, templates, partnership=partnership)
    complete_onboarding(user)
    return {
        **result,
        "email_sent": email_sent,
        "partnership": serialize_partnership(partnership),
        "onboarding": get_onboarding_status(user),
    }
