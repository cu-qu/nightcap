from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import DevicePushToken, PartnerNudge, User
from accounts.partnerships import accept_invite_code, ensure_partnership
from categories.defaults import create_default_categories_for_user
from entries.models import NightCap
from goals.template_catalog import seed_goal_templates


class PartnerNudgeTests(TestCase):
    def setUp(self):
        seed_goal_templates()
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
        partnership = ensure_partnership(self.owner)
        accept_invite_code(self.partner, partnership.invite_code)
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)
        self.partner_client = APIClient()
        self.partner_client.force_authenticate(user=self.partner)
        self.today = timezone.localdate()

    @patch("accounts.nudges._send_expo_push", return_value=False)
    @patch("accounts.emails.PartnerNudgeEmail.send")
    def test_nudge_sends_email_and_records(self, mock_send, _mock_push):
        resp = self.client.post(
            "/api/v1/partnership/nudge/",
            {"date": self.today.isoformat()},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        data = resp.json()["nudge"]
        self.assertEqual(data["to_username"], "sam")
        self.assertEqual(data["date"], self.today.isoformat())
        self.assertFalse(data["already_sent"])
        self.assertIn("email", data["delivered_via"])
        mock_send.assert_called_once()
        self.assertEqual(PartnerNudge.objects.count(), 1)

    @patch("accounts.nudges._send_expo_push", return_value=False)
    @patch("accounts.emails.PartnerNudgeEmail.send")
    def test_nudge_is_idempotent(self, mock_send, _mock_push):
        first = self.client.post(
            "/api/v1/partnership/nudge/",
            {"date": self.today.isoformat()},
            format="json",
        )
        self.assertEqual(first.status_code, 201, first.content)
        second = self.client.post(
            "/api/v1/partnership/nudge/",
            {"date": self.today.isoformat()},
            format="json",
        )
        self.assertEqual(second.status_code, 200, second.content)
        self.assertTrue(second.json()["nudge"]["already_sent"])
        self.assertEqual(PartnerNudge.objects.count(), 1)
        self.assertEqual(mock_send.call_count, 1)

    def test_nudge_rejected_when_partner_already_logged(self):
        NightCap.objects.create(
            user=self.partner,
            date=self.today,
            status=NightCap.STATUS_COMPLETED,
        )
        resp = self.client.post(
            "/api/v1/partnership/nudge/",
            {"date": self.today.isoformat()},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("already NightCap", resp.json()["detail"])

    def test_nudge_rejected_for_future_date(self):
        future = self.today + timedelta(days=1)
        resp = self.client.post(
            "/api/v1/partnership/nudge/",
            {"date": future.isoformat()},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_nudge_requires_partner(self):
        solo = User.objects.create_user(
            username="solo",
            email="solo@example.com",
            password="testpass123",
        )
        create_default_categories_for_user(solo)
        client = APIClient()
        client.force_authenticate(user=solo)
        resp = client.post(
            "/api/v1/partnership/nudge/",
            {"date": self.today.isoformat()},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    @patch("accounts.nudges._send_expo_push", return_value=True)
    @patch("accounts.emails.PartnerNudgeEmail.send")
    def test_nudge_uses_push_token_when_registered(self, mock_send, mock_push):
        DevicePushToken.objects.create(
            user=self.partner,
            token="ExponentPushToken[aaaaaaaaaaaaaaaa]",
            platform="ios",
        )
        resp = self.client.post(
            "/api/v1/partnership/nudge/",
            {"date": self.today.isoformat()},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertIn("push", resp.json()["nudge"]["delivered_via"])
        self.assertNotIn("email", resp.json()["nudge"]["delivered_via"])
        mock_push.assert_called_once()
        mock_send.assert_not_called()
        self.assertEqual(mock_push.call_args.kwargs["title"], "owner nudged you 🌙")
        self.assertIn("NightCap", mock_push.call_args.kwargs["body"])

    def test_calendar_includes_partner_and_nudge_state(self):
        NightCap.objects.create(
            user=self.owner,
            date=self.today,
            status=NightCap.STATUS_COMPLETED,
        )
        with patch("accounts.emails.PartnerNudgeEmail.send"), patch(
            "accounts.nudges._send_expo_push", return_value=False
        ):
            self.client.post(
                "/api/v1/partnership/nudge/",
                {"date": self.today.isoformat()},
                format="json",
            )

        owner_cal = self.client.get(
            f"/api/v1/calendar/?year={self.today.year}&month={self.today.month}"
        )
        owner_day = next(
            d for d in owner_cal.json()["days"] if d["date"] == self.today.isoformat()
        )
        self.assertEqual(owner_day["partner"]["username"], "sam")
        self.assertFalse(owner_day["partner"]["has_nightcap"])
        self.assertIsNotNone(owner_day["partner"]["nudged_at"])
        self.assertIsNone(owner_day["partner"]["incoming_nudge_at"])

        partner_cal = self.partner_client.get(
            f"/api/v1/calendar/?year={self.today.year}&month={self.today.month}"
        )
        partner_day = next(
            d
            for d in partner_cal.json()["days"]
            if d["date"] == self.today.isoformat()
        )
        self.assertEqual(partner_day["partner"]["username"], "owner")
        self.assertTrue(partner_day["partner"]["has_nightcap"])
        self.assertIsNotNone(partner_day["partner"]["incoming_nudge_at"])

    def test_completing_ritual_clears_incoming_nudge(self):
        with patch("accounts.emails.PartnerNudgeEmail.send"), patch(
            "accounts.nudges._send_expo_push", return_value=False
        ):
            self.client.post(
                "/api/v1/partnership/nudge/",
                {"date": self.today.isoformat()},
                format="json",
            )
        spend = self.partner.tracking_categories.get(name="Groceries")
        resp = self.partner_client.post(
            "/api/v1/ritual/",
            {
                "date": self.today.isoformat(),
                "items": [
                    {"category_uuid": str(spend.uuid), "amount": "8.00"},
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        nudge = PartnerNudge.objects.get()
        self.assertIsNotNone(nudge.read_at)

        partner_cal = self.partner_client.get(
            f"/api/v1/calendar/?year={self.today.year}&month={self.today.month}"
        )
        partner_day = next(
            d
            for d in partner_cal.json()["days"]
            if d["date"] == self.today.isoformat()
        )
        self.assertIsNone(partner_day["partner"]["incoming_nudge_at"])
        owner_day = next(
            d
            for d in self.client.get(
                f"/api/v1/calendar/?year={self.today.year}&month={self.today.month}"
            ).json()["days"]
            if d["date"] == self.today.isoformat()
        )
        self.assertTrue(owner_day["partner"]["has_nightcap"])

    def test_register_and_remove_push_token(self):
        token = "ExponentPushToken[bbbbbbbbbbbbbbbb]"
        resp = self.client.post(
            "/api/v1/devices/push-token/",
            {"token": token, "platform": "ios"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertTrue(
            DevicePushToken.objects.filter(user=self.owner, token=token).exists()
        )
        moved = self.partner_client.post(
            "/api/v1/devices/push-token/",
            {"token": token, "platform": "ios"},
            format="json",
        )
        self.assertEqual(moved.status_code, 200, moved.content)
        self.assertEqual(DevicePushToken.objects.filter(token=token).count(), 1)
        self.assertEqual(
            DevicePushToken.objects.get(token=token).user_id, self.partner.id
        )
        removed = self.partner_client.delete(
            "/api/v1/devices/push-token/",
            {"token": token},
            format="json",
        )
        self.assertEqual(removed.status_code, 200, removed.content)
        self.assertFalse(DevicePushToken.objects.filter(token=token).exists())

    def test_solo_calendar_partner_is_null(self):
        solo = User.objects.create_user(
            username="solo2",
            email="solo2@example.com",
            password="testpass123",
        )
        create_default_categories_for_user(solo)
        client = APIClient()
        client.force_authenticate(user=solo)
        resp = client.get(
            f"/api/v1/calendar/?year={self.today.year}&month={self.today.month}"
        )
        self.assertEqual(resp.status_code, 200)
        day = next(
            d for d in resp.json()["days"] if d["date"] == self.today.isoformat()
        )
        self.assertIsNone(day["partner"])
