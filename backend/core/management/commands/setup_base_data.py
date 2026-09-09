from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Seed base data used by deployments."

    def handle(self, *args, **options):
        call_command("create_admin_user")
        call_command("seed_goal_templates")
        self.stdout.write(self.style.SUCCESS("Base data seeded successfully."))
