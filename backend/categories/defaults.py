from .models import CategoryGroup, TrackingCategory, default_metric_for_type


DEFAULT_GROUPS = [
    {
        "key": CategoryGroup.KEY_DAILY_SPEND,
        "name": "Daily Spend",
        "sort_order": 0,
        "icon": "spend",
        "show_in_ritual": True,
    },
    {
        "key": CategoryGroup.KEY_FOLLOW_UP,
        "name": "Health",
        "sort_order": 1,
        "icon": "health",
        "show_in_ritual": True,
    },
]

# Display names we used to seed; rename these in place if the user never customized.
_LEGACY_DEFAULT_GROUP_NAMES = {
    CategoryGroup.KEY_FOLLOW_UP: "Follow-up",
}


# Mobile NightCap ritual defaults. `icon` = stable key; `emoji` = saved display glyph.
DEFAULT_CATEGORIES = [
    {
        "name": "Fast Food",
        "type": TrackingCategory.FINANCE_EXPENSE,
        "icon": "fast_food",
        "emoji": "🍔",
        "metric_kind": TrackingCategory.METRIC_AMOUNT,
        "unit": "usd",
        "group_key": CategoryGroup.KEY_DAILY_SPEND,
        "sort_order": 0,
    },
    {
        "name": "Eating Out",
        "type": TrackingCategory.FINANCE_EXPENSE,
        "icon": "eating_out",
        "emoji": "🍽️",
        "metric_kind": TrackingCategory.METRIC_AMOUNT,
        "unit": "usd",
        "group_key": CategoryGroup.KEY_DAILY_SPEND,
        "sort_order": 1,
    },
    {
        "name": "Food Deliveries",
        "type": TrackingCategory.FINANCE_EXPENSE,
        "icon": "food_deliveries",
        "emoji": "🛵",
        "metric_kind": TrackingCategory.METRIC_AMOUNT,
        "unit": "usd",
        "group_key": CategoryGroup.KEY_DAILY_SPEND,
        "sort_order": 2,
    },
    {
        "name": "Groceries",
        "type": TrackingCategory.FINANCE_EXPENSE,
        "icon": "groceries",
        "emoji": "🛒",
        "metric_kind": TrackingCategory.METRIC_AMOUNT,
        "unit": "usd",
        "group_key": CategoryGroup.KEY_DAILY_SPEND,
        "sort_order": 3,
    },
    {
        "name": "Car Gas",
        "type": TrackingCategory.FINANCE_EXPENSE,
        "icon": "car_gas",
        "emoji": "⛽",
        "metric_kind": TrackingCategory.METRIC_AMOUNT,
        "unit": "usd",
        "group_key": CategoryGroup.KEY_DAILY_SPEND,
        "sort_order": 4,
    },
    {
        "name": "Car Repair",
        "type": TrackingCategory.FINANCE_EXPENSE,
        "icon": "car_repair",
        "emoji": "🔧",
        "metric_kind": TrackingCategory.METRIC_AMOUNT,
        "unit": "usd",
        "group_key": CategoryGroup.KEY_DAILY_SPEND,
        "sort_order": 5,
    },
    {
        "name": "House Supplies",
        "type": TrackingCategory.FINANCE_EXPENSE,
        "icon": "house_supplies",
        "emoji": "🧴",
        "metric_kind": TrackingCategory.METRIC_AMOUNT,
        "unit": "usd",
        "group_key": CategoryGroup.KEY_DAILY_SPEND,
        "sort_order": 6,
    },
    {
        "name": "Clothes",
        "type": TrackingCategory.FINANCE_EXPENSE,
        "icon": "clothes",
        "emoji": "👕",
        "metric_kind": TrackingCategory.METRIC_AMOUNT,
        "unit": "usd",
        "group_key": CategoryGroup.KEY_DAILY_SPEND,
        "sort_order": 7,
    },
    {
        "name": "Gifts",
        "type": TrackingCategory.FINANCE_EXPENSE,
        "icon": "gifts",
        "emoji": "🎁",
        "metric_kind": TrackingCategory.METRIC_AMOUNT,
        "unit": "usd",
        "group_key": CategoryGroup.KEY_DAILY_SPEND,
        "sort_order": 8,
    },
    {
        "name": "Online Shopping",
        "type": TrackingCategory.FINANCE_EXPENSE,
        "icon": "online_shopping",
        "emoji": "🛍️",
        "metric_kind": TrackingCategory.METRIC_AMOUNT,
        "unit": "usd",
        "group_key": CategoryGroup.KEY_DAILY_SPEND,
        "sort_order": 9,
    },
    {
        "name": "Going Out",
        "type": TrackingCategory.FINANCE_EXPENSE,
        "icon": "going_out",
        "emoji": "🪩🥂",
        "metric_kind": TrackingCategory.METRIC_AMOUNT,
        "unit": "usd",
        "group_key": CategoryGroup.KEY_DAILY_SPEND,
        "sort_order": 10,
    },
    {
        "name": "Water",
        "type": TrackingCategory.HABIT,
        "icon": "drop",
        "emoji": "💧",
        "metric_kind": TrackingCategory.METRIC_QUANTITY,
        "unit": "glasses",
        "group_key": CategoryGroup.KEY_FOLLOW_UP,
        "sort_order": 0,
    },
    {
        "name": "Workout",
        "type": TrackingCategory.FITNESS,
        "icon": "run_workout",
        "emoji": "🏋️",
        "metric_kind": TrackingCategory.METRIC_QUANTITY,
        "unit": "sessions",
        "group_key": CategoryGroup.KEY_FOLLOW_UP,
        "sort_order": 1,
    },
]


def _category_fields(item: dict) -> dict:
    metric_kind = item.get("metric_kind")
    unit = item.get("unit")
    if metric_kind is None or unit is None:
        default_kind, default_unit = default_metric_for_type(item["type"])
        metric_kind = metric_kind or default_kind
        unit = unit or default_unit
    return {
        "name": item["name"],
        "type": item["type"],
        "metric_kind": metric_kind,
        "unit": unit,
        "icon": item.get("icon", ""),
        "emoji": item.get("emoji", ""),
        "sort_order": item.get("sort_order", 0),
        "is_default": True,
        "group_key": item.get("group_key"),
    }


def create_default_groups_for_user(user) -> dict[str, CategoryGroup]:
    groups_by_key: dict[str, CategoryGroup] = {}
    for item in DEFAULT_GROUPS:
        group, created = CategoryGroup.objects.get_or_create(
            user=user,
            key=item["key"],
            defaults={
                "name": item["name"],
                "sort_order": item["sort_order"],
                "icon": item.get("icon", ""),
                "show_in_ritual": item.get("show_in_ritual", True),
                "is_default": True,
            },
        )
        if not created:
            updates = []
            legacy_name = _LEGACY_DEFAULT_GROUP_NAMES.get(item["key"])
            if (
                legacy_name
                and group.name == legacy_name
                and not CategoryGroup.objects.filter(
                    user=user, name=item["name"]
                )
                .exclude(pk=group.pk)
                .exists()
            ):
                group.name = item["name"]
                updates.append("name")
            if group.is_default and item.get("icon") and group.icon in ("", "follow_up"):
                group.icon = item["icon"]
                updates.append("icon")
            if updates:
                updates.append("updated_at")
                group.save(update_fields=list(dict.fromkeys(updates)))
        groups_by_key[group.key] = group
    return groups_by_key


def create_default_categories_for_user(user):
    groups = create_default_groups_for_user(user)
    categories = []
    for item in DEFAULT_CATEGORIES:
        fields = _category_fields(item)
        group_key = fields.pop("group_key", None)
        group = groups.get(group_key) if group_key else None
        categories.append(TrackingCategory(user=user, group=group, **fields))
    TrackingCategory.objects.bulk_create(categories, ignore_conflicts=True)


def sync_default_categories_for_user(user) -> int:
    """Create any missing default groups/categories. Does not delete customs."""
    groups = create_default_groups_for_user(user)
    # Legacy combined chip → ungroup so users keep history but see the new split categories.
    legacy = TrackingCategory.objects.filter(
        user=user,
        name="Fast Food / Eating Out",
        type=TrackingCategory.FINANCE_EXPENSE,
    ).first()
    if legacy and legacy.group_id:
        legacy.group = None
        legacy.save(update_fields=["group", "updated_at"])

    created = 0
    for item in DEFAULT_CATEGORIES:
        fields = _category_fields(item)
        group_key = fields.pop("group_key", None)
        group = groups.get(group_key) if group_key else None
        obj, was_created = TrackingCategory.objects.get_or_create(
            user=user,
            name=fields["name"],
            type=fields["type"],
            defaults={
                "metric_kind": fields["metric_kind"],
                "unit": fields["unit"],
                "icon": fields["icon"],
                "emoji": fields["emoji"],
                "sort_order": fields["sort_order"],
                "is_default": True,
                "group": group,
            },
        )
        if was_created:
            created += 1
            continue
        updates = []
        if group and obj.group_id is None:
            obj.group = group
            updates.extend(["group", "sort_order"])
            obj.sort_order = fields["sort_order"]
        if fields["emoji"] and not obj.emoji:
            obj.emoji = fields["emoji"]
            updates.append("emoji")
        if updates:
            updates.append("updated_at")
            obj.save(update_fields=list(dict.fromkeys(updates)))
    return created
