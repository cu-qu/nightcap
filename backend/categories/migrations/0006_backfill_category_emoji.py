# Backfill default category emojis for existing rows

from django.db import migrations

EMOJI_BY_NAME = {
    "Fast Food / Eating Out": "🍔",
    "Groceries": "🛒",
    "Car Gas": "⛽",
    "Car Repair": "🔧",
    "House Supplies": "🧴",
    "Clothes": "👕",
    "Gifts": "🎁",
    "Online Shopping": "🛍️",
    "I Invested": "💰",
    "I Read": "📖",
    "I Ran / Worked Out": "🏃",
    "Sauna / Meditation": "🧘",
}


def forwards(apps, schema_editor):
    TrackingCategory = apps.get_model("categories", "TrackingCategory")
    for name, emoji in EMOJI_BY_NAME.items():
        TrackingCategory.objects.filter(name=name, emoji="").update(emoji=emoji)


def backwards(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("categories", "0005_category_emoji"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
