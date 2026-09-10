from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from categories.models import TrackingCategory
from goals.models import Goal, GoalTemplate
from goals.template_catalog import seed_goal_templates


class OnboardingTests(TestCase):
    def setUp(self):
        seed_goal_templates()
        self.user = User.objects.create_user(
            username="onboard",
            email="onboard@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_list_templates_grouped(self):
        resp = self.client.get("/api/v1/onboarding/templates/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertGreaterEqual(len(data["templates"]), 5)
        self.assertIn("finance", data["by_group"])
        self.assertIn("fitness", data["by_group"])

    def test_apply_templates_creates_goals_and_categories(self):
        resp = self.client.post(
            "/api/v1/onboarding/apply/",
            {
                "templates": [
                    {"slug": "drinks-monthly-max", "target_value": "75.00"},
                    {"slug": "pushups-weekly-min"},
                ],
                "mark_complete": True,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["created_goal_count"], 2)
        self.assertTrue(
            TrackingCategory.objects.filter(user=self.user, name="Drinks").exists()
        )
        drinks_goal = Goal.objects.get(
            user=self.user,
            category__name="Drinks",
            period=Goal.PERIOD_MONTHLY,
        )
        self.assertEqual(drinks_goal.target_value, Decimal("75.00"))
        self.assertTrue(resp.json()["onboarding"]["onboarding_completed"])

    def test_apply_updates_existing_goal_target(self):
        self.client.post(
            "/api/v1/onboarding/apply/",
            {"templates": [{"slug": "gas-monthly-max"}]},
            format="json",
        )
        resp = self.client.post(
            "/api/v1/onboarding/apply/",
            {"templates": [{"slug": "gas-monthly-max", "target_value": "250.00"}]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["updated_goal_count"], 1)
        goal = Goal.objects.get(user=self.user, category__name="Gas")
        self.assertEqual(goal.target_value, Decimal("250.00"))

    def test_onboarding_status_endpoint(self):
        resp = self.client.get("/api/v1/onboarding/status/")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.json()["onboarding_completed"])
        self.assertGreater(resp.json()["available_template_count"], 0)
        self.assertEqual(resp.json()["tracking_mode"], "solo")
        self.assertIsNone(resp.json()["partnership"])

    def test_movement_templates_create_minutes_and_miles_categories(self):
        resp = self.client.post(
            "/api/v1/onboarding/apply/",
            {
                "templates": [
                    {"slug": "running-minutes-weekly", "target_value": "30", "period": "daily"},
                    {"slug": "running-miles-weekly", "target_value": "5"},
                    {"slug": "biking-minutes-weekly"},
                    {"slug": "biking-miles-weekly", "target_value": "8", "period": "weekly"},
                ]
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        run_time = TrackingCategory.objects.get(user=self.user, name="Running time")
        run_dist = TrackingCategory.objects.get(user=self.user, name="Running distance")
        bike_time = TrackingCategory.objects.get(user=self.user, name="Biking time")
        bike_dist = TrackingCategory.objects.get(user=self.user, name="Biking distance")
        self.assertEqual(run_time.unit, "minutes")
        self.assertEqual(run_time.metric_kind, TrackingCategory.METRIC_QUANTITY)
        self.assertEqual(run_dist.unit, "miles")
        self.assertEqual(bike_time.unit, "minutes")
        self.assertEqual(bike_dist.unit, "miles")
        run_goal = Goal.objects.get(user=self.user, category=run_time, is_active=True)
        self.assertEqual(run_goal.period, Goal.PERIOD_DAILY)
        self.assertEqual(run_goal.target_value, Decimal("30"))
        self.assertEqual(
            Goal.objects.get(user=self.user, category=run_dist).target_value,
            Decimal("5"),
        )
        self.assertEqual(
            Goal.objects.get(user=self.user, category=bike_dist).target_value,
            Decimal("8"),
        )

    def test_templates_include_category_unit(self):
        resp = self.client.get("/api/v1/onboarding/templates/")
        self.assertEqual(resp.status_code, 200)
        by_slug = {item["slug"]: item for item in resp.json()["templates"]}
        self.assertEqual(by_slug["running-minutes-weekly"]["category_unit"], "minutes")
        self.assertEqual(by_slug["running-miles-weekly"]["category_unit"], "miles")
        self.assertEqual(by_slug["biking-minutes-weekly"]["category_unit"], "minutes")
        self.assertEqual(by_slug["workouts-weekly-min"]["category_unit"], "sessions")

