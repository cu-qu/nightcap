from django.db import migrations, models


def dedupe_active_goals(apps, schema_editor):
    """Keep the newest active goal per user+category; soft-deactivate the rest."""
    Goal = apps.get_model("goals", "Goal")
    seen = set()
    for goal in Goal.objects.filter(is_active=True).order_by(
        "user_id", "category_id", "-updated_at", "-id"
    ):
        key = (goal.user_id, goal.category_id)
        if key in seen:
            goal.is_active = False
            goal.save(update_fields=["is_active"])
        else:
            seen.add(key)


class Migration(migrations.Migration):
    dependencies = [
        ("goals", "0003_mobile_ritual_support"),
    ]

    operations = [
        migrations.RunPython(dedupe_active_goals, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name="goal",
            name="unique_active_goal_per_category_period",
        ),
        migrations.AddConstraint(
            model_name="goal",
            constraint=models.UniqueConstraint(
                condition=models.Q(is_active=True),
                fields=("user", "category"),
                name="unique_active_goal_per_category",
            ),
        ),
    ]
