from datetime import date, timedelta
from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from categories.defaults import DEFAULT_CATEGORIES, create_default_categories_for_user
from categories.models import TrackingCategory
from entries.models import DayReflection, Entry, NightCap


class RitualApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="ritualuser",
            email="ritual@example.com",
            password="testpass123",
        )
        create_default_categories_for_user(self.user)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.spend = TrackingCategory.objects.get(
            user=self.user, name="Groceries"
        )
        self.read = TrackingCategory.objects.get(user=self.user, name="I Read")
        self.sauna = TrackingCategory.objects.get(
            user=self.user, name="Sauna / Meditation"
        )
        self.run = TrackingCategory.objects.get(
            user=self.user, name="I Ran / Worked Out"
        )

    def test_default_categories_match_mobile_ritual(self):
        names = set(
            TrackingCategory.objects.filter(user=self.user).values_list("name", flat=True)
        )
        expected = {item["name"] for item in DEFAULT_CATEGORIES}
        self.assertEqual(names, expected)
        self.assertEqual(len(DEFAULT_CATEGORIES), 15)

    def test_ritual_upsert_with_reflection_and_uuid(self):
        today = date.today().isoformat()
        resp = self.client.post(
            "/api/v1/ritual/",
            {
                "date": today,
                "reflection": "Grateful for a calm evening.",
                "items": [
                    {"category_uuid": str(self.spend.uuid), "amount": "22.50"},
                    {"category_uuid": str(self.read.uuid), "quantity": "30"},
                    {"category_uuid": str(self.sauna.uuid), "quantity": "1"},
                    {
                        "category_uuid": str(self.run.uuid),
                        "quantity": "3.50",
                        "label": "Evening jog",
                    },
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertEqual(data["reflection"], "Grateful for a calm evening.")
        self.assertEqual(len(data["entries"]), 4)
        self.assertTrue(data["summary"]["has_reflection"])

        # Upsert same categories — still one row each
        resp2 = self.client.post(
            "/api/v1/ritual/",
            {
                "date": today,
                "items": [
                    {"category_uuid": str(self.spend.uuid), "amount": "40.00"},
                ],
            },
            format="json",
        )
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(
            Entry.objects.filter(user=self.user, date=date.today()).count(), 4
        )
        groceries = Entry.objects.get(
            user=self.user, date=date.today(), category=self.spend
        )
        self.assertEqual(groceries.amount, Decimal("40.00"))
        self.assertEqual(
            NightCap.objects.get(user=self.user, date=date.today()).reflection,
            "Grateful for a calm evening.",
        )
        self.assertEqual(
            NightCap.objects.get(user=self.user, date=date.today()).status,
            NightCap.STATUS_COMPLETED,
        )
        self.assertEqual(
            DayReflection.objects.get(user=self.user, date=date.today()).reflection,
            "Grateful for a calm evening.",
        )

    def test_ritual_quick_single_item(self):
        resp = self.client.post(
            "/api/v1/ritual/",
            {
                "date": date.today().isoformat(),
                "items": [{"category": self.spend.id, "amount": "9.99"}],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()["entries"]), 1)

    def test_day_reflection_endpoint(self):
        day = date.today().isoformat()
        resp = self.client.patch(
            f"/api/v1/day-reflections/{day}/",
            {"reflection": "Good note"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["reflection"], "Good note")
        get_resp = self.client.get(f"/api/v1/day-reflections/{day}/")
        self.assertEqual(get_resp.json()["reflection"], "Good note")

    def test_calendar_month(self):
        today = date.today()
        Entry.objects.create(
            user=self.user,
            category=self.spend,
            date=today,
            amount=Decimal("12.00"),
        )
        Entry.objects.create(
            user=self.user,
            category=self.read,
            date=today,
            quantity=Decimal("20"),
        )
        DayReflection.objects.create(
            user=self.user, date=today, reflection="Hi"
        )
        NightCap.objects.update_or_create(
            user=self.user,
            date=today,
            defaults={
                "reflection": "Hi",
                "mood": "🔥",
                "status": NightCap.STATUS_COMPLETED,
            },
        )
        resp = self.client.get(
            f"/api/v1/calendar/?year={today.year}&month={today.month}"
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["year"], today.year)
        day_row = next(d for d in data["days"] if d["date"] == today.isoformat())
        self.assertTrue(day_row["has_entries"])
        self.assertTrue(day_row["has_reflection"])
        self.assertEqual(day_row["mood"], "🔥")
        self.assertEqual(day_row["expense_total"], "12.00")
        group_keys = {g["key"] for g in day_row["groups"]}
        self.assertIn("daily_spend", group_keys)
        self.assertIn("follow_up", group_keys)
        spend_group = next(g for g in day_row["groups"] if g["key"] == "daily_spend")
        self.assertEqual(spend_group["entry_count"], 1)
        self.assertTrue(spend_group["category_emojis"])

    def test_charts_daily(self):
        today = date.today()
        Entry.objects.create(
            user=self.user,
            category=self.spend,
            date=today,
            amount=Decimal("15.00"),
        )
        resp = self.client.get(
            "/api/v1/charts/",
            {
                "period": "daily",
                "start_date": today.replace(day=1).isoformat(),
                "end_date": today.isoformat(),
            },
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["period"], "daily")
        self.assertTrue(any(p["expense_total"] == "15.00" for p in data["points"]))

    def test_charts_weekly(self):
        resp = self.client.get("/api/v1/charts/?period=weekly")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["period"], "weekly")

    def test_entry_exposes_uuid(self):
        resp = self.client.post(
            "/api/v1/entries/",
            {
                "date": date.today().isoformat(),
                "category": self.spend.id,
                "amount": "5.00",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertIn("uuid", resp.json())
        self.assertIn("category_uuid", resp.json())

    def test_sync_default_categories_command(self):
        TrackingCategory.objects.filter(user=self.user, name="Gifts").delete()
        out = StringIO()
        call_command("sync_default_categories", user_id=str(self.user.id), stdout=out)
        self.assertTrue(
            TrackingCategory.objects.filter(user=self.user, name="Gifts").exists()
        )
        self.assertIn("created 1", out.getvalue())
