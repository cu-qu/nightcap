import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

app = Celery("night_cap")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

# 08:00 UTC on the 1st — last month's slideshow for every active couple and solo member.
_beat = dict(app.conf.beat_schedule or {})
_beat["generate-monthly-recaps"] = {
    "task": "entries.tasks.generate_previous_month_recaps",
    "schedule": crontab(minute=0, hour=8, day_of_month=1),
}
app.conf.beat_schedule = _beat
