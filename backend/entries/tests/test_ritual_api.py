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
        self.water = TrackingCategory.objects.get(user=self.user, name="Water")
        self.workout = TrackingCategory.objects.get(
            user=self.user, name="Workout"
        )

    def test_default_categories_match_mobile_ritual(self):
        names = set(
            TrackingCategory.objects.filter(user=self.user).values_list("name", flat=True)
        )
        expected = {item["name"] for item in DEFAULT_CATEGORIES}
        self.assertEqual(names, expected)
        self.assertEqual(len(DEFAULT_CATEGORIES), 13)

    def test_ritual_upsert_with_reflection_and_uuid(self):
        checkin = TrackingCategory.objects.create(
            user=self.user,
            name="Meditation",
            type=TrackingCategory.HABIT,
            metric_kind=TrackingCategory.METRIC_BOOLEAN,
            unit="count",
        )
        today = date.today().isoformat()
        resp = self.client.post(
            "/api/v1/ritual/",
            {
                "date": today,
                "reflection": "Grateful for a calm evening.",
                "items": [
                    {"category_uuid": str(self.spend.uuid), "amount": "22.50"},
                    {"category_uuid": str(self.water.uuid), "quantity": "6"},
                    {"category_uuid": str(checkin.uuid), "quantity": "1"},
                    {
                        "category_uuid": str(self.workout.uuid),
                        "quantity": "1",
                        "label": "Evening gym",
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
        self.assertEqual(groceries.completed_with, Entry.COMPLETED_ALONE)
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

    def test_ritual_replace_items_updates_and_clears_omitted(self):
        today = date.today().isoformat()
        self.client.post(
            "/api/v1/ritual/",
            {
                "date": today,
                "mood": "🙂",
                "reflection": "First save",
                "items": [
                    {"category_uuid": str(self.spend.uuid), "amount": "10.00"},
                    {"category_uuid": str(self.water.uuid), "quantity": "6"},
                ],
            },
            format="json",
        )
        resp = self.client.post(
            "/api/v1/ritual/",
            {
                "date": today,
                "mood": "🤩",
                "reflection": "Edited save",
                "replace_items": True,
                "items": [
                    {"category_uuid": str(self.spend.uuid), "amount": "42.00"},
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(
            Entry.objects.filter(user=self.user, date=date.today()).count(), 1
        )
        groceries = Entry.objects.get(
            user=self.user, date=date.today(), category=self.spend
        )
        self.assertEqual(groceries.amount, Decimal("42.00"))
        self.assertFalse(
            Entry.objects.filter(
                user=self.user, date=date.today(), category=self.water
            ).exists()
        )
        nightcap = NightCap.objects.get(user=self.user, date=date.today())
        self.assertEqual(nightcap.mood, "🤩")
        self.assertEqual(nightcap.reflection, "Edited save")

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

    def test_ritual_persists_completed_with_partner(self):
        today = date.today().isoformat()
        resp = self.client.post(
            "/api/v1/ritual/",
            {
                "date": today,
                "items": [
                    {
                        "category_uuid": str(self.workout.uuid),
                        "quantity": "1",
                        "completed_with": "with_partner",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        entry = resp.json()["entries"][0]
        self.assertEqual(entry["completed_with"], "with_partner")
        saved = Entry.objects.get(user=self.user, date=date.today(), category=self.workout)
        self.assertEqual(saved.completed_with, Entry.COMPLETED_WITH_PARTNER)

        resp2 = self.client.post(
            "/api/v1/ritual/",
            {
                "date": today,
                "items": [
                    {
                        "category_uuid": str(self.workout.uuid),
                        "quantity": "1",
                        "completed_with": "alone",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(resp2.status_code, 200)
        saved.refresh_from_db()
        self.assertEqual(saved.completed_with, Entry.COMPLETED_ALONE)

    def test_ritual_spend_ignores_completed_with_partner(self):
        today = date.today().isoformat()
        resp = self.client.post(
            "/api/v1/ritual/",
            {
                "date": today,
                "items": [
                    {
                        "category_uuid": str(self.spend.uuid),
                        "amount": "22.50",
                        "completed_with": "with_partner",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        entry = resp.json()["entries"][0]
        self.assertEqual(entry["completed_with"], "alone")
        saved = Entry.objects.get(user=self.user, date=date.today(), category=self.spend)
        self.assertEqual(saved.completed_with, Entry.COMPLETED_ALONE)

    def test_ritual_rejects_invalid_completed_with(self):
        resp = self.client.post(
            "/api/v1/ritual/",
            {
                "date": date.today().isoformat(),
                "items": [
                    {
                        "category_uuid": str(self.workout.uuid),
                        "quantity": "1",
                        "completed_with": "together",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_ritual_shared_empty_without_partner(self):
        resp = self.client.get("/api/v1/ritual/shared/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIsNone(data["partner_username"])
        self.assertEqual(data["entries"], [])
        self.assertEqual(data["shared_category_uuids"], [])

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
            category=self.water,
            date=today,
            quantity=Decimal("6"),
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
        self.assertEqual(spend_group["categories"][0]["name"], "Groceries")
        self.assertEqual(spend_group["categories"][0]["amount"], "12.00")
        follow = next(g for g in day_row["groups"] if g["key"] == "follow_up")
        water_cat = next(c for c in follow["categories"] if c["name"] == "Water")
        self.assertEqual(water_cat["quantity"], "6.00")
        self.assertEqual(water_cat["unit"], "glasses")

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

    def test_charts_includes_groups_categories_and_together(self):
        today = date.today()
        Entry.objects.create(
            user=self.user,
            category=self.spend,
            date=today,
            amount=Decimal("15.00"),
        )
        Entry.objects.create(
            user=self.user,
            category=self.water,
            date=today,
            quantity=Decimal("6"),
        )
        Entry.objects.create(
            user=self.user,
            category=self.workout,
            date=today,
            quantity=Decimal("1"),
            completed_with=Entry.COMPLETED_WITH_PARTNER,
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
        names = {row["name"] for row in data["by_category"]}
        self.assertEqual(names, {"Groceries", "Water", "Workout"})
        groc = next(row for row in data["by_category"] if row["name"] == "Groceries")
        self.assertEqual(groc["group_key"], "daily_spend")
        self.assertEqual(groc["amount_total"], "15.00")
        water = next(row for row in data["by_category"] if row["name"] == "Water")
        self.assertEqual(water["unit"], "glasses")
        self.assertEqual(water["quantity_total"], "6.00")
        group_keys = {g["key"] for g in data["by_group"]}
        self.assertIn("daily_spend", group_keys)
        self.assertIn("follow_up", group_keys)
        self.assertEqual(data["together"]["together_count"], 1)
        self.assertEqual(data["together"]["alone_count"], 1)
        today_point = next(p for p in data["points"] if p["date"] == today.isoformat())
        self.assertEqual(today_point["together_count"], 1)
        units = {row["unit"]: row["total"] for row in today_point["quantity_by_unit"]}
        self.assertEqual(units["glasses"], "6.00")

    def test_charts_filter_by_group(self):
        today = date.today()
        Entry.objects.create(
            user=self.user,
            category=self.spend,
            date=today,
            amount=Decimal("9.00"),
        )
        Entry.objects.create(
            user=self.user,
            category=self.water,
            date=today,
            quantity=Decimal("3"),
        )
        resp = self.client.get(
            "/api/v1/charts/",
            {
                "period": "daily",
                "group": "daily_spend",
                "start_date": today.replace(day=1).isoformat(),
                "end_date": today.isoformat(),
            },
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual([row["name"] for row in data["by_category"]], ["Groceries"])
        self.assertEqual(data["by_group"][0]["key"], "daily_spend")
        today_point = next(p for p in data["points"] if p["date"] == today.isoformat())
        self.assertEqual(today_point["expense_total"], "9.00")

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
