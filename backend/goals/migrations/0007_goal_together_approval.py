import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("goals", "0006_goaltemplate_category_unit"),
    ]

    operations = [
        migrations.AddField(
            model_name="goal",
            name="accepted",
            field=models.BooleanField(
                default=True,
                help_text="Together goals stay pending until the other person approves.",
            ),
        ),
        migrations.AddField(
            model_name="goal",
            name="proposed_by",
            field=models.ForeignKey(
                blank=True,
                help_text="Who first made this a Together goal.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="proposed_goals",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
