from django.core.management.base import BaseCommand
from accounts.models import User

class Command(BaseCommand):
    help = "Create admin user"

    def handle(self, *args, **options):
        user = User.objects.filter(username="cuqu").first()
        if not user:
            user = User.objects.create_user(username="cuqu", email="cuqulabs@proton.me", password="password")
            user.is_superuser = True
            user.is_staff = True
            user.save()

        self.stdout.write(self.style.SUCCESS(f"Admin user created: {user.username}"))
