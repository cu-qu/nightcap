from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from categories.defaults import sync_default_categories_for_user

User = get_user_model()


class Command(BaseCommand):
    help = (
        "Upsert missing mobile ritual default categories for users "
        "without deleting custom categories."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--user-id",
            type=str,
            help="Limit sync to a single user UUID.",
        )

    def handle(self, *args, **options):
        qs = User.objects.filter(is_active=True, is_deleted=False)
        user_id = options.get("user_id")
        if user_id:
            qs = qs.filter(id=user_id)

        total_created = 0
        users = 0
        for user in qs.iterator():
            users += 1
            total_created += sync_default_categories_for_user(user)

        self.stdout.write(
            self.style.SUCCESS(
                f"Synced defaults for {users} user(s); created {total_created} categor(y/ies)."
            )
        )
