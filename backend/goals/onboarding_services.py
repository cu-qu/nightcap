from decimal import Decimal

from django.utils import timezone

from categories.models import TrackingCategory, default_metric_for_type
from goals.models import Goal, GoalTemplate


def get_or_create_category_for_template(user, template: GoalTemplate) -> TrackingCategory:
    metric_kind, unit = default_metric_for_type(template.category_type)
    category, created = TrackingCategory.objects.get_or_create(
        user=user,
        name=template.category_name,
        type=template.category_type,
        defaults={
            "metric_kind": metric_kind,
            "unit": unit,
            "icon": template.category_icon,
            "is_default": True,
        },
    )
    if not created and template.category_icon and not category.icon:
        category.icon = template.category_icon
        category.save(update_fields=["icon"])
    return category


def apply_goal_templates(user, template_selections: list[dict]) -> dict:
    """
    Copy selected templates into the user's categories and goals.

    Each selection: {"slug": "...", "target_value": optional override}
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

        category, was_created = TrackingCategory.objects.get_or_create(
            user=user,
            name=template.category_name,
            type=template.category_type,
            defaults={
                "metric_kind": default_metric_for_type(template.category_type)[0],
                "unit": default_metric_for_type(template.category_type)[1],
                "icon": template.category_icon,
                "is_default": True,
            },
        )
        if was_created:
            created_categories.append(category)
        elif template.category_icon and not category.icon:
            category.icon = template.category_icon
            category.save(update_fields=["icon"])

        goal, goal_created = Goal.objects.update_or_create(
            user=user,
            category=category,
            period=template.period,
            defaults={
                "name": template.title,
                "direction": template.direction,
                "target_value": target_value,
                "warn_at_percent": template.warn_at_percent,
                "is_active": True,
            },
        )
        if goal_created:
            created_goals.append(goal)
        else:
            updated_goals.append(goal)

    return {
        "created_goals": created_goals,
        "updated_goals": updated_goals,
        "created_categories": created_categories,
    }


def get_onboarding_status(user) -> dict:
    from accounts.models import UserProfile

    profile = UserProfile.objects.filter(user=user).first()
    onboarding_completed = bool(
        profile and profile.onboarding_completed_at is not None
    )
    active_templates = GoalTemplate.objects.filter(is_active=True).count()
    active_goals = Goal.objects.filter(user=user, is_active=True).count()
    return {
        "onboarding_completed": onboarding_completed,
        "onboarding_completed_at": (
            profile.onboarding_completed_at if profile else None
        ),
        "active_goal_count": active_goals,
        "available_template_count": active_templates,
    }


def complete_onboarding(user) -> None:
    from accounts.models import UserProfile

    profile, _ = UserProfile.objects.get_or_create(
        user=user,
        defaults={"preferred_language": user.preferred_language},
    )
    profile.onboarding_completed_at = timezone.now()
    profile.save(update_fields=["onboarding_completed_at"])
