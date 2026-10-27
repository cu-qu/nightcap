from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_partner_nudge"),
    ]

    operations = [
        migrations.AddField(
            model_name="devicepushtoken",
            name="environment",
            field=models.CharField(
                blank=True,
                choices=[("sandbox", "Sandbox"), ("production", "Production")],
                max_length=16,
            ),
        ),
    ]
