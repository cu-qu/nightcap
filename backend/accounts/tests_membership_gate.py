from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Membership, User
from core.permissions import MEMBERSHIP_ENDED_DETAIL


def expire_membership(user):
    Membership.objects.filter(user=user).update(
        trial_started_at=timezone.now() - timedelta(days=40),
        trial_ends_at=timezone.now() - timedelta(days=10),
        complimentary=False,
        store_expires_at=None,
    )


class MembershipGateTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="gateuser",
            email="gate@example.com",
            password="testpass123",
        )
        self.client.force_authenticate(user=self.user)

    def test_trial_user_can_get_calendar(self):
        resp = self.client.get("/api/v1/calendar/")
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_expired_membership_is_forbidden_on_product_api(self):
        expire_membership(self.user)
        resp = self.client.get("/api/v1/calendar/")
        self.assertEqual(resp.status_code, 403, resp.content)
        self.assertEqual(resp.json()["detail"], MEMBERSHIP_ENDED_DETAIL)

    def test_expired_user_can_read_me_and_billing(self):
        expire_membership(self.user)

        me = self.client.get("/api/v1/auth/me/")
        self.assertEqual(me.status_code, 200, me.content)
        self.assertFalse(me.json()["membership"]["is_active"])

        billing = self.client.get("/api/v1/billing/")
        self.assertEqual(billing.status_code, 200, billing.content)
        self.assertFalse(billing.json()["membership"]["is_active"])

    def test_expired_user_can_get_partnership_but_not_create(self):
        expire_membership(self.user)

        get_resp = self.client.get("/api/v1/partnership/")
        self.assertEqual(get_resp.status_code, 200, get_resp.content)
        self.assertIsNone(get_resp.json()["partnership"])

        post_resp = self.client.post("/api/v1/partnership/")
        self.assertEqual(post_resp.status_code, 403, post_resp.content)

    def test_expired_user_can_delete_account(self):
        expire_membership(self.user)
        user_id = self.user.id
        resp = self.client.delete("/api/v1/auth/account/")
        self.assertEqual(resp.status_code, 204)
        user = User.objects.get(pk=user_id)
        self.assertTrue(user.is_deleted)
        self.assertFalse(user.is_active)
