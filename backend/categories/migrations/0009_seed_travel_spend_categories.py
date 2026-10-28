# Seed travel and medical spend categories onto each user's Daily Spend group.

from django.db import migrations


TRAVEL_CATEGORIES = (
    {
        "name": "Flights",
        "icon": "flights",
        "emoji": "✈️",
        "sort_order": 11,
    },
    {
        "name": "Hotels",
        "icon": "hotels",
        "emoji": "🛎️",
        "sort_order": 12,
    },
    {
        "name": "Car Rentals",
        "icon": "car_rentals",
        "emoji": "🚗",
        "sort_order": 13,
    },
    {
        "name": "Medical",
        "icon": "medical",
        "emoji": "🏥",
        "sort_order": 14,
    },
    {
        "name": "Prescription/Meds",
        "icon": "prescription_meds",
        "emoji": "💊",
        "sort_order": 15,
    },
)


def forwards(apps, schema_editor):
    CategoryGroup = apps.get_model("categories", "CategoryGroup")
    TrackingCategory = apps.get_model("categories", "TrackingCategory")

    for group in CategoryGroup.objects.filter(key="daily_spend"):
        legacy_medical = TrackingCategory.objects.filter(
            user_id=group.user_id,
            name="Medical Expenses",
            type="finance_expense",
        ).first()
        has_medical = TrackingCategory.objects.filter(
            user_id=group.user_id,
            name="Medical",
            type="finance_expense",
        ).exists()
        if legacy_medical and not has_medical:
            legacy_medical.name = "Medical"
            legacy_medical.icon = "medical"
            if not legacy_medical.emoji:
                legacy_medical.emoji = "🏥"
            if legacy_medical.group_id is None:
                legacy_medical.group_id = group.id
            legacy_medical.sort_order = 14
            legacy_medical.save(
                update_fields=["name", "icon", "emoji", "group_id", "sort_order"]
            )

        for item in TRAVEL_CATEGORIES:
            category, created = TrackingCategory.objects.get_or_create(
                user_id=group.user_id,
                name=item["name"],
                type="finance_expense",
                defaults={
                    "metric_kind": "amount",
                    "unit": "usd",
                    "icon": item["icon"],
                    "emoji": item["emoji"],
                    "sort_order": item["sort_order"],
                    "is_default": True,
                    "group_id": group.id,
                },
            )
            if created:
                continue
            updates = []
            if category.group_id is None:
                category.group_id = group.id
                category.sort_order = item["sort_order"]
                updates.extend(["group_id", "sort_order"])
            if item["name"] == "Hotels" and category.emoji == "🏨":
                category.emoji = item["emoji"]
                updates.append("emoji")
            elif item["emoji"] and not category.emoji:
                category.emoji = item["emoji"]
                updates.append("emoji")
            if updates:
                category.save(update_fields=updates)


class Migration(migrations.Migration):
    dependencies = [
        ("categories", "0008_alter_categorygroup_key"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
