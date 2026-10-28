from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from categories.defaults import create_default_categories_for_user
from entries.moderation import text_is_objectionable


class ModerationTests(TestCase):
    def test_phrases_match_whole_words_only(self):
        self.assertTrue(text_is_objectionable("please kill yourself"))
        self.assertFalse(text_is_objectionable("grape soda on the porch"))
        self.assertFalse(text_is_objectionable("a lollipop after dinner"))

    def test_ritual_rejects_objectionable_moment_text(self):
        user = User.objects.create_user(
            username="momentuser",
            email="moment@example.com",
            password="testpass123",
        )
        create_default_categories_for_user(user)
        client = APIClient()
        client.force_authenticate(user=user)
        resp = client.post(
            "/api/v1/ritual/",
            {
                "date": date.today().isoformat(),
                "favorite_moment": "kill yourself",
                "items": [],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertIn("can't be saved", str(resp.json()))
