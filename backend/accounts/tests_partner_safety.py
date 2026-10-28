from datetime import date
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.memberships import ensure_user_membership, membership_status
from accounts.models import ContentReport, User
from accounts.partnerships import accept_invite_code, ensure_partnership, get_partner_user
from entries.models import NightCap
from entries.recaps import build_month_recap, viewer_can_see_nightcap


class PartnerBlockTests(TestCase):
    def setUp(self):
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
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)
        partnership = ensure_partnership(self.owner)
        accept_invite_code(self.partner, partnership.invite_code)

    def test_block_unlinks_and_refuses_a_later_join(self):
        resp = self.client.post("/api/v1/partnership/block/")
        self.assertEqual(resp.status_code, 200, resp.content)
        owner = User.objects.get(pk=self.owner.pk)
        partner = User.objects.get(pk=self.partner.pk)
        self.assertIsNone(get_partner_user(owner))
        self.client.force_authenticate(user=owner)

        code = ensure_partnership(partner).invite_code
        again = self.client.post(
            "/api/v1/partnership/join/",
            {"invite_code": code},
            format="json",
        )
        self.assertEqual(again.status_code, 400, again.content)
        self.assertIn("can't join", str(again.json()))

        self.client.force_authenticate(user=partner)
        owner_code = ensure_partnership(owner).invite_code
        reverse = self.client.post(
            "/api/v1/partnership/join/",
            {"invite_code": owner_code},
            format="json",
        )
        self.assertEqual(reverse.status_code, 400, reverse.content)

    def test_invite_email_is_refused_after_a_block(self):
        self.client.post("/api/v1/partnership/block/")
        self.client.force_authenticate(user=self.partner)
        resp = self.client.post(
            "/api/v1/partnership/invite/",
            {"email": "owner@example.com"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertIn("can't invite", str(resp.json()))


class ContentReportTests(TestCase):
    def setUp(self):
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
        self.client = APIClient()
        partnership = ensure_partnership(self.owner)
        accept_invite_code(self.partner, partnership.invite_code)
        self.moment = NightCap.objects.create(
            user=self.partner,
            date=date.today(),
            favorite_moment="Sunset on the walk home.",
            status=NightCap.STATUS_COMPLETED,
        )

    def test_report_hides_the_moment_from_the_reporter_only(self):
        self.client.force_authenticate(user=self.owner)
        resp = self.client.post(
            "/api/v1/partnership/report/",
            {"nightcap_uuid": str(self.moment.uuid)},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(ContentReport.objects.count(), 1)
        self.assertFalse(viewer_can_see_nightcap(self.owner, self.moment))
        self.assertTrue(viewer_can_see_nightcap(self.partner, self.moment))

        today = date.today()
        owner_recap = build_month_recap(self.owner, today.year, today.month)
        partner_recap = build_month_recap(self.partner, today.year, today.month)
        owner_text = str(owner_recap["slides"])
        partner_text = str(partner_recap["slides"])
        self.assertNotIn("Sunset on the walk home.", owner_text)
        self.assertIn("Sunset on the walk home.", partner_text)

    def test_report_without_a_moment_hides_every_shared_night(self):
        self.client.force_authenticate(user=self.owner)
        resp = self.client.post("/api/v1/partnership/report/", {}, format="json")
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertFalse(viewer_can_see_nightcap(self.owner, self.moment))


class ReviewDemoAccountTests(TestCase):
    def test_demo4_trial_has_ended(self):
        call_command("create_review_demos", password="reviewpass1", stdout=StringIO())
        demo4 = User.objects.get(username="demo4")
        self.assertTrue(demo4.email_verified)
        self.assertIsNotNone(demo4.profile.onboarding_completed_at)
        membership = ensure_user_membership(demo4)
        self.assertEqual(membership_status(membership), "expired")
        demo1 = ensure_user_membership(User.objects.get(username="demo1"))
        self.assertEqual(membership_status(demo1), "complimentary")
