from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Partnership, PartnershipMember, User, UserProfile
from accounts.partnerships import accept_invite_code, ensure_partnership
from categories.defaults import create_default_categories_for_user
from categories.models import TrackingCategory
from entries.models import Entry
from goals.models import Goal
from goals.template_catalog import seed_goal_templates


def accept_pending_together(user):
    Goal.objects.filter(
        user=user,
        is_active=True,
        scope=Goal.SCOPE_SHARED,
        accepted=False,
    ).update(accepted=True)


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

    def test_logged_in_user_joins_with_invite_code(self):
        partnership = ensure_partnership(self.owner)
        partner = User.objects.create_user(
            username="joiner",
            email="joiner@example.com",
            password="testpass123",
        )
        create_default_categories_for_user(partner)
        partner_client = APIClient()
        partner_client.force_authenticate(user=partner)
        resp = partner_client.post(
            "/api/v1/partnership/join/",
            {"invite_code": partnership.invite_code},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()["partnership"]
        self.assertTrue(data["is_full"])
        self.assertEqual(len(data["members"]), 2)
        partner.refresh_from_db()
        self.assertEqual(partner.partnership_membership.partnership_id, partnership.id)
        self.assertEqual(partner.profile.tracking_mode, UserProfile.MODE_COUPLE)

    def test_join_abandons_empty_own_partnership(self):
        owner_space = ensure_partnership(self.owner)
        partner = User.objects.create_user(
            username="switcher",
            email="switcher@example.com",
            password="testpass123",
        )
        create_default_categories_for_user(partner)
        leftover = ensure_partnership(partner)
        leftover_id = leftover.id
        partner_client = APIClient()
        partner_client.force_authenticate(user=partner)
        resp = partner_client.post(
            "/api/v1/partnership/join/",
            {"invite_code": owner_space.invite_code},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        partner.refresh_from_db()
        self.assertEqual(partner.partnership_membership.partnership_id, owner_space.id)
        self.assertFalse(
            PartnershipMember.objects.filter(partnership_id=leftover_id).exists()
        )
        self.assertFalse(Partnership.objects.filter(id=leftover_id).exists())

    def test_join_normalizes_dashed_lowercase_code(self):
        partnership = ensure_partnership(self.owner)
        partner = User.objects.create_user(
            username="spaced",
            email="spaced@example.com",
            password="testpass123",
        )
        create_default_categories_for_user(partner)
        partner_client = APIClient()
        partner_client.force_authenticate(user=partner)
        spaced = f"{partnership.invite_code[:3]}-{partnership.invite_code[3:]}".lower()
        resp = partner_client.post(
            "/api/v1/partnership/join/",
            {"invite_code": spaced},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertTrue(resp.json()["partnership"]["is_full"])

    def test_join_invalid_code_rejected(self):
        partner = User.objects.create_user(
            username="badcode",
            email="badcode@example.com",
            password="testpass123",
        )
        create_default_categories_for_user(partner)
        partner_client = APIClient()
        partner_client.force_authenticate(user=partner)
        resp = partner_client.post(
            "/api/v1/partnership/join/",
            {"invite_code": "ZZZZZZ"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_join_rejected_when_already_paired(self):
        first = ensure_partnership(self.owner)
        partner = User.objects.create_user(
            username="taken",
            email="taken@example.com",
            password="testpass123",
        )
        create_default_categories_for_user(partner)
        accept_invite_code(partner, first.invite_code)
        other_owner = User.objects.create_user(
            username="otherowner",
            email="otherowner@example.com",
            password="testpass123",
        )
        other_space = ensure_partnership(other_owner)
        partner_client = APIClient()
        partner_client.force_authenticate(user=partner)
        resp = partner_client.post(
            "/api/v1/partnership/join/",
            {"invite_code": other_space.invite_code},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("already connected", str(resp.json()))


class PartnershipLeaveTests(TestCase):
    def setUp(self):
        seed_goal_templates()
        self.client = APIClient()
        self.owner = User.objects.create_user(
            username="owner",
            email="owner@example.com",
            password="testpass123",
        )
        self.partner = User.objects.create_user(
            username="sam",
            email="sam@example.com",
            password="testpass123",
        )
        create_default_categories_for_user(self.owner)
        create_default_categories_for_user(self.partner)
        self.client.force_authenticate(user=self.owner)

    def _link(self, accept_together=True):
        setup = self.client.post(
            "/api/v1/onboarding/setup/",
            {
                "mode": "couple",
                "templates": [{"slug": "groceries-monthly-max", "scope": "shared"}],
            },
            format="json",
        )
        self.assertEqual(setup.status_code, 200, setup.content)
        code = setup.json()["partnership"]["invite_code"]
        partner_client = APIClient()
        partner_client.force_authenticate(user=self.partner)
        join = partner_client.post(
            "/api/v1/partnership/join/",
            {"invite_code": code},
            format="json",
        )
        self.assertEqual(join.status_code, 200, join.content)
        if accept_together:
            accept_pending_together(self.partner)
        return partner_client, code

    def test_leave_unlinks_caller_and_keeps_partner_waiting(self):
        partner_client, old_code = self._link()
        partnership_id = self.owner.partnership_membership.partnership_id

        resp = self.client.post("/api/v1/partnership/leave/")
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIsNone(resp.json()["partnership"])

        self.owner.refresh_from_db()
        self.partner.refresh_from_db()
        self.owner.profile.refresh_from_db()
        self.partner.profile.refresh_from_db()
        self.assertFalse(PartnershipMember.objects.filter(user=self.owner).exists())
        self.assertEqual(self.owner.profile.tracking_mode, UserProfile.MODE_SOLO)

        remaining = Partnership.objects.get(id=partnership_id)
        self.assertEqual(remaining.members.count(), 1)
        self.assertEqual(remaining.members.get().user_id, self.partner.id)
        self.assertEqual(remaining.members.get().role, PartnershipMember.ROLE_OWNER)
        self.assertNotEqual(remaining.invite_code, old_code)
        self.assertEqual(self.partner.profile.tracking_mode, UserProfile.MODE_COUPLE)

        rejoin = self.client.post(
            "/api/v1/partnership/join/",
            {"invite_code": old_code},
            format="json",
        )
        self.assertEqual(rejoin.status_code, 400)

        waiting = partner_client.get("/api/v1/partnership/")
        self.assertEqual(waiting.status_code, 200)
        data = waiting.json()["partnership"]
        self.assertFalse(data["is_full"])
        self.assertEqual(len(data["members"]), 1)

    def test_leave_turns_together_goals_personal(self):
        self._link()
        resp = self.client.post("/api/v1/partnership/leave/")
        self.assertEqual(resp.status_code, 200, resp.content)

        owner_goal = Goal.objects.get(
            user=self.owner, category__name="Groceries", is_active=True
        )
        partner_goal = Goal.objects.get(
            user=self.partner, category__name="Groceries", is_active=True
        )
        self.assertEqual(owner_goal.scope, Goal.SCOPE_PERSONAL)
        self.assertIsNone(owner_goal.partnership_id)
        self.assertEqual(partner_goal.scope, Goal.SCOPE_PERSONAL)
        self.assertIsNone(partner_goal.partnership_id)

    def test_leave_deactivates_unaccepted_together_copies(self):
        self._link(accept_together=False)
        pending = Goal.objects.get(
            user=self.partner,
            category__name="Groceries",
            scope=Goal.SCOPE_SHARED,
            is_active=True,
        )
        self.assertFalse(pending.accepted)

        resp = self.client.post("/api/v1/partnership/leave/")
        self.assertEqual(resp.status_code, 200, resp.content)

        pending.refresh_from_db()
        self.assertFalse(pending.is_active)
        self.assertIsNone(pending.partnership_id)

        owner_goal = Goal.objects.get(
            user=self.owner, category__name="Groceries", is_active=True
        )
        self.assertEqual(owner_goal.scope, Goal.SCOPE_PERSONAL)

    def test_leave_unpaired_couple_space(self):
        ensure_partnership(self.owner)
        resp = self.client.post("/api/v1/partnership/leave/")
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIsNone(resp.json()["partnership"])
        self.assertFalse(PartnershipMember.objects.filter(user=self.owner).exists())
        self.assertFalse(Partnership.objects.filter(members__user=self.owner).exists())
        self.owner.profile.refresh_from_db()
        self.assertEqual(self.owner.profile.tracking_mode, UserProfile.MODE_SOLO)

    def test_leave_without_partnership_rejected(self):
        resp = self.client.post("/api/v1/partnership/leave/")
        self.assertEqual(resp.status_code, 400)

    def test_leave_allows_joining_a_new_partner(self):
        self._link()
        self.client.post("/api/v1/partnership/leave/")

        other = User.objects.create_user(
            username="other",
            email="other@example.com",
            password="testpass123",
        )
        create_default_categories_for_user(other)
        other_space = ensure_partnership(other)
        join = self.client.post(
            "/api/v1/partnership/join/",
            {"invite_code": other_space.invite_code},
            format="json",
        )
        self.assertEqual(join.status_code, 200, join.content)
        self.assertTrue(join.json()["partnership"]["is_full"])


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
        pending = Goal.objects.get(
            user=partner,
            category__name="Groceries",
            scope=Goal.SCOPE_SHARED,
            is_active=True,
        )
        self.assertFalse(pending.accepted)
        status = partner_client.get("/api/v1/onboarding/status/")
        self.assertEqual(status.status_code, 200)
        together = status.json()["together_goals"]
        self.assertEqual(len(together), 1)
        self.assertEqual(together[0]["category_name"], "Groceries")
        self.assertFalse(together[0]["accepted"])
        setup_partner = partner_client.post(
            "/api/v1/onboarding/setup/",
            {
                "mode": "couple",
                "templates": [],
                "approve_together": [together[0]["uuid"]],
            },
            format="json",
        )
        self.assertEqual(setup_partner.status_code, 200, setup_partner.content)
        pending.refresh_from_db()
        self.assertTrue(pending.accepted)


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
        accept_pending_together(self.b)

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

    def test_ritual_shared_shows_partner_entry(self):
        setup = self.client.post(
            "/api/v1/onboarding/setup/",
            {
                "mode": "couple",
                "templates": [
                    {"slug": "groceries-monthly-max", "scope": "shared"},
                    {"slug": "workouts-weekly-min", "scope": "personal"},
                ],
            },
            format="json",
        )
        code = setup.json()["partnership"]["invite_code"]
        partner_client = APIClient()
        partner_client.force_authenticate(user=self.b)
        partner_client.post("/api/v1/partnership/join/", {"invite_code": code}, format="json")
        accept_pending_together(self.b)

        cat_a = TrackingCategory.objects.get(user=self.a, name="Groceries")
        cat_b = TrackingCategory.objects.get(user=self.b, name="Groceries")
        today = timezone.localdate()
        Entry.objects.create(user=self.b, category=cat_b, date=today, amount=Decimal("40.00"))

        resp = self.client.get(f"/api/v1/ritual/shared/?date={today.isoformat()}")
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertEqual(data["partner_username"], "sam")
        self.assertIn(str(cat_a.uuid), data["shared_category_uuids"])
        self.assertEqual(len(data["entries"]), 1)
        groc = data["entries"][0]
        self.assertEqual(groc["category_uuid"], str(cat_a.uuid))
        self.assertEqual(groc["partner_username"], "sam")
        self.assertEqual(Decimal(str(groc["amount"])), Decimal("40.00"))
        self.assertEqual(groc["completed_with"], Entry.COMPLETED_ALONE)
        workout_a = TrackingCategory.objects.get(user=self.a, name="Workout")
        self.assertNotIn(str(workout_a.uuid), data["shared_category_uuids"])

    def _join_as_couple(self, templates):
        setup = self.client.post(
            "/api/v1/onboarding/setup/",
            {"mode": "couple", "templates": templates},
            format="json",
        )
        self.assertEqual(setup.status_code, 200, setup.content)
        code = setup.json()["partnership"]["invite_code"]
        partner_client = APIClient()
        partner_client.force_authenticate(user=self.b)
        join = partner_client.post(
            "/api/v1/partnership/join/",
            {"invite_code": code},
            format="json",
        )
        self.assertEqual(join.status_code, 200, join.content)
        accept_pending_together(self.b)
        return partner_client

    def test_shared_workout_dedupes_when_both_with_partner(self):
        self._join_as_couple(
            [{"slug": "workouts-weekly-min", "scope": "shared"}]
        )
        cat_a = TrackingCategory.objects.get(user=self.a, name="Workout")
        cat_b = TrackingCategory.objects.get(user=self.b, name="Workout")
        today = timezone.localdate()
        Entry.objects.create(
            user=self.a,
            category=cat_a,
            date=today,
            quantity=Decimal("1"),
            completed_with=Entry.COMPLETED_WITH_PARTNER,
        )
        Entry.objects.create(
            user=self.b,
            category=cat_b,
            date=today,
            quantity=Decimal("1"),
            completed_with=Entry.COMPLETED_WITH_PARTNER,
        )

        resp = self.client.get("/api/v1/goals/")
        rows = resp.json()["results"] if isinstance(resp.json(), dict) else resp.json()
        row = next(item for item in rows if item["category_detail"]["name"] == "Workout")
        self.assertEqual(row["scope"], "shared")
        self.assertEqual(Decimal(str(row["progress"]["current_value"])), Decimal("1"))

    def test_shared_workout_sums_when_either_is_alone(self):
        self._join_as_couple(
            [{"slug": "workouts-weekly-min", "scope": "shared"}]
        )
        cat_a = TrackingCategory.objects.get(user=self.a, name="Workout")
        cat_b = TrackingCategory.objects.get(user=self.b, name="Workout")
        today = timezone.localdate()
        Entry.objects.create(
            user=self.a,
            category=cat_a,
            date=today,
            quantity=Decimal("1"),
            completed_with=Entry.COMPLETED_WITH_PARTNER,
        )
        Entry.objects.create(
            user=self.b,
            category=cat_b,
            date=today,
            quantity=Decimal("1"),
            completed_with=Entry.COMPLETED_ALONE,
        )

        resp = self.client.get("/api/v1/goals/")
        rows = resp.json()["results"] if isinstance(resp.json(), dict) else resp.json()
        row = next(item for item in rows if item["category_detail"]["name"] == "Workout")
        self.assertEqual(Decimal(str(row["progress"]["current_value"])), Decimal("2"))

    def test_shared_progress_counts_unpaired_with_partner(self):
        self._join_as_couple(
            [{"slug": "workouts-weekly-min", "scope": "shared"}]
        )
        cat_a = TrackingCategory.objects.get(user=self.a, name="Workout")
        today = timezone.localdate()
        Entry.objects.create(
            user=self.a,
            category=cat_a,
            date=today,
            quantity=Decimal("1"),
            completed_with=Entry.COMPLETED_WITH_PARTNER,
        )

        resp = self.client.get("/api/v1/goals/")
        rows = resp.json()["results"] if isinstance(resp.json(), dict) else resp.json()
        row = next(item for item in rows if item["category_detail"]["name"] == "Workout")
        self.assertEqual(Decimal(str(row["progress"]["current_value"])), Decimal("1"))

    def test_personal_goal_counts_own_with_partner_entry(self):
        self._join_as_couple(
            [{"slug": "workouts-weekly-min", "scope": "personal"}]
        )
        cat_a = TrackingCategory.objects.get(user=self.a, name="Workout")
        cat_b = TrackingCategory.objects.get(user=self.b, name="Workout")
        today = timezone.localdate()
        Entry.objects.create(
            user=self.a,
            category=cat_a,
            date=today,
            quantity=Decimal("1"),
            completed_with=Entry.COMPLETED_WITH_PARTNER,
        )
        Entry.objects.create(
            user=self.b,
            category=cat_b,
            date=today,
            quantity=Decimal("1"),
            completed_with=Entry.COMPLETED_WITH_PARTNER,
        )

        resp = self.client.get("/api/v1/goals/")
        rows = resp.json()["results"] if isinstance(resp.json(), dict) else resp.json()
        row = next(item for item in rows if item["category_detail"]["name"] == "Workout")
        self.assertEqual(row["scope"], "personal")
        self.assertEqual(Decimal(str(row["progress"]["current_value"])), Decimal("1"))

    def test_shared_workout_mixed_days_together_then_alone(self):
        self._join_as_couple(
            [{"slug": "workouts-weekly-min", "scope": "shared"}]
        )
        cat_a = TrackingCategory.objects.get(user=self.a, name="Workout")
        cat_b = TrackingCategory.objects.get(user=self.b, name="Workout")
        today = timezone.localdate()
        monday = today - timedelta(days=today.weekday())
        together = monday
        alone = monday + timedelta(days=1)
        Entry.objects.create(
            user=self.a,
            category=cat_a,
            date=together,
            quantity=Decimal("1"),
            completed_with=Entry.COMPLETED_WITH_PARTNER,
        )
        Entry.objects.create(
            user=self.b,
            category=cat_b,
            date=together,
            quantity=Decimal("1"),
            completed_with=Entry.COMPLETED_WITH_PARTNER,
        )
        Entry.objects.create(
            user=self.a,
            category=cat_a,
            date=alone,
            quantity=Decimal("1"),
            completed_with=Entry.COMPLETED_ALONE,
        )
        Entry.objects.create(
            user=self.b,
            category=cat_b,
            date=alone,
            quantity=Decimal("1"),
            completed_with=Entry.COMPLETED_ALONE,
        )

        resp = self.client.get("/api/v1/goals/")
        rows = resp.json()["results"] if isinstance(resp.json(), dict) else resp.json()
        row = next(item for item in rows if item["category_detail"]["name"] == "Workout")
        self.assertEqual(Decimal(str(row["progress"]["current_value"])), Decimal("3"))

    def test_shared_spend_always_sums_both_partners(self):
        self._join_as_couple(
            [{"slug": "groceries-monthly-max", "scope": "shared"}]
        )
        cat_a = TrackingCategory.objects.get(user=self.a, name="Groceries")
        cat_b = TrackingCategory.objects.get(user=self.b, name="Groceries")
        today = timezone.localdate()
        Entry.objects.create(
            user=self.a,
            category=cat_a,
            date=today,
            amount=Decimal("40.00"),
            completed_with=Entry.COMPLETED_WITH_PARTNER,
        )
        Entry.objects.create(
            user=self.b,
            category=cat_b,
            date=today,
            amount=Decimal("40.00"),
            completed_with=Entry.COMPLETED_WITH_PARTNER,
        )

        resp = self.client.get("/api/v1/goals/")
        rows = resp.json()["results"] if isinstance(resp.json(), dict) else resp.json()
        row = next(item for item in rows if item["category_detail"]["name"] == "Groceries")
        self.assertEqual(Decimal(str(row["progress"]["current_value"])), Decimal("80.00"))
