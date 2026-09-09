# Migrate legacy text mood keys to emoji values

from django.db import migrations

LEGACY_TO_EMOJI = {
    "great": "🤩",
    "good": "🙂",
    "okay": "😐",
    "low": "😔",
    "rough": "😣",
}


def forwards(apps, schema_editor):
    NightCap = apps.get_model("entries", "NightCap")
    for legacy, emoji in LEGACY_TO_EMOJI.items():
        NightCap.objects.filter(mood=legacy).update(mood=emoji)


def backwards(apps, schema_editor):
    NightCap = apps.get_model("entries", "NightCap")
    for legacy, emoji in LEGACY_TO_EMOJI.items():
        NightCap.objects.filter(mood=emoji).update(mood=legacy)


class Migration(migrations.Migration):
    dependencies = [
        ("entries", "0006_nightcap_mood"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
