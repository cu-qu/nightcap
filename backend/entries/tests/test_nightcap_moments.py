from datetime import date
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User
from categories.defaults import create_default_categories_for_user
from entries.models import NightCap


def _png_bytes(color="red") -> bytes:
    buf = BytesIO()
    Image.new("RGB", (8, 8), color).save(buf, format="PNG")
    return buf.getvalue()


def _png_upload(name="moment.png", color="red") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, _png_bytes(color), content_type="image/png")


class NightCapMomentsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="momentuser",
            email="moment@example.com",
            password="testpass123",
        )
        create_default_categories_for_user(self.user)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.today = date.today().isoformat()

    def test_ritual_saves_favorite_moment(self):
        resp = self.client.post(
            "/api/v1/ritual/",
            {
                "date": self.today,
                "favorite_moment": "The dog running through leaves.",
                "items": [],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertEqual(
            data["nightcap"]["favorite_moment"],
            "The dog running through leaves.",
        )
        self.assertFalse(data["nightcap"]["has_favorite_photo"])
        nightcap = NightCap.objects.get(user=self.user, date=date.today())
        self.assertEqual(nightcap.favorite_moment, "The dog running through leaves.")

    def test_nightcap_patch_favorite_moment(self):
        resp = self.client.patch(
            f"/api/v1/nightcaps/{self.today}/",
            {"favorite_moment": "Coffee on the porch."},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.json()["favorite_moment"], "Coffee on the porch.")

    def test_upload_get_replace_and_delete_photo(self):
        upload = self.client.post(
            f"/api/v1/nightcaps/{self.today}/photo/",
            {"photo": _png_upload()},
            format="multipart",
        )
        self.assertEqual(upload.status_code, 200, upload.content)
        body = upload.json()
        self.assertTrue(body["has_favorite_photo"])
        self.assertIsNotNone(body["favorite_photo_url"])
        self.assertIn(f"/api/v1/nightcaps/{self.today}/photo/", body["favorite_photo_url"])

        nightcap = NightCap.objects.get(user=self.user, date=date.today())
        self.assertTrue(nightcap.favorite_photo)
        first_name = nightcap.favorite_photo.name

        fetched = self.client.get(f"/api/v1/nightcaps/{self.today}/photo/")
        self.assertEqual(fetched.status_code, 200)
        self.assertTrue(fetched["Content-Type"].startswith("image/"))
        self.assertGreater(len(fetched.getvalue()), 0)

        replace = self.client.post(
            f"/api/v1/nightcaps/{self.today}/photo/",
            {"photo": _png_upload("other.png", "blue")},
            format="multipart",
        )
        self.assertEqual(replace.status_code, 200, replace.content)
        nightcap.refresh_from_db()
        self.assertTrue(nightcap.favorite_photo)
        self.assertNotEqual(nightcap.favorite_photo.name, first_name)

        deleted = self.client.delete(f"/api/v1/nightcaps/{self.today}/photo/")
        self.assertEqual(deleted.status_code, 200, deleted.content)
        self.assertFalse(deleted.json()["has_favorite_photo"])
        nightcap.refresh_from_db()
        self.assertFalse(nightcap.favorite_photo)

        missing = self.client.get(f"/api/v1/nightcaps/{self.today}/photo/")
        self.assertEqual(missing.status_code, 404)

    def test_photo_rejects_non_image(self):
        resp = self.client.post(
            f"/api/v1/nightcaps/{self.today}/photo/",
            {
                "photo": SimpleUploadedFile(
                    "notes.txt", b"not an image", content_type="text/plain"
                )
            },
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)

    def test_photo_is_private_to_owner(self):
        self.client.post(
            f"/api/v1/nightcaps/{self.today}/photo/",
            {"photo": _png_upload()},
            format="multipart",
        )
        other = User.objects.create_user(
            username="other",
            email="other@example.com",
            password="testpass123",
        )
        other_client = APIClient()
        other_client.force_authenticate(user=other)
        resp = other_client.get(f"/api/v1/nightcaps/{self.today}/photo/")
        self.assertEqual(resp.status_code, 404)

    def test_calendar_includes_moments(self):
        self.client.post(
            "/api/v1/ritual/",
            {
                "date": self.today,
                "favorite_moment": "First snow.",
                "items": [],
            },
            format="json",
        )
        self.client.post(
            f"/api/v1/nightcaps/{self.today}/photo/",
            {"photo": _png_upload()},
            format="multipart",
        )
        today = date.today()
        resp = self.client.get(
            f"/api/v1/calendar/?year={today.year}&month={today.month}"
        )
        self.assertEqual(resp.status_code, 200)
        day_row = next(d for d in resp.json()["days"] if d["date"] == self.today)
        self.assertTrue(day_row["has_favorite_photo"])
        self.assertEqual(day_row["favorite_moment"], "First snow.")
