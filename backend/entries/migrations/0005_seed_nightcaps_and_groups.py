# Data migration: DayReflection -> NightCap, link entries, seed groups

from django.db import migrations
from django.utils import timezone


def forwards(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    DayReflection = apps.get_model("entries", "DayReflection")
    NightCap = apps.get_model("entries", "NightCap")
    Entry = apps.get_model("entries", "Entry")
    CategoryGroup = apps.get_model("categories", "CategoryGroup")
    TrackingCategory = apps.get_model("categories", "TrackingCategory")

    # Create NightCaps from reflections
    for row in DayReflection.objects.all().iterator():
        NightCap.objects.update_or_create(
            user_id=row.user_id,
            date=row.date,
            defaults={
                "reflection": row.reflection,
                "status": "completed" if row.reflection else "draft",
                "completed_at": timezone.now() if row.reflection else None,
            },
        )

    # Ensure a NightCap exists for any entry date, then link entries
    for entry in Entry.objects.all().iterator():
        nightcap, _ = NightCap.objects.get_or_create(
            user_id=entry.user_id,
            date=entry.date,
            defaults={"status": "completed", "completed_at": timezone.now()},
        )
        if entry.nightcap_id != nightcap.id:
            entry.nightcap_id = nightcap.id
            entry.save(update_fields=["nightcap_id"])

    # Seed default groups and assign categories for all users who have categories
    SPEND_NAMES = {
        "Fast Food / Eating Out",
        "Groceries",
        "Car Gas",
        "Car Repair",
        "House Supplies",
        "Clothes",
        "Gifts",
        "Online Shopping",
    }
    FOLLOW_NAMES = {
        "I Invested",
        "I Read",
        "I Ran / Worked Out",
        "Sauna / Meditation",
    }

    user_ids = set(TrackingCategory.objects.values_list("user_id", flat=True))
    user_ids |= set(User.objects.filter(is_active=True).values_list("id", flat=True))

    for user_id in user_ids:
        spend, _ = CategoryGroup.objects.get_or_create(
            user_id=user_id,
            key="daily_spend",
            defaults={
                "name": "Daily Spend",
                "sort_order": 0,
                "icon": "spend",
                "show_in_ritual": True,
                "is_default": True,
            },
        )
        follow, _ = CategoryGroup.objects.get_or_create(
            user_id=user_id,
            key="follow_up",
            defaults={
                "name": "Follow-up",
                "sort_order": 1,
                "icon": "follow_up",
                "show_in_ritual": True,
                "is_default": True,
            },
        )
        for cat in TrackingCategory.objects.filter(user_id=user_id, group_id__isnull=True):
            if cat.name in SPEND_NAMES or cat.type == "finance_expense":
                cat.group_id = spend.id
            elif cat.name in FOLLOW_NAMES:
                cat.group_id = follow.id
            elif cat.type in ("habit", "fitness", "finance_income"):
                cat.group_id = follow.id
            cat.save(update_fields=["group_id"])


def backwards(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("entries", "0004_category_groups_and_nightcap"),
        ("categories", "0004_category_groups_and_nightcap"),
        ("accounts", "0002_userprofile_onboarding_completed_at"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
