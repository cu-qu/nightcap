from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("goals", "0005_couple_habits_onboarding"),
    ]

    operations = [
        migrations.AddField(
            model_name="goaltemplate",
            name="category_unit",
            field=models.CharField(
                blank=True,
                help_text="minutes, miles, sessions, reps. Blank = default for the category type.",
                max_length=32,
            ),
        ),
    ]
