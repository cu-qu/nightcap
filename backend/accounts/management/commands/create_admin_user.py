import os

from django.core.management.base import BaseCommand

from accounts.memberships import grant_complimentary_membership
from accounts.models import User

DEFAULT_USERNAME = "cuqu"
DEFAULT_EMAIL = "cuqulabs@proton.me"
DEFAULT_PASSWORD = "password"


def _env(name: str) -> str:
    return os.environ.get(name, "").strip()


class Command(BaseCommand):
    help = (
        "Create or update the admin user. Uses ADMIN_USERNAME, ADMIN_EMAIL, "
        "and ADMIN_PASSWORD when they are set."
    )

    def handle(self, *args, **options):
        username = _env("ADMIN_USERNAME") or DEFAULT_USERNAME
        email = _env("ADMIN_EMAIL") or DEFAULT_EMAIL
        password = _env("ADMIN_PASSWORD") or DEFAULT_PASSWORD
        email_from_env = bool(_env("ADMIN_EMAIL"))
        password_from_env = bool(_env("ADMIN_PASSWORD"))

        user = User.objects.filter(username=username).first()
        created = user is None
        if created:
            user = User.objects.create_user(username=username, email=email, password=password)
        elif email_from_env:
            user.email = email
        if password_from_env and not created:
            user.set_password(password)

        user.is_superuser = True
        user.is_staff = True
        user.email_verified = True
        user.save()
        grant_complimentary_membership(user, note="Local admin")

        verb = "created" if created else "updated"
        self.stdout.write(self.style.SUCCESS(f"Admin user {verb}: {user.username}"))
