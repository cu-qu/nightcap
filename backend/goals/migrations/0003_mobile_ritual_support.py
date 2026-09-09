# Generated manually for Goal uuid backfill

import uuid

from django.db import migrations, models


def populate_goal_uuids(apps, schema_editor):
    Goal = apps.get_model("goals", "Goal")
    for obj in Goal.objects.filter(uuid__isnull=True).iterator():
        obj.uuid = uuid.uuid4()
        obj.save(update_fields=["uuid"])


class Migration(migrations.Migration):
    dependencies = [
        ("goals", "0002_goaltemplate"),
    ]

    operations = [
        migrations.AddField(
            model_name="goal",
            name="uuid",
            field=models.UUIDField(db_index=True, editable=False, null=True),
        ),
        migrations.RunPython(populate_goal_uuids, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="goal",
            name="uuid",
            field=models.UUIDField(
                db_index=True, default=uuid.uuid4, editable=False, unique=True
            ),
        ),
    ]
