from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("goals", "0007_goal_together_approval"),
    ]

    operations = [
        migrations.AddField(
            model_name="goal",
            name="personal_snapshot_direction",
            field=models.CharField(blank=True, max_length=8),
        ),
        migrations.AddField(
            model_name="goal",
            name="personal_snapshot_period",
            field=models.CharField(blank=True, max_length=16),
        ),
        migrations.AddField(
            model_name="goal",
            name="personal_snapshot_target",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="Personal target saved when a goal is turned into a Together proposal.",
                max_digits=12,
                null=True,
            ),
        ),
    ]
