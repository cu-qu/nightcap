import os
from contextlib import contextmanager

from django.core.management import call_command
from django.test import TestCase

from accounts.models import User


@contextmanager
def admin_env(**values):
    names = ("ADMIN_USERNAME", "ADMIN_EMAIL", "ADMIN_PASSWORD")
    previous = {name: os.environ.get(name) for name in names}
    for name in names:
        os.environ.pop(name, None)
    for name, value in values.items():
        os.environ[name] = value
    try:
        yield
    finally:
        for name, value in previous.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value


class CreateAdminUserTests(TestCase):
    def test_uses_env_credentials_when_set(self):
        with admin_env(
            ADMIN_USERNAME="nightcap-admin",
            ADMIN_EMAIL="admin@example.com",
            ADMIN_PASSWORD="env-secret-value",
        ):
            call_command("create_admin_user")

        user = User.objects.get(username="nightcap-admin")
        self.assertEqual(user.email, "admin@example.com")
        self.assertTrue(user.check_password("env-secret-value"))
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.email_verified)

    def test_updates_existing_user_from_env(self):
        user = User.objects.create_user(
            username="nightcap-admin",
            email="old@example.com",
            password="old-password",
        )
        with admin_env(
            ADMIN_USERNAME="nightcap-admin",
            ADMIN_EMAIL="admin@example.com",
            ADMIN_PASSWORD="env-secret-value",
        ):
            call_command("create_admin_user")

        user.refresh_from_db()
        self.assertEqual(User.objects.filter(username="nightcap-admin").count(), 1)
        self.assertEqual(user.email, "admin@example.com")
        self.assertTrue(user.check_password("env-secret-value"))
        self.assertFalse(user.check_password("old-password"))

    def test_keeps_existing_password_when_env_is_unset(self):
        user = User.objects.create_user(
            username="cuqu",
            email="cuqulabs@proton.me",
            password="chosen-password",
        )
        with admin_env():
            call_command("create_admin_user")

        user.refresh_from_db()
        self.assertTrue(user.check_password("chosen-password"))
        self.assertFalse(user.check_password("password"))
