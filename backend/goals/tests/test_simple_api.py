from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from categories.defaults import create_default_categories_for_user
from categories.models import TrackingCategory
from entries.models import Entry
from goals.models import Goal


class SimpleGoalApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="goalmobile",
            email="goalmobile@example.com",
            password="testpass123",
        )
        create_default_categories_for_user(self.user)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.groceries = TrackingCategory.objects.get(user=self.user, name="Groceries")
        self.read = TrackingCategory.objects.get(user=self.user, name="I Read")

    def test_create_goal_with_category_uuid_and_progress(self):
        Entry.objects.create(
            user=self.user,
            category=self.groceries,
            date=date.today(),
            amount=Decimal("40.00"),
        )
        resp = self.client.post(
            "/api/v1/goals/",
            {
                "category_uuid": str(self.groceries.uuid),
                "target_value": "200.00",
                "period": "monthly",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        data = resp.json()
        self.assertEqual(data["direction"], "max")  # money default
        self.assertEqual(data["category_detail"]["uuid"], str(self.groceries.uuid))
        self.assertEqual(data["category_detail"]["name"], "Groceries")
        self.assertIsNotNone(data["progress"])
        self.assertEqual(Decimal(str(data["progress"]["current_value"])), Decimal("40.00"))
        self.assertEqual(data["progress"]["status_label"], "on_track")

    def test_habit_goal_defaults_to_min_direction(self):
        resp = self.client.post(
            "/api/v1/goals/",
            {
                "category_uuid": str(self.read.uuid),
                "target_value": "120",
                "period": "weekly",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(resp.json()["direction"], "min")

    def test_set_upserts_same_category_period(self):
        first = self.client.post(
            "/api/v1/goals/set/",
            {
                "category_uuid": str(self.groceries.uuid),
                "target_value": "150.00",
                "period": "monthly",
            },
            format="json",
        )
        self.assertEqual(first.status_code, 201)
        second = self.client.post(
            "/api/v1/goals/set/",
            {
                "category_uuid": str(self.groceries.uuid),
                "target_value": "250.00",
                "period": "monthly",
            },
            format="json",
        )
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json()["target_value"], "250.00")
        self.assertEqual(
            Goal.objects.filter(
                user=self.user, category=self.groceries, period="monthly", is_active=True
            ).count(),
            1,
        )

    def test_one_active_goal_per_category_not_both_periods(self):
        created = self.client.post(
            "/api/v1/goals/set/",
            {
                "category_uuid": str(self.groceries.uuid),
                "target_value": "50.00",
                "period": "weekly",
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201)

        # Direct create of a second period must fail
        conflict = self.client.post(
            "/api/v1/goals/",
            {
                "category_uuid": str(self.groceries.uuid),
                "target_value": "200.00",
                "period": "monthly",
            },
            format="json",
        )
        self.assertEqual(conflict.status_code, 400)

        # /set/ replaces and can switch weekly → monthly
        switched = self.client.post(
            "/api/v1/goals/set/",
            {
                "category_uuid": str(self.groceries.uuid),
                "target_value": "200.00",
                "period": "monthly",
            },
            format="json",
        )
        self.assertEqual(switched.status_code, 200)
        self.assertEqual(switched.json()["period"], "monthly")
        self.assertEqual(switched.json()["target_value"], "200.00")
        self.assertEqual(
            Goal.objects.filter(
                user=self.user, category=self.groceries, is_active=True
            ).count(),
            1,
        )
        self.assertEqual(
            Goal.objects.get(user=self.user, category=self.groceries, is_active=True).period,
            "monthly",
        )

    def test_list_includes_progress_active_only(self):
        Goal.objects.create(
            user=self.user,
            category=self.groceries,
            period=Goal.PERIOD_MONTHLY,
            direction=Goal.DIRECTION_MAX,
            target_value=Decimal("100"),
        )
        inactive = Goal.objects.create(
            user=self.user,
            category=self.read,
            period=Goal.PERIOD_WEEKLY,
            direction=Goal.DIRECTION_MIN,
            target_value=Decimal("60"),
            is_active=False,
        )
        resp = self.client.get("/api/v1/goals/")
        self.assertEqual(resp.status_code, 200)
        results = resp.json()["results"] if "results" in resp.json() else resp.json()
        self.assertEqual(len(results), 1)
        self.assertIn("progress", results[0])

        all_resp = self.client.get("/api/v1/goals/?active=false")
        all_results = (
            all_resp.json()["results"] if "results" in all_resp.json() else all_resp.json()
        )
        self.assertEqual(len(all_results), 2)
        inactive_row = next(r for r in all_results if r["id"] == inactive.id)
        self.assertIsNone(inactive_row["progress"])

    def test_delete_soft_deactivates(self):
        goal = Goal.objects.create(
            user=self.user,
            category=self.groceries,
            period=Goal.PERIOD_MONTHLY,
            direction=Goal.DIRECTION_MAX,
            target_value=Decimal("100"),
        )
        resp = self.client.delete(f"/api/v1/goals/{goal.id}/")
        self.assertEqual(resp.status_code, 204)
        goal.refresh_from_db()
        self.assertFalse(goal.is_active)

    def test_group_summary_health_and_modes(self):
        sauna = TrackingCategory.objects.get(user=self.user, name="Sauna / Meditation")
        # Stay under close to limit (85% of 100)
        Goal.objects.create(
            user=self.user,
            category=self.groceries,
            period=Goal.PERIOD_MONTHLY,
            direction=Goal.DIRECTION_MAX,
            target_value=Decimal("100"),
            warn_at_percent=80,
        )
        Entry.objects.create(
            user=self.user,
            category=self.groceries,
            date=date.today(),
            amount=Decimal("85.00"),
        )
        # Pass / close (near hit: 85 of 100)
        Goal.objects.create(
            user=self.user,
            category=self.read,
            period=Goal.PERIOD_WEEKLY,
            direction=Goal.DIRECTION_MIN,
            target_value=Decimal("100"),
            warn_at_percent=80,
        )
        Entry.objects.create(
            user=self.user,
            category=self.read,
            date=date.today(),
            quantity=Decimal("85"),
        )
        # Completed / passed (boolean metric counts days with an entry)
        Goal.objects.create(
            user=self.user,
            category=sauna,
            period=Goal.PERIOD_WEEKLY,
            direction=Goal.DIRECTION_MIN,
            target_value=Decimal("2"),
        )
        Entry.objects.create(
            user=self.user,
            category=sauna,
            date=date.today(),
            quantity=Decimal("1"),
        )
        Entry.objects.create(
            user=self.user,
            category=sauna,
            date=date.today() - timedelta(days=1),
            quantity=Decimal("1"),
        )

        resp = self.client.get("/api/v1/goals/group-summary/")
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertEqual(data["counts"]["total"], 3)
        self.assertEqual(data["counts"]["close"], 2)  # groceries near limit + read near pass
        self.assertEqual(data["counts"]["passed"], 1)
        self.assertEqual(data["counts"]["stay_under"], 1)
        self.assertEqual(data["counts"]["pass"], 1)
        self.assertEqual(data["counts"]["completed"], 1)

        # Overall + mode totals
        self.assertIn("metrics", data)
        self.assertEqual(data["metrics"]["stay_under"]["goal_count"], 1)
        self.assertEqual(
            Decimal(str(data["metrics"]["stay_under"]["target_total"])),
            Decimal("100.00"),
        )
        self.assertEqual(
            Decimal(str(data["metrics"]["stay_under"]["current_total"])),
            Decimal("85.00"),
        )
        self.assertEqual(data["metrics"]["stay_under"]["percent_used"], 85.0)
        self.assertEqual(data["metrics"]["pass"]["goal_count"], 1)
        self.assertEqual(
            Decimal(str(data["metrics"]["pass"]["current_total"])),
            Decimal("85"),
        )
        self.assertEqual(data["metrics"]["completed"]["goal_count"], 1)
        self.assertEqual(data["metrics"]["completed"]["passed"], 1)
        self.assertEqual(
            Decimal(str(data["metrics"]["target_total"])),
            Decimal("202.00"),
        )
        self.assertEqual(
            Decimal(str(data["metrics"]["current_total"])),
            Decimal("172.00"),
        )

        keys = {g["key"] for g in data["groups"]}
        self.assertIn("daily_spend", keys)
        self.assertIn("follow_up", keys)

        spend = next(g for g in data["groups"] if g["key"] == "daily_spend")
        self.assertEqual(spend["metrics"]["stay_under"]["goal_count"], 1)
        self.assertEqual(
            Decimal(str(spend["metrics"]["current_total"])),
            Decimal("85.00"),
        )
        self.assertEqual(spend["metrics"]["avg_percent_used"], 85.0)

        follow = next(g for g in data["groups"] if g["key"] == "follow_up")
        self.assertEqual(follow["counts"]["pass"], 1)
        self.assertEqual(follow["counts"]["completed"], 1)
        self.assertEqual(follow["metrics"]["pass"]["goal_count"], 1)
        self.assertEqual(follow["metrics"]["completed"]["goal_count"], 1)

        all_goals = [item for g in data["groups"] for item in g["goals"]]
        by_name = {g["display_name"]: g for g in all_goals}
        self.assertEqual(by_name["Groceries"]["mode"], "stay_under")
        self.assertEqual(by_name["Groceries"]["health"], "close")
        self.assertEqual(by_name["I Read"]["mode"], "pass")
        self.assertEqual(by_name["I Read"]["health"], "close")
        self.assertEqual(by_name["Sauna / Meditation"]["mode"], "completed")
        self.assertEqual(by_name["Sauna / Meditation"]["health"], "passed")

        monthly = self.client.get("/api/v1/goals/group-summary/?period=monthly")
        self.assertEqual(monthly.status_code, 200)
        body = monthly.json()
        self.assertEqual(body["period"], "monthly")
        self.assertTrue(body["includes_weekly_rolled_in"])
        weeks = body["weeks_in_month"]
        self.assertGreaterEqual(weeks, 4)
        self.assertLessEqual(weeks, 5)

        # Monthly goal + both weekly goals rolled (scaled) into the month view
        self.assertEqual(body["counts"]["total"], 3)
        self.assertEqual(
            Decimal(str(body["metrics_by_period"]["monthly"]["stay_under"]["target_total"])),
            Decimal("100.00"),
        )
        # Weekly pass target scales: 100 * weeks_in_month
        self.assertEqual(
            Decimal(str(body["metrics_by_period"]["monthly"]["pass"]["target_total"])),
            Decimal("100") * weeks,
        )
        self.assertEqual(
            Decimal(str(body["metrics_by_period"]["monthly"]["completed"]["target_total"])),
            Decimal("2") * weeks,
        )
        # Native this-week progress still available under weekly
        self.assertEqual(body["metrics_by_period"]["weekly"]["pass"]["goal_count"], 1)
        self.assertEqual(body["metrics_by_period"]["weekly"]["completed"]["goal_count"], 1)
        self.assertEqual(body["metrics"]["pass"]["goal_count"], 1)
        self.assertEqual(body["metrics"]["completed"]["goal_count"], 1)

        monthly_goals = [g for group in body["groups"] for g in group["goals"]]
        rolled = [g for g in monthly_goals if g["rolls_into_month"]]
        self.assertEqual(len(rolled), 2)
        self.assertTrue(all(g["period"] == "weekly" for g in rolled))
        read_row = next(g for g in rolled if g["display_name"] == "I Read")
        self.assertEqual(read_row["weeks_in_month"], weeks)
        self.assertEqual(Decimal(str(read_row["base_target_value"])), Decimal("100"))
        self.assertEqual(Decimal(str(read_row["target_value"])), Decimal("100") * weeks)
        self.assertIn("weekly_progress", read_row)

        weekly = self.client.get("/api/v1/goals/group-summary/?period=weekly")
        self.assertEqual(weekly.status_code, 200)
        week_body = weekly.json()
        self.assertFalse(week_body["includes_weekly_rolled_in"])
        self.assertEqual(week_body["counts"]["total"], 2)
        self.assertEqual(week_body["metrics"]["stay_under"]["goal_count"], 0)
        # Weekly view is NOT scaled
        week_goals = [g for group in week_body["groups"] for g in group["goals"]]
        read_week = next(g for g in week_goals if g["display_name"] == "I Read")
        self.assertEqual(Decimal(str(read_week["target_value"])), Decimal("100"))
        self.assertIsNone(read_week.get("weeks_in_month"))

    def test_weekly_to_monthly_scaling_july_2026(self):
        """$45/week × 4 Mondays in July 2026 = $180; month current uses Jul entries."""
        from goals.services import compute_group_goal_summary, count_week_starts_in_month

        self.assertEqual(count_week_starts_in_month(2026, 7), 4)
        self.assertEqual(count_week_starts_in_month(2026, 3), 5)  # 5 Mondays in Mar 2026
        self.assertEqual(count_week_starts_in_month(2024, 2), 4)  # leap Feb

        gas = TrackingCategory.objects.get(user=self.user, name="Car Gas")
        Goal.objects.create(
            user=self.user,
            category=gas,
            period=Goal.PERIOD_WEEKLY,
            direction=Goal.DIRECTION_MAX,
            target_value=Decimal("45"),
            warn_at_percent=80,
        )
        Entry.objects.create(
            user=self.user,
            category=gas,
            date=date(2026, 7, 1),
            amount=Decimal("90.00"),
        )
        summary = compute_group_goal_summary(
            self.user, period="monthly", reference_date=date(2026, 7, 15)
        )
        self.assertEqual(summary["weeks_in_month"], 4)
        goals = [g for group in summary["groups"] for g in group["goals"]]
        gas_goal = next(g for g in goals if g["display_name"] == "Car Gas")
        self.assertTrue(gas_goal["rolls_into_month"])
        self.assertEqual(gas_goal["weeks_in_month"], 4)
        self.assertEqual(gas_goal["base_target_value"], Decimal("45"))
        self.assertEqual(gas_goal["target_value"], Decimal("180"))
        self.assertEqual(gas_goal["current_value"], Decimal("90.00"))
        self.assertEqual(gas_goal["percent_used"], 50.0)
        self.assertEqual(gas_goal["health"], "healthy")
        self.assertEqual(gas_goal["period_start"], date(2026, 7, 1))
        self.assertEqual(gas_goal["period_end"], date(2026, 7, 31))
        # Native week still $0 (Jul 13–19 window has no entry)
        self.assertEqual(gas_goal["weekly_progress"]["current_value"], Decimal("0"))
        self.assertEqual(
            summary["metrics_by_period"]["monthly"]["stay_under"]["target_total"],
            Decimal("180"),
        )
        self.assertEqual(
            summary["metrics_by_period"]["monthly"]["stay_under"]["current_total"],
            Decimal("90.00"),
        )
