from django.core.management.base import BaseCommand

from goals.template_catalog import seed_goal_templates


class Command(BaseCommand):
    help = "Seed or refresh starter goal templates for onboarding."

    def handle(self, *args, **options):
        seed_goal_templates()
        self.stdout.write(self.style.SUCCESS("Goal templates seeded."))
