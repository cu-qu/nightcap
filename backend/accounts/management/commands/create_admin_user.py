from django.core.management.base import BaseCommand
from accounts.models import User
from accounts.memberships import grant_complimentary_membership

class Command(BaseCommand):
    help = "Create admin user"

    def handle(self, *args, **options):
        user = User.objects.filter(username="cuqu").first()
        if not user:
            user = User.objects.create_user(username="cuqu", email="cuqulabs@proton.me", password="password")
            user.is_superuser = True
            user.is_staff = True
            user.save()
        grant_complimentary_membership(user, note="Local admin")

        self.stdout.write(self.style.SUCCESS(f"Admin user created: {user.username}"))
