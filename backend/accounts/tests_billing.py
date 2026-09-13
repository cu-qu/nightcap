from datetime import timedelta
from datetime import timezone as dt_timezone
from datetime import datetime

import jwt
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.iap import MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID
from accounts.memberships import grant_complimentary_membership, membership_status
from accounts.models import Membership, User
from accounts.partnerships import accept_invite_code, ensure_partnership


def apple_jws(**overrides) -> str:
    expires = datetime.now(dt_timezone.utc) + timedelta(days=30)
    payload = {
        "bundleId": "com.nightcap.app",
        "productId": YEARLY_PRODUCT_ID,
        "originalTransactionId": "1000000001",
        "transactionId": "1000000002",
        "expiresDate": int(expires.timestamp() * 1000),
        "type": "Auto-Renewable Subscription",
    }
    payload.update(overrides)
    return jwt.encode(payload, "test-secret", algorithm="HS256")


class MembershipTrialTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="trialuser",
            email="trial@example.com",
            password="testpass123",
        )
        self.client.force_authenticate(user=self.user)

    def test_signup_starts_month_trial(self):
        membership = Membership.objects.get(user=self.user)
        self.assertEqual(membership_status(membership), "trial")
        self.assertIsNotNone(membership.trial_ends_at)
        delta = membership.trial_ends_at - membership.trial_started_at
        self.assertEqual(delta.days, 30)

    def test_me_includes_membership(self):
        resp = self.client.get("/api/v1/auth/me/")
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()["membership"]
        self.assertTrue(data["is_active"])
        self.assertEqual(data["status"], "trial")
        self.assertFalse(data["covers_couple"])

    def test_couple_shares_trial(self):
        partnership = ensure_partnership(self.user)
        partner = User.objects.create_user(
            username="partner",
            email="partner@example.com",
            password="testpass123",
        )
        accept_invite_code(partner, partnership.invite_code)
        self.assertFalse(Membership.objects.filter(user=self.user).exists())
        couple = Membership.objects.get(partnership=partnership)
        self.assertEqual(membership_status(couple), "trial")
        self.client.force_authenticate(user=partner)
        resp = self.client.get("/api/v1/auth/me/")
        self.assertTrue(resp.json()["membership"]["covers_couple"])
        self.assertEqual(resp.json()["membership"]["status"], "trial")


class ComplimentaryMembershipTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="friend",
            email="friend@example.com",
            password="testpass123",
        )
        Membership.objects.filter(user=self.user).update(
            trial_started_at=timezone.now() - timedelta(days=40),
            trial_ends_at=timezone.now() - timedelta(days=10),
        )

    def test_grant_and_revoke_via_command(self):
        call_command("grant_membership", email="friend@example.com", note="beta")
        membership = Membership.objects.get(user=self.user)
        self.assertTrue(membership.complimentary)
        self.assertEqual(membership_status(membership), "complimentary")

        call_command("grant_membership", email="friend@example.com", revoke=True)
        membership.refresh_from_db()
        self.assertFalse(membership.complimentary)
        self.assertEqual(membership_status(membership), "expired")

    def test_grant_covers_couple(self):
        partnership = ensure_partnership(self.user)
        grant_complimentary_membership(self.user, note="friends")
        couple = Membership.objects.get(partnership=partnership)
        self.assertTrue(couple.complimentary)
        self.assertEqual(membership_status(couple), "complimentary")


class BillingVerifyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="buyer",
            email="buyer@example.com",
            password="testpass123",
        )
        self.client.force_authenticate(user=self.user)

    def test_catalog_includes_couple_prices(self):
        resp = self.client.get("/api/v1/billing/")
        self.assertEqual(resp.status_code, 200, resp.content)
        products = {item["id"]: item for item in resp.json()["products"]}
        self.assertEqual(products[MONTHLY_PRODUCT_ID]["price"], "2.00")
        self.assertEqual(products[YEARLY_PRODUCT_ID]["price"], "10.00")
        self.assertEqual(products[MONTHLY_PRODUCT_ID]["trial_days"], 30)

    def test_verify_apple_yearly_entitles_couple(self):
        ensure_partnership(self.user)
        token = apple_jws()
        resp = self.client.post(
            "/api/v1/billing/verify/",
            {
                "platform": "apple",
                "purchase_token": token,
                "product_id": YEARLY_PRODUCT_ID,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()["membership"]
        self.assertEqual(data["status"], "active")
        self.assertEqual(data["plan"], "yearly")
        self.assertTrue(data["covers_couple"])
        membership = Membership.objects.get(original_transaction_id="1000000001")
        self.assertEqual(membership.purchased_by_id, self.user.id)

    def test_partner_inherits_paid_membership(self):
        partnership = ensure_partnership(self.user)
        self.client.post(
            "/api/v1/billing/verify/",
            {"platform": "apple", "purchase_token": apple_jws()},
            format="json",
        )
        partner = User.objects.create_user(
            username="other",
            email="other@example.com",
            password="testpass123",
        )
        accept_invite_code(partner, partnership.invite_code)
        self.client.force_authenticate(user=partner)
        resp = self.client.get("/api/v1/billing/")
        self.assertEqual(resp.json()["membership"]["status"], "active")
        self.assertEqual(resp.json()["membership"]["plan"], "yearly")

    def test_rejects_unknown_product(self):
        token = apple_jws(productId="com.nightcap.app.unknown")
        resp = self.client.post(
            "/api/v1/billing/verify/",
            {"platform": "apple", "purchase_token": token},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_google_unverified_allowed_in_tests(self):
        resp = self.client.post(
            "/api/v1/billing/verify/",
            {
                "platform": "google",
                "purchase_token": "google-token-abc",
                "product_id": MONTHLY_PRODUCT_ID,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.json()["membership"]["plan"], "monthly")
        self.assertEqual(resp.json()["membership"]["status"], "active")
