# Generated manually for unique UUID backfill

import uuid

from django.db import migrations, models


def populate_category_uuids(apps, schema_editor):
    TrackingCategory = apps.get_model("categories", "TrackingCategory")
    for obj in TrackingCategory.objects.filter(uuid__isnull=True).iterator():
        obj.uuid = uuid.uuid4()
        obj.save(update_fields=["uuid"])


class Migration(migrations.Migration):
    dependencies = [
        ("categories", "0002_trackingcategory_metric_kind_unit"),
    ]

    operations = [
        migrations.AddField(
            model_name="trackingcategory",
            name="uuid",
            field=models.UUIDField(db_index=True, editable=False, null=True),
        ),
        migrations.RunPython(populate_category_uuids, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="trackingcategory",
            name="uuid",
            field=models.UUIDField(
                db_index=True, default=uuid.uuid4, editable=False, unique=True
            ),
        ),
    ]
