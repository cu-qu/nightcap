from collections import Counter
from datetime import date, timedelta
from io import BytesIO
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import DevicePushToken, Membership, User
from accounts.partnerships import accept_invite_code, ensure_partnership
from categories.defaults import create_default_categories_for_user
from categories.models import TrackingCategory
from entries.models import Entry, MonthlyRecap, NightCap
from entries.recaps import generate_previous_month_recaps, list_available_recaps


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
        self.assertIn("/api/v1/recaps/moments/", snap["photos"][0]["photo_url"])
        self.assertEqual(snap["moments"][0]["text"], "Sunset on the walk home.")
        self.assertEqual(snap["moods"][0]["mood"], "🙂")
        names = {c["name"] for c in snap["categories"]}
        self.assertIn("Groceries", names)
        self.assertEqual(snap["together_days"], 1)
        self.assertTrue(snap["moments"][0]["has_photo"])
        self.assertIn("/api/v1/recaps/moments/", snap["moments"][0]["photo_url"])
        self.assertFalse(data["shared"])
        types = [s["type"] for s in data["slides"]]
        self.assertIn("moment", types)
        moment_slide = next(s for s in data["slides"] if s["type"] == "moment")
        self.assertTrue(moment_slide["moments"])
        self.assertTrue(moment_slide["moments"][0]["has_photo"])
        self.assertTrue(moment_slide["photos"])
        self.assertLess(types.index("logged"), types.index("moment"))
        self.assertLess(types.index("moment"), types.index("close"))
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
        moment_slides = [s for s in data["slides"] if s["type"] == "moment"]
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


def _prev_month_dates(count: int) -> list[date]:
    today = timezone.localdate()
    anchor = date(today.year, today.month, 1) - timedelta(days=1)
    return [date(anchor.year, anchor.month, day) for day in range(1, count + 1)]


def _save_moment(user, day: date, text: str, mood: str = "🤩") -> NightCap:
    nightcap = NightCap.objects.create(
        user=user,
        date=day,
        favorite_moment=text,
        mood=mood,
        status=NightCap.STATUS_COMPLETED,
    )
    nightcap.set_favorite_photo(_png_upload(f"{user.username}-{day.isoformat()}.png"))
    return nightcap


class SharedMonthRecapTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="alex",
            email="alex@example.com",
            password="testpass123",
            first_name="Alex",
        )
        self.partner = User.objects.create_user(
            username="jordan",
            email="jordan@example.com",
            password="testpass123",
            first_name="Jordan",
        )
        partnership = ensure_partnership(self.user)
        accept_invite_code(self.partner, partnership.invite_code)
        self.partnership = partnership
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.partner_client = APIClient()
        self.partner_client.force_authenticate(user=self.partner)

    def test_couple_slideshow_is_shared_and_chronological(self):
        days = _prev_month_dates(3)
        _save_moment(self.user, days[0], "Alex early")
        _save_moment(self.user, days[2], "Alex late")
        _save_moment(self.partner, days[1], "Jordan mid")

        resp = self.client.get(
            f"/api/v1/recaps/month/?year={days[0].year}&month={days[0].month}"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertTrue(data["shared"])
        self.assertEqual({person["name"] for person in data["people"]}, {"Alex", "Jordan"})
        moment_slides = [slide for slide in data["slides"] if slide["type"] == "moment"]
        texts = [slide["moments"][0]["text"] for slide in moment_slides]
        self.assertEqual(texts, ["Alex early", "Jordan mid", "Alex late"])
        self.assertEqual(
            [slide["eyebrow"] for slide in moment_slides],
            ["Alex", "Jordan", "Alex"],
        )
        self.assertTrue(all(slide["photos"] for slide in moment_slides))
        self.assertIn("Alex and Jordan", data["slides"][0]["body"])

        partner_view = self.partner_client.get(
            f"/api/v1/recaps/month/?year={days[0].year}&month={days[0].month}"
        )
        partner_texts = [
            slide["moments"][0]["text"]
            for slide in partner_view.json()["slides"]
            if slide["type"] == "moment"
        ]
        self.assertEqual(partner_texts, texts)
        self.assertEqual(
            MonthlyRecap.objects.filter(partnership=self.partnership).count(),
            1,
        )

        photo_url = moment_slides[0]["photos"][0]["photo_url"]
        nightcap_uuid = photo_url.split("/moments/")[1].split("/")[0]
        photo = self.partner_client.get(f"/api/v1/recaps/moments/{nightcap_uuid}/photo/")
        self.assertEqual(photo.status_code, 200)
        self.assertTrue(photo["Content-Type"].startswith("image/"))

        stranger = User.objects.create_user(
            username="strangerrecap",
            email="strangerrecap@example.com",
            password="testpass123",
        )
        stranger_client = APIClient()
        stranger_client.force_authenticate(user=stranger)
        hidden = stranger_client.get(f"/api/v1/recaps/moments/{nightcap_uuid}/photo/")
        self.assertEqual(hidden.status_code, 404)
        their_month = stranger_client.get(
            f"/api/v1/recaps/month/?year={days[0].year}&month={days[0].month}"
        )
        self.assertEqual(their_month.json()["snapshot"]["nights_logged"], 0)

    def test_top_five_drops_the_weaker_moment(self):
        days = _prev_month_dates(6)
        for day in days[:5]:
            _save_moment(self.user, day, f"Keep {day.day}", mood="🤩")
        _save_moment(self.partner, days[5], "Skip the rough one", mood="😣")
        for day in days[:5]:
            _save_moment(self.partner, day, f"Jordan {day.day}", mood="🤩")

        resp = self.client.get(
            f"/api/v1/recaps/month/?year={days[0].year}&month={days[0].month}"
        )
        moment_slides = [
            slide for slide in resp.json()["slides"] if slide["type"] == "moment"
        ]
        texts = [slide["moments"][0]["text"] for slide in moment_slides]
        self.assertNotIn("Skip the rough one", texts)
        counts = Counter(slide["moments"][0]["author"] for slide in moment_slides)
        self.assertEqual(counts, {"Alex": 5, "Jordan": 5})
        dates = [slide["moments"][0]["date"] for slide in moment_slides]
        self.assertEqual(dates, sorted(dates))

    def test_index_includes_a_month_only_the_partner_logged(self):
        day = _prev_month_dates(1)[0]
        _save_moment(self.partner, day, "Only Jordan")
        resp = self.client.get("/api/v1/recaps/")
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertTrue(data["shared"])
        self.assertTrue(
            any(
                item["year"] == day.year and item["month"] == day.month
                for item in data["months"]
            )
        )


class MonthlyRecapTaskTests(TestCase):
    def _expire(self, user):
        membership = Membership.objects.get(user=user)
        membership.trial_ends_at = timezone.now() - timedelta(days=1)
        membership.save(update_fields=["trial_ends_at", "updated_at"])

    @patch("accounts.apns.send_apns", return_value=True)
    def test_first_of_month_builds_shared_and_solo_recaps(self, send_apns):
        couple_owner = User.objects.create_user(
            username="coupleowner",
            email="coupleowner@example.com",
            password="testpass123",
            first_name="Casey",
        )
        couple_partner = User.objects.create_user(
            username="couplepartner",
            email="couplepartner@example.com",
            password="testpass123",
            first_name="Rae",
        )
        partnership = ensure_partnership(couple_owner)
        accept_invite_code(couple_partner, partnership.invite_code)

        solo = User.objects.create_user(
            username="solorecap",
            email="solorecap@example.com",
            password="testpass123",
        )
        expired = User.objects.create_user(
            username="expiredrecap",
            email="expiredrecap@example.com",
            password="testpass123",
        )
        self._expire(expired)

        days = _prev_month_dates(2)
        _save_moment(couple_owner, days[0], "Casey night")
        _save_moment(couple_partner, days[1], "Rae night")
        _save_moment(solo, days[0], "Solo night")
        _save_moment(expired, days[0], "Should not generate")
        DevicePushToken.objects.create(
            user=solo,
            token="a" * 64,
            platform=DevicePushToken.PLATFORM_IOS,
            environment=DevicePushToken.ENV_SANDBOX,
        )

        from config.celery import app

        schedule = app.conf.beat_schedule["generate-monthly-recaps"]
        self.assertEqual(schedule["task"], "entries.tasks.generate_previous_month_recaps")
        self.assertEqual(set(schedule["schedule"].day_of_month), {1})
        self.assertEqual(set(schedule["schedule"].hour), {8})

        result = generate_previous_month_recaps()
        self.assertEqual(result["created"], 2)
        self.assertEqual(result["skipped"], 0)
        couple_recap = MonthlyRecap.objects.get(partnership=partnership)
        self.assertEqual(len(couple_recap.highlight_uuids), 2)
        self.assertIsNotNone(couple_recap.notified_at)
        solo_recap = MonthlyRecap.objects.get(user=solo)
        self.assertEqual(len(solo_recap.highlight_uuids), 1)
        self.assertFalse(MonthlyRecap.objects.filter(user=expired).exists())
        self.assertFalse(MonthlyRecap.objects.filter(user=couple_owner).exists())
        self.assertEqual(send_apns.call_count, 1)
        self.assertIn("slideshow", send_apns.call_args.kwargs["body"])

        again = generate_previous_month_recaps()
        self.assertEqual(again["created"], 0)
        self.assertEqual(again["existing"], 2)
        self.assertEqual(send_apns.call_count, 1)
        self.assertEqual(MonthlyRecap.objects.count(), 2)

        call_command("generate_monthly_recaps")
        self.assertEqual(MonthlyRecap.objects.count(), 2)

    def test_opening_a_closed_month_freezes_the_selection(self):
        user = User.objects.create_user(
            username="freezeuser",
            email="freeze@example.com",
            password="testpass123",
        )
        client = APIClient()
        client.force_authenticate(user=user)
        days = _prev_month_dates(2)
        _save_moment(user, days[0], "Already kept")
        resp = client.get(
            f"/api/v1/recaps/month/?year={days[0].year}&month={days[0].month}"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(MonthlyRecap.objects.filter(user=user).count(), 1)
        _save_moment(user, days[1], "Added after close")
        again = client.get(
            f"/api/v1/recaps/month/?year={days[0].year}&month={days[0].month}"
        )
        texts = [
            slide["moments"][0]["text"]
            for slide in again.json()["slides"]
            if slide["type"] == "moment"
        ]
        self.assertEqual(texts, ["Already kept"])
        self.assertEqual(MonthlyRecap.objects.filter(user=user).count(), 1)
