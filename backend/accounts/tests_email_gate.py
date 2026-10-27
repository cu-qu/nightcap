from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from core.permissions import EMAIL_UNVERIFIED_DETAIL


@override_settings(EMAIL_VERIFICATION_REQUIRED=True)
class EmailVerificationGateTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="unverified",
            email="unverified@example.com",
            password="testpass123",
        )
        self.client.force_authenticate(user=self.user)

    def test_unverified_user_cannot_use_product_api(self):
        resp = self.client.get("/api/v1/calendar/")
        self.assertEqual(resp.status_code, 403, resp.content)
        self.assertEqual(resp.json()["detail"], EMAIL_UNVERIFIED_DETAIL)

    def test_unverified_user_can_read_profile_and_resend(self):
        me = self.client.get("/api/v1/auth/me/")
        self.assertEqual(me.status_code, 200, me.content)
        self.assertFalse(me.json()["email_verified"])

        with patch("accounts.services.VerifyAccountEmail.send"):
            resend = self.client.post("/api/v1/auth/verify-email/resend/")
        self.assertEqual(resend.status_code, 200, resend.content)

    def test_unverified_user_can_delete_account(self):
        user_id = self.user.id
        resp = self.client.delete("/api/v1/auth/account/")
        self.assertEqual(resp.status_code, 204)
        user = User.objects.get(pk=user_id)
        self.assertTrue(user.is_deleted)

    def test_verified_user_can_use_product_api(self):
        self.user.email_verified = True
        self.user.save(update_fields=["email_verified"])
        resp = self.client.get("/api/v1/calendar/")
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_staff_can_use_product_api_without_confirming(self):
        self.user.is_staff = True
        self.user.save(update_fields=["is_staff"])
        resp = self.client.get("/api/v1/calendar/")
        self.assertEqual(resp.status_code, 200, resp.content)
