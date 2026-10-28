from celery import shared_task


@shared_task(name="entries.tasks.generate_previous_month_recaps")
def generate_previous_month_recaps():
    """Celery beat: 08:00 UTC on the 1st, for every active couple and solo member."""
    from entries.recaps import generate_previous_month_recaps as build

    return build()
