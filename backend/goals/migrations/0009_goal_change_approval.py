import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("goals", "0008_goal_personal_snapshot"),
    ]

    operations = [
        migrations.AddField(
            model_name="goal",
            name="change_accepted",
            field=models.BooleanField(
                default=True,
                help_text="This person has agreed to the pending change, when one exists.",
            ),
        ),
        migrations.AddField(
            model_name="goal",
            name="pending_direction",
            field=models.CharField(blank=True, max_length=8),
        ),
        migrations.AddField(
            model_name="goal",
            name="pending_period",
            field=models.CharField(blank=True, max_length=16),
        ),
        migrations.AddField(
            model_name="goal",
            name="pending_proposed_by",
            field=models.ForeignKey(
                blank=True,
                help_text="Who asked to change this Together goal.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="goal_change_proposals",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="goal",
            name="pending_target_value",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="Proposed new target. The live target stays until both people agree.",
                max_digits=12,
                null=True,
            ),
        ),
        migrations.CreateModel(
            name="GoalTerm",
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
                ("target_value", models.DecimalField(decimal_places=2, max_digits=12)),
                ("period", models.CharField(max_length=16)),
                ("direction", models.CharField(max_length=8)),
                ("effective_on", models.DateField()),
                (
                    "goal",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="terms",
                        to="goals.goal",
                    ),
                ),
            ],
            options={
                "db_table": "goals_goal_term",
                "ordering": ["effective_on", "id"],
            },
        ),
        migrations.AddConstraint(
            model_name="goalterm",
            constraint=models.UniqueConstraint(
                fields=("goal", "effective_on"),
                name="unique_goal_term_effective_on",
            ),
        ),
    ]
