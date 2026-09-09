from django.db import migrations, models


def set_metric_defaults(apps, schema_editor):
    TrackingCategory = apps.get_model("categories", "TrackingCategory")
    defaults = {
        "finance_expense": ("amount", "usd"),
        "finance_income": ("amount", "usd"),
        "fitness": ("quantity", "reps"),
        "habit": ("boolean", "count"),
        "custom": ("quantity", "count"),
    }
    for category in TrackingCategory.objects.all():
        metric_kind, unit = defaults.get(category.type, ("quantity", "count"))
        category.metric_kind = metric_kind
        category.unit = unit
        category.save(update_fields=["metric_kind", "unit"])


class Migration(migrations.Migration):

    dependencies = [
        ("categories", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="trackingcategory",
            name="metric_kind",
            field=models.CharField(
                choices=[("amount", "Amount"), ("quantity", "Quantity"), ("boolean", "Boolean")],
                default="quantity",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="trackingcategory",
            name="unit",
            field=models.CharField(blank=True, default="count", max_length=32),
        ),
        migrations.RunPython(set_metric_defaults, migrations.RunPython.noop),
    ]
