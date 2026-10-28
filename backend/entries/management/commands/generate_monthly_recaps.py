from django.core.management.base import BaseCommand, CommandError

from entries.recaps import generate_previous_month_recaps, generate_recaps_for_month


class Command(BaseCommand):
    help = (
        "Build last month's slideshow for every active couple and solo member. "
        "Pass --year and --month to build a specific month."
    )

    def add_arguments(self, parser):
        parser.add_argument("--year", type=int)
        parser.add_argument("--month", type=int)

    def handle(self, *args, **options):
        year = options.get("year")
        month = options.get("month")
        if (year is None) ^ (month is None):
            raise CommandError("Pass both --year and --month, or neither.")
        if year is None:
            result = generate_previous_month_recaps()
        else:
            if not 1 <= month <= 12:
                raise CommandError("--month must be 1–12.")
            result = generate_recaps_for_month(year, month)
        self.stdout.write(
            f"{result['year']}-{result['month']:02d}: "
            f"created {result['created']}, "
            f"already stored {result['existing']}, "
            f"nothing to recap {result['skipped']}."
        )
