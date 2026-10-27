from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from config.hosts import parse_allowed_hosts, trusted_origins


class AllowedHostsTests(SimpleTestCase):
    def test_requires_a_host(self):
        with self.assertRaises(ImproperlyConfigured):
            parse_allowed_hosts("")
        with self.assertRaises(ImproperlyConfigured):
            parse_allowed_hosts(" , ")

    def test_includes_the_railway_domain_when_the_list_is_empty(self):
        self.assertEqual(
            parse_allowed_hosts("", "nightcap-api-production-ce8f.up.railway.app"),
            ["nightcap-api-production-ce8f.up.railway.app"],
        )

    def test_splits_and_strips(self):
        self.assertEqual(
            parse_allowed_hosts(" api.nightcap.app, .up.railway.app "),
            ["api.nightcap.app", ".up.railway.app"],
        )

    def test_trusted_origins_include_the_public_domain(self):
        self.assertEqual(
            trusted_origins(
                "https://api.nightcap.app",
                "nightcap-api-production-ce8f.up.railway.app",
            ),
            [
                "https://api.nightcap.app",
                "https://nightcap-api-production-ce8f.up.railway.app",
            ],
        )
        self.assertEqual(trusted_origins("", ""), [])
