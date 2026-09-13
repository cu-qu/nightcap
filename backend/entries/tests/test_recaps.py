from datetime import date, timedelta
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User
from categories.defaults import create_default_categories_for_user
from categories.models import TrackingCategory
from entries.models import Entry
from entries.recaps import list_available_recaps


def _png_upload(name="moment.png", color="red") -> SimpleUploadedFile:
    buf = BytesIO()
    Image.new("RGB", (8, 8), color).save(buf, format="PNG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")


class RecapApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="recapuser",
            email="recap@example.com",
            password="testpass123",
        )
        create_default_categories_for_user(self.user)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.spend = TrackingCategory.objects.get(user=self.user, name="Groceries")
        self.workout = TrackingCategory.objects.get(user=self.user, name="Workout")

    def _ritual(self, day: date, **extra):
        body = {"date": day.isoformat(), "items": [], **extra}
        resp = self.client.post("/api/v1/ritual/", body, format="json")
        self.assertEqual(resp.status_code, 200, resp.content)
        return resp

    def test_empty_month_recap(self):
        today = timezone.localdate()
        resp = self.client.get(
            f"/api/v1/recaps/month/?year={today.year}&month={today.month}"
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["kind"], "month")
        self.assertEqual(data["year"], today.year)
        self.assertEqual(data["month"], today.month)
        self.assertEqual(data["snapshot"]["nights_logged"], 0)
        types = [s["type"] for s in data["slides"]]
        self.assertEqual(types[0], "cover")
        self.assertEqual(types[-1], "close")

    def test_month_recap_includes_photos_moments_and_logged_items(self):
        today = timezone.localdate()
        self._ritual(
            today,
            favorite_moment="Sunset on the walk home.",
            mood="🙂",
            reflection="Ended on a good note.",
            items=[
                {"category_uuid": str(self.spend.uuid), "amount": "18.50"},
                {
                    "category_uuid": str(self.workout.uuid),
                    "quantity": "1",
                    "completed_with": Entry.COMPLETED_WITH_PARTNER,
                },
            ],
        )
        photo = self.client.post(
            f"/api/v1/nightcaps/{today.isoformat()}/photo/",
            {"photo": _png_upload()},
            format="multipart",
        )
        self.assertEqual(photo.status_code, 200, photo.content)

        resp = self.client.get(
            f"/api/v1/recaps/month/?year={today.year}&month={today.month}"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        snap = data["snapshot"]
        self.assertEqual(snap["nights_logged"], 1)
        self.assertEqual(snap["photo_count"], 1)
        self.assertEqual(len(snap["photos"]), 1)
        self.assertIn(
            f"/api/v1/nightcaps/{today.isoformat()}/photo/",
            snap["photos"][0]["photo_url"],
        )
        self.assertEqual(snap["moments"][0]["text"], "Sunset on the walk home.")
        self.assertEqual(snap["moods"][0]["mood"], "🙂")
        names = {c["name"] for c in snap["categories"]}
        self.assertIn("Groceries", names)
        self.assertEqual(snap["together_days"], 1)
        self.assertTrue(snap["moments"][0]["has_photo"])
        self.assertIn(
            f"/api/v1/nightcaps/{today.isoformat()}/photo/",
            snap["moments"][0]["photo_url"],
        )
        types = [s["type"] for s in data["slides"]]
        self.assertIn("moments", types)
        moment_slide = next(s for s in data["slides"] if s["type"] == "moments")
        self.assertTrue(moment_slide["moments"])
        self.assertTrue(moment_slide["moments"][0]["has_photo"])
        self.assertIn("logged", types)
        self.assertIn("together", types)

    def test_month_recap_is_private(self):
        today = timezone.localdate()
        self._ritual(today, favorite_moment="Only mine.")
        other = User.objects.create_user(
            username="otherrecap",
            email="otherrecap@example.com",
            password="testpass123",
        )
        other_client = APIClient()
        other_client.force_authenticate(user=other)
        resp = other_client.get(
            f"/api/v1/recaps/month/?year={today.year}&month={today.month}"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["snapshot"]["nights_logged"], 0)

    def test_year_recap_walks_seasons(self):
        today = timezone.localdate()
        year = today.year
        winter = date(year, 1, 15)
        spring = date(year, 4, 10)
        summer = date(year, 7, 4)
        if winter > today or spring > today or summer > today:
            self.skipTest("Need a date after July for the seasonal walkthrough.")

        self._ritual(winter, favorite_moment="First snow.", mood="🤩")
        self.client.post(
            f"/api/v1/nightcaps/{winter.isoformat()}/photo/",
            {"photo": _png_upload("winter.png", "white")},
            format="multipart",
        )
        self._ritual(
            spring,
            items=[{"category_uuid": str(self.spend.uuid), "amount": "42.00"}],
        )
        self._ritual(
            summer,
            items=[{"category_uuid": str(self.workout.uuid), "quantity": "5"}],
        )

        resp = self.client.get(f"/api/v1/recaps/year/?year={year}")
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertEqual(data["kind"], "year")
        self.assertEqual(data["year"], year)
        self.assertGreaterEqual(data["snapshot"]["nights_logged"], 3)
        season_keys = [s["key"] for s in data["seasons"] if s["nights_logged"]]
        self.assertIn("winter", season_keys)
        self.assertIn("spring", season_keys)
        self.assertIn("summer", season_keys)

        season_slides = [s for s in data["slides"] if s["type"] == "season"]
        names = [s["title"] for s in season_slides]
        self.assertEqual(names[:3], ["Winter", "Spring", "Summer"])
        self.assertEqual(data["slides"][0]["type"], "cover")
        self.assertEqual(data["slides"][-1]["type"], "close")

        winter_season = next(s for s in data["seasons"] if s["key"] == "winter")
        self.assertEqual(winter_season["photo_count"], 1)
        self.assertEqual(winter_season["moments"][0]["text"], "First snow.")
        self.assertTrue(winter_season["moments"][0]["has_photo"])
        moment_slides = [s for s in data["slides"] if s["type"] == "moments"]
        self.assertTrue(moment_slides)
        self.assertTrue(
            any(
                m.get("text") == "First snow."
                for s in moment_slides
                for m in s.get("moments") or []
            )
        )

    def test_future_month_is_empty(self):
        today = timezone.localdate()
        year = today.year + 1
        resp = self.client.get(f"/api/v1/recaps/month/?year={year}&month=1")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["snapshot"]["nights_logged"], 0)
        self.assertEqual(resp.json()["snapshot"]["day_count"], 0)

    def test_index_lists_past_months_and_features_first_week(self):
        today = timezone.localdate()
        prev = date(today.year, today.month, 1) - timedelta(days=1)
        self._ritual(prev, favorite_moment="Last month's walk.")
        self._ritual(today, favorite_moment="Still this month.")

        resp = self.client.get("/api/v1/recaps/")
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertEqual(data["highlight_days"], 7)
        self.assertTrue(
            any(
                item["year"] == prev.year and item["month"] == prev.month
                for item in data["months"]
            )
        )
        self.assertFalse(
            any(
                item["year"] == today.year and item["month"] == today.month
                for item in data["months"]
            )
        )

        first_week = date(today.year, today.month, 3)
        featured = list_available_recaps(self.user, today=first_week)
        self.assertIsNotNone(featured["featured_month"])
        self.assertEqual(featured["featured_month"]["year"], prev.year)
        self.assertEqual(featured["featured_month"]["month"], prev.month)

        later = date(today.year, today.month, min(today.day, 28))
        if later.day > 7:
            quiet = list_available_recaps(self.user, today=later)
            self.assertIsNone(quiet["featured_month"])
        jan = list_available_recaps(self.user, today=date(today.year + 1, 1, 4))
        self.assertEqual(jan["featured_year"]["year"], today.year)
