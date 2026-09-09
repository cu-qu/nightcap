from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import PartnershipMember, User, UserProfile
from accounts.partnerships import ensure_partnership
from categories.defaults import create_default_categories_for_user
from categories.models import TrackingCategory
from entries.models import Entry
from goals.models import Goal
from goals.template_catalog import seed_goal_templates
from django.utils import timezone


class PartnershipInviteTests(TestCase):
    def setUp(self):
        seed_goal_templates()
        self.client = APIClient()
        self.owner = User.objects.create_user(
            username="owner",
            email="owner@example.com",
            password="testpass123",
        )
        create_default_categories_for_user(self.owner)
        self.client.force_authenticate(user=self.owner)

    def test_create_partnership_returns_invite_code(self):
        resp = self.client.post("/api/v1/partnership/")
        self.assertEqual(resp.status_code, 201, resp.content)
        data = resp.json()["partnership"]
        self.assertEqual(len(data["invite_code"]), 6)
        self.assertFalse(data["is_full"])
        self.assertEqual(len(data["members"]), 1)

    @patch("accounts.emails.PartnerInviteEmail.send")
    def test_invite_email_sends(self, mock_send):
        resp = self.client.post(
            "/api/v1/partnership/invite/",
            {"email": "partner@example.com"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        mock_send.assert_called_once()
        self.assertTrue(resp.json()["email_sent"])
        self.assertEqual(resp.json()["partnership"]["pending_email"], "partner@example.com")

    def test_register_with_invite_code_joins(self):
        partnership = ensure_partnership(self.owner)
        self.client.force_authenticate(user=None)
        resp = self.client.post(
            "/api/v1/auth/register/",
            {
                "username": "partner",
                "email": "partner@example.com",
                "password": "longpassword1",
                "invite_code": partnership.invite_code,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        user = User.objects.get(username="partner")
        self.assertEqual(user.partnership_membership.partnership_id, partnership.id)
        self.assertEqual(user.profile.tracking_mode, UserProfile.MODE_COUPLE)
        self.assertEqual(PartnershipMember.objects.filter(partnership=partnership).count(), 2)

    def test_invalid_invite_code_rejected_on_register(self):
        self.client.force_authenticate(user=None)
        resp = self.client.post(
            "/api/v1/auth/register/",
            {
                "username": "nobody",
                "email": "nobody@example.com",
                "password": "longpassword1",
                "invite_code": "ZZZZZZ",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)


class CoupleOnboardingTests(TestCase):
    def setUp(self):
        seed_goal_templates()
        self.user = User.objects.create_user(
            username="coupleuser",
            email="couple@example.com",
            password="testpass123",
        )
        create_default_categories_for_user(self.user)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_setup_spending_limits_for_multiple_categories(self):
        resp = self.client.post(
            "/api/v1/onboarding/setup/",
            {
                "mode": "solo",
                "templates": [
                    {"slug": "groceries-monthly-max", "target_value": "350"},
                    {"slug": "gas-monthly-max", "target_value": "200"},
                    {"slug": "going-out-monthly-max", "target_value": "80"},
                    {"slug": "misc-monthly-max", "target_value": "50"},
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        groceries = Goal.objects.get(user=self.user, category__name="Groceries", is_active=True)
        gas = Goal.objects.get(user=self.user, category__name="Gas", is_active=True)
        going_out = Goal.objects.get(user=self.user, category__name="Going Out", is_active=True)
        misc = Goal.objects.get(user=self.user, category__name="Misc", is_active=True)
        self.assertEqual(groceries.target_value, Decimal("350"))
        self.assertEqual(gas.target_value, Decimal("200"))
        self.assertEqual(going_out.target_value, Decimal("80"))
        self.assertEqual(misc.target_value, Decimal("50"))
        self.assertEqual(groceries.period, Goal.PERIOD_MONTHLY)

    def test_setup_weekly_spend_cap(self):
        resp = self.client.post(
            "/api/v1/onboarding/setup/",
            {
                "mode": "solo",
                "templates": [
                    {
                        "slug": "groceries-monthly-max",
                        "target_value": "100",
                        "period": "weekly",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        groceries = Goal.objects.get(user=self.user, category__name="Groceries", is_active=True)
        self.assertEqual(groceries.period, Goal.PERIOD_WEEKLY)
        self.assertEqual(groceries.target_value, Decimal("100"))

    def test_setup_solo_marks_complete_and_personal_goals(self):
        resp = self.client.post(
            "/api/v1/onboarding/setup/",
            {
                "mode": "solo",
                "templates": [
                    {"slug": "groceries-monthly-max"},
                    {"slug": "workouts-weekly-min"},
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertTrue(resp.json()["onboarding"]["onboarding_completed"])
        self.assertEqual(resp.json()["onboarding"]["tracking_mode"], "solo")
        self.assertIsNone(resp.json()["partnership"])
        goal = Goal.objects.get(user=self.user, category__name="Groceries", is_active=True)
        self.assertEqual(goal.scope, Goal.SCOPE_PERSONAL)

    def test_setup_couple_creates_shared_goals_and_invite_code(self):
        resp = self.client.post(
            "/api/v1/onboarding/setup/",
            {
                "mode": "couple",
                "templates": [
                    {"slug": "groceries-monthly-max", "scope": "shared"},
                    {"slug": "workouts-weekly-min", "scope": "personal"},
                    {"slug": "quality-time-weekly-min", "scope": "shared"},
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.json()["onboarding"]["tracking_mode"], "couple")
        self.assertIsNotNone(resp.json()["partnership"])
        groceries = Goal.objects.get(user=self.user, category__name="Groceries", is_active=True)
        workouts = Goal.objects.get(user=self.user, category__name="Workout", is_active=True)
        self.assertEqual(groceries.scope, Goal.SCOPE_SHARED)
        self.assertEqual(workouts.scope, Goal.SCOPE_PERSONAL)

    def test_templates_filtered_by_mode(self):
        solo = self.client.get("/api/v1/onboarding/templates/?mode=solo")
        couple = self.client.get("/api/v1/onboarding/templates/?mode=couple")
        self.assertEqual(solo.status_code, 200)
        solo_slugs = {t["slug"] for t in solo.json()["templates"]}
        couple_slugs = {t["slug"] for t in couple.json()["templates"]}
        self.assertNotIn("date-night-monthly-max", solo_slugs)
        self.assertIn("date-night-monthly-max", couple_slugs)
        self.assertIn("groceries-monthly-max", solo_slugs)

    def test_partner_inherits_shared_goals(self):
        setup = self.client.post(
            "/api/v1/onboarding/setup/",
            {
                "mode": "couple",
                "templates": [{"slug": "groceries-monthly-max", "scope": "shared"}],
            },
            format="json",
        )
        code = setup.json()["partnership"]["invite_code"]
        partner = User.objects.create_user(
            username="joiner",
            email="joiner@example.com",
            password="testpass123",
        )
        create_default_categories_for_user(partner)
        partner_client = APIClient()
        partner_client.force_authenticate(user=partner)
        join = partner_client.post(
            "/api/v1/partnership/join/",
            {"invite_code": code},
            format="json",
        )
        self.assertEqual(join.status_code, 200, join.content)
        self.assertTrue(
            Goal.objects.filter(
                user=partner,
                category__name="Groceries",
                scope=Goal.SCOPE_SHARED,
                is_active=True,
            ).exists()
        )


class SharedGoalProgressTests(TestCase):
    def setUp(self):
        seed_goal_templates()
        self.a = User.objects.create_user(
            username="alex", email="alex@example.com", password="testpass123"
        )
        self.b = User.objects.create_user(
            username="sam", email="sam@example.com", password="testpass123"
        )
        create_default_categories_for_user(self.a)
        create_default_categories_for_user(self.b)
        self.client = APIClient()
        self.client.force_authenticate(user=self.a)

    def test_shared_progress_sums_both_partners(self):
        setup = self.client.post(
            "/api/v1/onboarding/setup/",
            {
                "mode": "couple",
                "templates": [{"slug": "groceries-monthly-max", "scope": "shared"}],
            },
            format="json",
        )
        code = setup.json()["partnership"]["invite_code"]
        partner_client = APIClient()
        partner_client.force_authenticate(user=self.b)
        partner_client.post("/api/v1/partnership/join/", {"invite_code": code}, format="json")

        cat_a = TrackingCategory.objects.get(user=self.a, name="Groceries")
        cat_b = TrackingCategory.objects.get(user=self.b, name="Groceries")
        today = timezone.localdate()
        Entry.objects.create(user=self.a, category=cat_a, date=today, amount=Decimal("40.00"))
        Entry.objects.create(user=self.b, category=cat_b, date=today, amount=Decimal("25.00"))

        resp = self.client.get("/api/v1/goals/")
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        rows = payload["results"] if isinstance(payload, dict) else payload
        row = next(item for item in rows if item["category_detail"]["name"] == "Groceries")
        self.assertEqual(row["scope"], "shared")
        self.assertEqual(Decimal(str(row["progress"]["current_value"])), Decimal("65.00"))
