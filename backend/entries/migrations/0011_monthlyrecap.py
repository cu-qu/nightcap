import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0006_devicepushtoken_environment"),
        ("entries", "0010_nightcap_favorite_moment_and_photo"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="MonthlyRecap",
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
                ("year", models.PositiveSmallIntegerField()),
                ("month", models.PositiveSmallIntegerField()),
                (
                    "highlight_uuids",
                    models.JSONField(
                        default=list,
                        help_text="NightCap UUIDs in slideshow order. Up to five moments per person.",
                    ),
                ),
                ("generated_at", models.DateTimeField(auto_now_add=True)),
                ("notified_at", models.DateTimeField(blank=True, null=True)),
                (
                    "partnership",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="monthly_recaps",
                        to="accounts.partnership",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="monthly_recaps",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "entries_monthlyrecap",
                "ordering": ["-year", "-month"],
            },
        ),
        migrations.AddConstraint(
            model_name="monthlyrecap",
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(("partnership__isnull", False), ("user__isnull", True))
                    | models.Q(("partnership__isnull", True), ("user__isnull", False))
                ),
                name="monthly_recap_owner_xor",
            ),
        ),
        migrations.AddConstraint(
            model_name="monthlyrecap",
            constraint=models.UniqueConstraint(
                condition=models.Q(("partnership__isnull", False)),
                fields=("partnership", "year", "month"),
                name="unique_monthly_recap_partnership",
            ),
        ),
        migrations.AddConstraint(
            model_name="monthlyrecap",
            constraint=models.UniqueConstraint(
                condition=models.Q(("user__isnull", False)),
                fields=("user", "year", "month"),
                name="unique_monthly_recap_user",
            ),
        ),
    ]
