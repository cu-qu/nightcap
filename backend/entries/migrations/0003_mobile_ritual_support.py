# Generated manually for Entry uuid, decimal quantity, DayReflection, unique constraint

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def populate_entry_uuids(apps, schema_editor):
    Entry = apps.get_model("entries", "Entry")
    for obj in Entry.objects.filter(uuid__isnull=True).iterator():
        obj.uuid = uuid.uuid4()
        obj.save(update_fields=["uuid"])


def dedupe_entries(apps, schema_editor):
    """Keep the latest entry per (user, date, category) before unique constraint."""
    Entry = apps.get_model("entries", "Entry")
    seen = set()
    # newest first
    for obj in Entry.objects.order_by("-updated_at", "-id").iterator():
        key = (obj.user_id, obj.date, obj.category_id)
        if key in seen:
            obj.delete()
        else:
            seen.add(key)


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("categories", "0003_mobile_ritual_support"),
        ("entries", "0002_entry_label_quantity"),
    ]

    operations = [
        migrations.AddField(
            model_name="entry",
            name="uuid",
            field=models.UUIDField(db_index=True, editable=False, null=True),
        ),
        migrations.RunPython(populate_entry_uuids, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="entry",
            name="uuid",
            field=models.UUIDField(
                db_index=True, default=uuid.uuid4, editable=False, unique=True
            ),
        ),
        migrations.AlterField(
            model_name="entry",
            name="quantity",
            field=models.DecimalField(
                blank=True, decimal_places=2, max_digits=12, null=True
            ),
        ),
        migrations.RunPython(dedupe_entries, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="entry",
            constraint=models.UniqueConstraint(
                fields=("user", "date", "category"),
                name="unique_entry_per_user_date_category",
            ),
        ),
        migrations.CreateModel(
            name="DayReflection",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("date", models.DateField(db_index=True)),
                ("reflection", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="day_reflections",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "entries_dayreflection",
                "ordering": ["-date"],
            },
        ),
        migrations.AddConstraint(
            model_name="dayreflection",
            constraint=models.UniqueConstraint(
                fields=("user", "date"),
                name="unique_day_reflection_per_user_date",
            ),
        ),
    ]
