from django.test import TestCase

from core.legal import markdown_to_html


class LegalPagesTests(TestCase):
    def test_privacy_terms_and_support_render(self):
        for path in ("/privacy/", "/terms/", "/support/"):
            resp = self.client.get(path)
            self.assertEqual(resp.status_code, 200, path)
            self.assertIn("text/html", resp["Content-Type"])
            self.assertContains(resp, "NightCap")
            self.assertContains(resp, "night_cap_app@proton.me")

    def test_privacy_covers_photos_and_subscriptions(self):
        resp = self.client.get("/privacy/")
        self.assertContains(resp, "Photos")
        self.assertContains(resp, "Subscriptions")
        self.assertContains(resp, "Delete account")

    def test_terms_include_auto_renew_language(self):
        resp = self.client.get("/terms/")
        self.assertContains(resp, "24 hours")
        self.assertContains(resp, "$2.00")
        self.assertContains(resp, "Restore purchases")

    def test_root_lists_legal_urls(self):
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["privacy"], "/privacy/")
        self.assertEqual(body["terms"], "/terms/")
        self.assertEqual(body["support"], "/support/")

    def test_markdown_links_and_lists(self):
        html = markdown_to_html(
            "# Hello\n\nSee [Privacy](/privacy/).\n\n- One\n- Two"
        )
        self.assertIn("<h1>Hello</h1>", html)
        self.assertIn('<a href="/privacy/">Privacy</a>', html)
        self.assertIn("<li>One</li>", html)
