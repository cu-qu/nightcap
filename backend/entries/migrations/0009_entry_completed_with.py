from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("entries", "0008_nightcap_mood_open"),
    ]

    operations = [
        migrations.AddField(
            model_name="entry",
            name="completed_with",
            field=models.CharField(
                choices=[("alone", "Alone"), ("with_partner", "With Partner")],
                default="alone",
                help_text="Whether this category was completed alone or with a partner.",
                max_length=16,
            ),
        ),
    ]
