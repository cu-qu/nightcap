# Rename the default Follow-up group to Health and seed water/workout categories.

from django.db import migrations


HEALTH_CATEGORIES = (
    {
        "name": "Water",
        "type": "habit",
        "icon": "drop",
        "emoji": "💧",
        "metric_kind": "quantity",
        "unit": "glasses",
        "sort_order": 0,
    },
    {
        "name": "Workout",
        "type": "fitness",
        "icon": "run_workout",
        "emoji": "🏋️",
        "metric_kind": "quantity",
        "unit": "sessions",
        "sort_order": 1,
    },
)


def forwards(apps, schema_editor):
    CategoryGroup = apps.get_model("categories", "CategoryGroup")
    TrackingCategory = apps.get_model("categories", "TrackingCategory")

    for group in CategoryGroup.objects.filter(key="follow_up", name="Follow-up"):
        taken = CategoryGroup.objects.filter(user_id=group.user_id, name="Health").exists()
        if not taken:
            group.name = "Health"
        if group.icon in ("", "follow_up"):
            group.icon = "health"
        group.save(update_fields=["name", "icon"])

        for item in HEALTH_CATEGORIES:
            TrackingCategory.objects.get_or_create(
                user_id=group.user_id,
                name=item["name"],
                type=item["type"],
                defaults={
                    "metric_kind": item["metric_kind"],
                    "unit": item["unit"],
                    "icon": item["icon"],
                    "emoji": item["emoji"],
                    "sort_order": item["sort_order"],
                    "is_default": True,
                    "group_id": group.id,
                },
            )


def backwards(apps, schema_editor):
    CategoryGroup = apps.get_model("categories", "CategoryGroup")
    for group in CategoryGroup.objects.filter(key="follow_up", name="Health"):
        taken = CategoryGroup.objects.filter(user_id=group.user_id, name="Follow-up").exists()
        if not taken:
            group.name = "Follow-up"
            group.icon = "follow_up"
            group.save(update_fields=["name", "icon"])


class Migration(migrations.Migration):
    dependencies = [
        ("categories", "0006_backfill_category_emoji"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
