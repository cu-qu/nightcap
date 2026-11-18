import os
from unittest import mock

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from config.hosts import PUBLIC_API_ORIGIN, parse_allowed_hosts, trusted_origins
from config.settings.base import _public_app_url


class AllowedHostsTests(SimpleTestCase):
    def test_requires_a_host(self):
        with self.assertRaises(ImproperlyConfigured):
            parse_allowed_hosts("")
        with self.assertRaises(ImproperlyConfigured):
            parse_allowed_hosts(" , ")

    def test_includes_the_public_domain_when_the_list_is_empty(self):
        self.assertEqual(
            parse_allowed_hosts("", "api-nightcap.cuqulabs.com"),
            ["api-nightcap.cuqulabs.com"],
        )

    def test_splits_and_strips(self):
        self.assertEqual(
            parse_allowed_hosts(" api-nightcap.cuqulabs.com, localhost "),
            ["api-nightcap.cuqulabs.com", "localhost"],
        )

    def test_trusted_origins_include_the_public_domain(self):
        self.assertEqual(
            trusted_origins(
                "https://api-nightcap.cuqulabs.com",
                "api-nightcap.cuqulabs.com",
            ),
            ["https://api-nightcap.cuqulabs.com"],
        )
        self.assertEqual(trusted_origins("", ""), [])

    def test_production_email_links_use_the_live_api(self):
        env = {
            key: value
            for key, value in os.environ.items()
            if key not in {"FRONTEND_URL", "RAILWAY_PUBLIC_DOMAIN"}
        }
        env["DJANGO_SETTINGS_MODULE"] = "config.settings.production"
        with mock.patch.dict(os.environ, env, clear=True):
            self.assertEqual(_public_app_url(), PUBLIC_API_ORIGIN)
