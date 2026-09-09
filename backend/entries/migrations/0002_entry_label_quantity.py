from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("entries", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="entry",
            name="label",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="entry",
            name="quantity",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]
