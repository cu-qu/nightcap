import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("goals", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="GoalTemplate",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("slug", models.SlugField(max_length=80, unique=True)),
                ("title", models.CharField(max_length=120)),
                ("description", models.TextField(blank=True)),
                ("example_entry_label", models.CharField(blank=True, help_text="Short hint shown during onboarding, e.g. '$12 at the bar'", max_length=255)),
                ("category_name", models.CharField(max_length=120)),
                (
                    "category_type",
                    models.CharField(
                        choices=[
                            ("finance_expense", "Finance Expense"),
                            ("finance_income", "Finance Income"),
                            ("fitness", "Fitness"),
                            ("habit", "Habit"),
                            ("custom", "Custom"),
                        ],
                        default="finance_expense",
                        max_length=32,
                    ),
                ),
                ("category_icon", models.CharField(blank=True, max_length=64)),
                (
                    "period",
                    models.CharField(
                        choices=[("daily", "Daily"), ("weekly", "Weekly"), ("monthly", "Monthly")],
                        default="monthly",
                        max_length=16,
                    ),
                ),
                (
                    "direction",
                    models.CharField(
                        choices=[("max", "Maximum"), ("min", "Minimum")],
                        default="max",
                        max_length=8,
                    ),
                ),
                ("target_value", models.DecimalField(decimal_places=2, max_digits=12)),
                ("warn_at_percent", models.PositiveSmallIntegerField(default=80)),
                (
                    "group",
                    models.CharField(
                        choices=[("finance", "Finance"), ("fitness", "Fitness"), ("habit", "Habit")],
                        default="finance",
                        max_length=16,
                    ),
                ),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "goals_goaltemplate",
                "ordering": ["group", "sort_order", "title"],
            },
        ),
    ]
