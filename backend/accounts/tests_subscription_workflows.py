"""How a NightCap subscription behaves for one person, for a couple, and per month or year.

One store receipt covers the couple while they are linked. It stays with the person
who paid when they split. The other person goes back to the trial from their own
signup. A second receipt is kept for its buyer and returned if they leave.
"""

from datetime import datetime, timedelta
from datetime import timezone as dt_timezone

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.iap import MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID
from accounts.memberships import get_membership_for_user
from accounts.models import Membership, PartnershipMember, User
from accounts.tests_billing import apple_jws, apple_notification


class SubscriptionWorkflowTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

    def make_user(self, username: str) -> User:
        return User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password="testpass123",
        )

    def fresh(self, user: User) -> User:
        """Load the user again so partnership links match a new request."""
        return User.objects.get(pk=user.pk)

    def billing(self, user: User) -> dict:
        self.client.force_authenticate(user=self.fresh(user))
        resp = self.client.get("/api/v1/billing/")
        self.assertEqual(resp.status_code, 200, resp.content)
        return resp.json()["membership"]

    def assert_can_use_app(self, user: User, *, allowed: bool):
        self.client.force_authenticate(user=self.fresh(user))
        resp = self.client.get("/api/v1/calendar/")
        if allowed:
            self.assertEqual(resp.status_code, 200, resp.content)
        else:
            self.assertEqual(resp.status_code, 403, resp.content)

    def age_account(self, user: User, *, days: int = 40) -> None:
        user.date_joined = timezone.now() - timedelta(days=days)
        user.save(update_fields=["date_joined"])

    def expire_trial(self, user: User):
        membership = get_membership_for_user(user)
        self.assertIsNotNone(membership)
        past = timezone.now() - timedelta(days=1)
        membership.trial_started_at = past - timedelta(days=31)
        membership.trial_ends_at = past
        membership.save(update_fields=["trial_started_at", "trial_ends_at", "updated_at"])

    def subscribe_apple(self, user: User, *, plan: str, original: str, days: int | None = None) -> dict:
        product_id = MONTHLY_PRODUCT_ID if plan == "monthly" else YEARLY_PRODUCT_ID
        period_days = days if days is not None else (31 if plan == "monthly" else 366)
        expires = datetime.now(dt_timezone.utc) + timedelta(days=period_days)
        token = apple_jws(
            productId=product_id,
            originalTransactionId=original,
            transactionId=f"{original}-txn",
            expiresDate=int(expires.timestamp() * 1000),
        )
        self.client.force_authenticate(user=user)
        resp = self.client.post(
            "/api/v1/billing/verify/",
            {"platform": "apple", "purchase_token": token, "product_id": product_id},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        return resp.json()["membership"]

    def subscribe_google(self, user: User, *, plan: str, token: str) -> dict:
        product_id = MONTHLY_PRODUCT_ID if plan == "monthly" else YEARLY_PRODUCT_ID
        self.client.force_authenticate(user=user)
        resp = self.client.post(
            "/api/v1/billing/verify/",
            {"platform": "google", "purchase_token": token, "product_id": product_id},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        return resp.json()["membership"]

    def open_couple_space(self, owner: User) -> str:
        self.client.force_authenticate(user=owner)
        resp = self.client.post("/api/v1/partnership/")
        self.assertEqual(resp.status_code, 201, resp.content)
        return resp.json()["partnership"]["invite_code"]

    def join_couple(self, user: User, code: str, *, ok: bool = True):
        self.client.force_authenticate(user=user)
        resp = self.client.post(
            "/api/v1/partnership/join/",
            {"invite_code": code},
            format="json",
        )
        if ok:
            self.assertEqual(resp.status_code, 200, resp.content)
        return resp

    def pair(self, owner: User, partner: User) -> str:
        code = self.open_couple_space(owner)
        self.join_couple(partner, code)
        return code

    def leave(self, user: User):
        self.client.force_authenticate(user=user)
        resp = self.client.post("/api/v1/partnership/leave/")
        self.assertEqual(resp.status_code, 200, resp.content)

    def notify(self, signed: str):
        self.client.force_authenticate(user=None)
        resp = self.client.post(
            "/api/v1/billing/apple-notifications/",
            {"signedPayload": signed},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        return resp


class SoloSubscriptionWorkflowTests(SubscriptionWorkflowTestCase):
    def test_solo_monthly_replaces_an_ended_trial_for_that_person_only(self):
        user = self.make_user("solo-month")
        self.assertEqual(self.billing(user)["status"], "trial")
        self.assertFalse(self.billing(user)["covers_couple"])

        self.expire_trial(user)
        self.assert_can_use_app(user, allowed=False)

        started = timezone.now()
        membership = self.subscribe_google(user, plan="monthly", token="google-solo-monthly")

        self.assertEqual(membership["status"], "active")
        self.assertEqual(membership["plan"], "monthly")
        self.assertEqual(membership["source"], "store")
        self.assertEqual(membership["product_id"], MONTHLY_PRODUCT_ID)
        self.assertFalse(membership["covers_couple"])
        self.assertTrue(membership["auto_renewing"])
        row = Membership.objects.get(user=user)
        self.assertEqual(row.partnership_id, None)
        self.assertEqual(row.purchased_by_id, user.id)
        self.assertAlmostEqual(
            (row.store_expires_at - started).total_seconds(),
            31 * 86400,
            delta=30,
        )
        self.assert_can_use_app(user, allowed=True)

        catalog = self.client.get("/api/v1/billing/").json()["products"]
        by_period = {item["period"]: item for item in catalog}
        self.assertEqual(by_period["month"]["price"], "3.00")
        self.assertEqual(by_period["month"]["plan"], "monthly")
        self.assertEqual(by_period["year"]["price"], "15.00")
        self.assertEqual(by_period["year"]["plan"], "yearly")

    def test_solo_yearly_lasts_about_a_year_and_stays_personal(self):
        user = self.make_user("solo-year")
        self.expire_trial(user)
        started = timezone.now()
        membership = self.subscribe_google(user, plan="yearly", token="google-solo-yearly")

        self.assertEqual(membership["plan"], "yearly")
        self.assertEqual(membership["product_id"], YEARLY_PRODUCT_ID)
        self.assertFalse(membership["covers_couple"])
        self.assert_can_use_app(user, allowed=True)
        row = Membership.objects.get(user=user)
        self.assertAlmostEqual(
            (row.store_expires_at - started).total_seconds(),
            366 * 86400,
            delta=30,
        )

    def test_solo_buyer_can_switch_a_monthly_plan_to_yearly(self):
        user = self.make_user("solo-switch")
        self.subscribe_apple(user, plan="monthly", original="solo-switch", days=20)
        self.assertEqual(self.billing(user)["plan"], "monthly")

        upgraded = self.subscribe_apple(user, plan="yearly", original="solo-switch", days=300)
        self.assertEqual(upgraded["plan"], "yearly")
        self.assertEqual(upgraded["product_id"], YEARLY_PRODUCT_ID)
        self.assertFalse(upgraded["covers_couple"])
        self.assertEqual(Membership.objects.count(), 1)
        row = Membership.objects.get(original_transaction_id="solo-switch")
        self.assertGreater(row.store_expires_at, timezone.now() + timedelta(days=200))


class CoupleSubscriptionWorkflowTests(SubscriptionWorkflowTestCase):
    def test_solo_monthly_follows_the_buyer_and_covers_the_partner(self):
        buyer = self.make_user("buyer-month")
        partner = self.make_user("partner-month")
        self.subscribe_apple(buyer, plan="monthly", original="couple-monthly", days=31)
        self.assertFalse(self.billing(buyer)["covers_couple"])

        code = self.open_couple_space(buyer)
        moved = self.billing(buyer)
        self.assertEqual(moved["status"], "active")
        self.assertEqual(moved["plan"], "monthly")
        self.assertTrue(moved["covers_couple"])
        self.assertFalse(Membership.objects.filter(user=buyer).exists())

        self.join_couple(partner, code)

        for person in (buyer, partner):
            shared = self.billing(person)
            self.assertEqual(shared["status"], "active")
            self.assertEqual(shared["plan"], "monthly")
            self.assertEqual(shared["product_id"], MONTHLY_PRODUCT_ID)
            self.assertTrue(shared["covers_couple"])
            self.assert_can_use_app(person, allowed=True)

        self.assertEqual(Membership.objects.count(), 1)
        row = Membership.objects.get(original_transaction_id="couple-monthly")
        self.assertEqual(row.purchased_by_id, buyer.id)
        self.assertIsNone(row.user_id)
        self.assertIsNotNone(row.partnership_id)

    def test_either_partner_can_buy_the_yearly_plan_for_both(self):
        owner = self.make_user("owner-year")
        partner = self.make_user("partner-year")
        self.pair(owner, partner)
        self.expire_trial(owner)
        self.assert_can_use_app(owner, allowed=False)
        self.assert_can_use_app(partner, allowed=False)

        bought = self.subscribe_apple(partner, plan="yearly", original="couple-yearly", days=366)
        self.assertEqual(bought["plan"], "yearly")
        self.assertTrue(bought["covers_couple"])

        for person in (owner, partner):
            shared = self.billing(person)
            self.assertEqual(shared["status"], "active")
            self.assertEqual(shared["plan"], "yearly")
            self.assertEqual(shared["source"], "store")
            self.assert_can_use_app(person, allowed=True)

        row = Membership.objects.get(original_transaction_id="couple-yearly")
        self.assertEqual(row.purchased_by_id, partner.id)
        self.assertEqual(Membership.objects.count(), 1)

    def test_joining_a_trial_couple_shares_the_joiners_monthly_plan(self):
        owner = self.make_user("trial-owner")
        joiner = self.make_user("paying-joiner")
        self.subscribe_apple(joiner, plan="monthly", original="joiner-monthly", days=31)
        code = self.open_couple_space(owner)

        self.join_couple(joiner, code)

        for person in (owner, joiner):
            shared = self.billing(person)
            self.assertEqual(shared["status"], "active")
            self.assertEqual(shared["plan"], "monthly")
            self.assertTrue(shared["covers_couple"])
        row = Membership.objects.get()
        self.assertEqual(row.original_transaction_id, "joiner-monthly")
        self.assertEqual(row.purchased_by_id, joiner.id)

    def test_joining_a_paid_couple_keeps_that_couples_subscription(self):
        owner = self.make_user("paid-owner")
        joiner = self.make_user("second-payer")
        self.subscribe_apple(owner, plan="monthly", original="owner-monthly", days=31)
        self.subscribe_apple(joiner, plan="yearly", original="joiner-yearly", days=366)
        code = self.open_couple_space(owner)

        self.join_couple(joiner, code)

        for person in (owner, joiner):
            shared = self.billing(person)
            self.assertEqual(shared["plan"], "monthly")
            self.assertEqual(shared["product_id"], MONTHLY_PRODUCT_ID)
            self.assertTrue(shared["covers_couple"])
        self.assertEqual(
            Membership.objects.get(partnership__isnull=False).original_transaction_id,
            "owner-monthly",
        )
        parked = Membership.objects.get(user=joiner)
        self.assertEqual(parked.original_transaction_id, "joiner-yearly")
        self.assertEqual(parked.plan, "yearly")

    def test_same_receipt_cannot_entitle_a_different_account(self):
        buyer = self.make_user("receipt-owner")
        stranger = self.make_user("receipt-stranger")
        self.subscribe_apple(buyer, plan="monthly", original="shared-receipt", days=31)
        token = apple_jws(
            productId=MONTHLY_PRODUCT_ID,
            originalTransactionId="shared-receipt",
            transactionId="shared-receipt-txn",
        )

        self.client.force_authenticate(user=stranger)
        resp = self.client.post(
            "/api/v1/billing/verify/",
            {"platform": "apple", "purchase_token": token, "product_id": MONTHLY_PRODUCT_ID},
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertIn("already linked", str(resp.json()))
        self.assertEqual(self.billing(stranger)["status"], "trial")
        self.assertFalse(self.billing(stranger)["covers_couple"])
        self.assertEqual(self.billing(buyer)["plan"], "monthly")
        self.assertEqual(Membership.objects.filter(original_transaction_id="shared-receipt").count(), 1)

    def test_partner_can_restore_the_buyers_receipt_on_the_same_couple(self):
        buyer = self.make_user("restore-buyer")
        partner = self.make_user("restore-partner")
        self.subscribe_apple(buyer, plan="yearly", original="restore-yearly", days=366)
        code = self.open_couple_space(buyer)
        self.join_couple(partner, code)
        token = apple_jws(
            productId=YEARLY_PRODUCT_ID,
            originalTransactionId="restore-yearly",
            transactionId="restore-yearly-txn",
            expiresDate=int((datetime.now(dt_timezone.utc) + timedelta(days=366)).timestamp() * 1000),
        )

        self.client.force_authenticate(user=partner)
        resp = self.client.post(
            "/api/v1/billing/verify/",
            {"platform": "apple", "purchase_token": token},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(Membership.objects.count(), 1)
        row = Membership.objects.get(original_transaction_id="restore-yearly")
        self.assertEqual(row.purchased_by_id, partner.id)
        self.assertEqual(self.billing(buyer)["plan"], "yearly")
        self.assertTrue(self.billing(partner)["covers_couple"])

    def test_expired_account_cannot_join_a_paid_couple(self):
        buyer = self.make_user("paid-host")
        partner = self.make_user("lapsed")
        self.subscribe_apple(buyer, plan="monthly", original="host-monthly", days=31)
        self.expire_trial(partner)
        code = self.open_couple_space(buyer)

        resp = self.join_couple(partner, code, ok=False)
        self.assertEqual(resp.status_code, 403, resp.content)
        self.assertFalse(PartnershipMember.objects.filter(user=partner).exists())
        self.assertEqual(self.billing(buyer)["plan"], "monthly")
        self.assertTrue(self.billing(buyer)["covers_couple"])
        self.assertEqual(self.billing(partner)["status"], "expired")
        self.assertFalse(self.billing(partner)["covers_couple"])

    def test_purchaser_keeps_the_monthly_plan_when_they_leave(self):
        buyer = self.make_user("leaving-buyer")
        partner = self.make_user("left-behind")
        self.subscribe_apple(buyer, plan="monthly", original="leave-monthly", days=31)
        self.pair(buyer, partner)
        self.expire_trial(buyer)

        self.leave(buyer)

        buyers = self.billing(buyer)
        self.assertEqual(buyers["status"], "active")
        self.assertEqual(buyers["plan"], "monthly")
        self.assertFalse(buyers["covers_couple"])
        self.assert_can_use_app(buyer, allowed=True)

        partners = self.billing(partner)
        self.assertEqual(partners["status"], "trial")
        self.assertIsNone(partners["plan"])
        self.assertTrue(partners["covers_couple"])
        self.assert_can_use_app(partner, allowed=True)

        personal = Membership.objects.get(user=buyer)
        self.assertEqual(personal.original_transaction_id, "leave-monthly")
        couple = Membership.objects.get(partnership__isnull=False)
        self.assertEqual(couple.original_transaction_id, "")
        self.assertIsNone(couple.store_expires_at)

    def test_purchaser_who_leaves_during_the_trial_leaves_the_partner_on_trial(self):
        buyer = self.make_user("early-buyer")
        partner = self.make_user("still-trial")
        self.subscribe_apple(buyer, plan="yearly", original="early-yearly", days=366)
        self.pair(buyer, partner)

        self.leave(buyer)

        self.assertEqual(self.billing(buyer)["status"], "active")
        self.assertEqual(self.billing(buyer)["plan"], "yearly")
        self.assertFalse(self.billing(buyer)["covers_couple"])
        partners = self.billing(partner)
        self.assertEqual(partners["status"], "trial")
        self.assertIsNone(partners["plan"])
        self.assertTrue(partners["is_active"])
        self.assert_can_use_app(partner, allowed=True)

    def test_joiner_who_did_not_pay_leaves_with_their_own_trial(self):
        buyer = self.make_user("paid-host-stays")
        joiner = self.make_user("joiner-with-trial")
        self.age_account(buyer)
        self.subscribe_apple(buyer, plan="yearly", original="host-yearly", days=366)
        self.expire_trial(buyer)
        self.pair(buyer, joiner)

        self.leave(joiner)

        left = self.billing(joiner)
        self.assertEqual(left["status"], "trial")
        self.assertIsNone(left["plan"])
        self.assertFalse(left["covers_couple"])
        self.assert_can_use_app(joiner, allowed=True)

        stayed = self.billing(buyer)
        self.assertEqual(stayed["status"], "active")
        self.assertEqual(stayed["plan"], "yearly")
        self.assertTrue(stayed["covers_couple"])
        self.assert_can_use_app(buyer, allowed=True)
        self.assertEqual(
            Membership.objects.get(original_transaction_id="host-yearly").purchased_by_id,
            buyer.id,
        )

    def test_joiner_whose_trial_ended_leaves_without_the_paid_plan(self):
        buyer = self.make_user("paid-host-keeps")
        joiner = self.make_user("joiner-lapsed")
        self.subscribe_apple(buyer, plan="monthly", original="host-keeps-monthly", days=31)
        self.pair(buyer, joiner)
        self.age_account(joiner)

        self.leave(joiner)

        left = self.billing(joiner)
        self.assertEqual(left["status"], "expired")
        self.assertIsNone(left["plan"])
        self.assertFalse(left["covers_couple"])
        self.assert_can_use_app(joiner, allowed=False)

        stayed = self.billing(buyer)
        self.assertEqual(stayed["status"], "active")
        self.assertEqual(stayed["plan"], "monthly")
        self.assertTrue(stayed["covers_couple"])

    def test_joiner_who_paid_takes_that_plan_when_they_leave(self):
        owner = self.make_user("trial-host")
        joiner = self.make_user("paying-guest")
        self.subscribe_apple(joiner, plan="monthly", original="guest-monthly", days=31)
        code = self.open_couple_space(owner)
        self.join_couple(joiner, code)

        self.leave(joiner)

        self.assertEqual(self.billing(joiner)["status"], "active")
        self.assertEqual(self.billing(joiner)["plan"], "monthly")
        self.assertFalse(self.billing(joiner)["covers_couple"])
        host = self.billing(owner)
        self.assertEqual(host["status"], "trial")
        self.assertIsNone(host["plan"])
        self.assertTrue(host["covers_couple"])
        self.assertEqual(
            Membership.objects.get(original_transaction_id="guest-monthly").user_id,
            joiner.id,
        )

    def test_host_who_did_not_pay_leaves_the_joiners_plan_in_place(self):
        owner = self.make_user("unpaid-host")
        joiner = self.make_user("paying-partner")
        self.subscribe_apple(joiner, plan="yearly", original="partner-yearly", days=366)
        code = self.open_couple_space(owner)
        self.join_couple(joiner, code)

        self.leave(owner)

        host = self.billing(owner)
        self.assertEqual(host["status"], "trial")
        self.assertIsNone(host["plan"])
        self.assertFalse(host["covers_couple"])
        stayed = self.billing(joiner)
        self.assertEqual(stayed["status"], "active")
        self.assertEqual(stayed["plan"], "yearly")
        self.assertTrue(stayed["covers_couple"])

    def test_joiner_with_their_own_plan_gets_it_back_on_leave(self):
        owner = self.make_user("covered-owner")
        joiner = self.make_user("extra-payer")
        self.subscribe_apple(owner, plan="monthly", original="owner-monthly-kept", days=31)
        self.subscribe_apple(joiner, plan="yearly", original="joiner-yearly-parked", days=366)
        code = self.open_couple_space(owner)
        self.join_couple(joiner, code)
        self.assertEqual(self.billing(joiner)["plan"], "monthly")

        self.leave(joiner)

        left = self.billing(joiner)
        self.assertEqual(left["status"], "active")
        self.assertEqual(left["plan"], "yearly")
        self.assertFalse(left["covers_couple"])
        stayed = self.billing(owner)
        self.assertEqual(stayed["status"], "active")
        self.assertEqual(stayed["plan"], "monthly")
        self.assertTrue(stayed["covers_couple"])

    def test_when_the_covering_buyer_leaves_the_stayer_gets_their_own_plan_back(self):
        owner = self.make_user("first-payer")
        joiner = self.make_user("second-payer")
        self.subscribe_apple(owner, plan="monthly", original="first-monthly", days=31)
        self.subscribe_apple(joiner, plan="yearly", original="second-yearly", days=366)
        code = self.open_couple_space(owner)
        self.join_couple(joiner, code)

        self.leave(owner)

        left = self.billing(owner)
        self.assertEqual(left["plan"], "monthly")
        self.assertFalse(left["covers_couple"])
        stayed = self.billing(joiner)
        self.assertEqual(stayed["plan"], "yearly")
        self.assertEqual(stayed["status"], "active")
        self.assertTrue(stayed["covers_couple"])

    def test_payer_who_leaves_after_the_joiners_trial_ends_does_not_cover_them(self):
        buyer = self.make_user("buyer-exits")
        joiner = self.make_user("joiner-expired")
        self.subscribe_apple(buyer, plan="yearly", original="exit-yearly", days=366)
        self.pair(buyer, joiner)
        self.age_account(joiner)

        self.leave(buyer)

        self.assertEqual(self.billing(buyer)["plan"], "yearly")
        self.assertFalse(self.billing(buyer)["covers_couple"])
        left_behind = self.billing(joiner)
        self.assertEqual(left_behind["status"], "expired")
        self.assertIsNone(left_behind["plan"])
        self.assert_can_use_app(joiner, allowed=False)

    def test_solo_subscriber_who_opens_a_couple_space_and_leaves_keeps_the_plan(self):
        buyer = self.make_user("alone-again")
        self.subscribe_apple(buyer, plan="monthly", original="alone-monthly", days=31)
        self.open_couple_space(buyer)

        self.leave(buyer)

        alone = self.billing(buyer)
        self.assertEqual(alone["status"], "active")
        self.assertEqual(alone["plan"], "monthly")
        self.assertFalse(alone["covers_couple"])

    def test_couple_can_switch_from_monthly_to_yearly(self):
        owner = self.make_user("switch-owner")
        partner = self.make_user("switch-partner")
        self.pair(owner, partner)
        self.subscribe_apple(owner, plan="monthly", original="switch-plan", days=15)

        upgraded = self.subscribe_apple(owner, plan="yearly", original="switch-plan", days=366)
        self.assertEqual(upgraded["plan"], "yearly")
        self.assertTrue(upgraded["covers_couple"])
        self.assertEqual(self.billing(partner)["plan"], "yearly")
        self.assertEqual(self.billing(partner)["product_id"], YEARLY_PRODUCT_ID)
        self.assertEqual(Membership.objects.count(), 1)
        row = Membership.objects.get(original_transaction_id="switch-plan")
        self.assertGreater(row.store_expires_at, timezone.now() + timedelta(days=300))

    def test_monthly_renewal_extends_the_couple_without_a_second_membership(self):
        owner = self.make_user("renew-owner")
        partner = self.make_user("renew-partner")
        self.pair(owner, partner)
        self.subscribe_apple(owner, plan="monthly", original="renew-monthly", days=5)
        later = datetime.now(dt_timezone.utc) + timedelta(days=36)

        self.notify(
            apple_notification(
                "DID_RENEW",
                transaction={
                    "productId": MONTHLY_PRODUCT_ID,
                    "originalTransactionId": "renew-monthly",
                    "transactionId": "renew-monthly-2",
                    "expiresDate": int(later.timestamp() * 1000),
                },
                renewal={"autoRenewStatus": 1, "originalTransactionId": "renew-monthly"},
            )
        )

        row = Membership.objects.get(original_transaction_id="renew-monthly")
        self.assertEqual(row.plan, "monthly")
        self.assertEqual(row.latest_transaction_id, "renew-monthly-2")
        self.assertGreater(row.store_expires_at, timezone.now() + timedelta(days=30))
        self.assertEqual(Membership.objects.count(), 1)
        for person in (owner, partner):
            shared = self.billing(person)
            self.assertEqual(shared["status"], "active")
            self.assertEqual(shared["plan"], "monthly")
            self.assertTrue(shared["auto_renewing"])

    def test_turning_off_auto_renew_keeps_both_partners_until_the_period_ends(self):
        owner = self.make_user("cancel-owner")
        partner = self.make_user("cancel-partner")
        self.pair(owner, partner)
        self.subscribe_apple(owner, plan="monthly", original="cancel-monthly", days=20)

        self.notify(
            apple_notification(
                "DID_CHANGE_RENEWAL_STATUS",
                subtype="AUTO_RENEW_DISABLED",
                transaction={
                    "productId": MONTHLY_PRODUCT_ID,
                    "originalTransactionId": "cancel-monthly",
                    "transactionId": "cancel-monthly-txn",
                },
                renewal={"autoRenewStatus": 0, "originalTransactionId": "cancel-monthly"},
            )
        )

        for person in (owner, partner):
            shared = self.billing(person)
            self.assertEqual(shared["status"], "active")
            self.assertEqual(shared["plan"], "monthly")
            self.assertFalse(shared["auto_renewing"])
            self.assert_can_use_app(person, allowed=True)

    def test_refund_during_the_trial_falls_back_to_the_shared_trial(self):
        owner = self.make_user("refund-trial-owner")
        partner = self.make_user("refund-trial-partner")
        self.pair(owner, partner)
        self.subscribe_apple(owner, plan="monthly", original="refund-trial", days=31)
        revoked = datetime.now(dt_timezone.utc) - timedelta(minutes=5)

        self.notify(
            apple_notification(
                "REFUND",
                transaction={
                    "productId": MONTHLY_PRODUCT_ID,
                    "originalTransactionId": "refund-trial",
                    "transactionId": "refund-trial-txn",
                    "expiresDate": int((datetime.now(dt_timezone.utc) + timedelta(days=20)).timestamp() * 1000),
                    "revocationDate": int(revoked.timestamp() * 1000),
                },
            )
        )

        for person in (owner, partner):
            shared = self.billing(person)
            self.assertEqual(shared["status"], "trial")
            self.assertEqual(shared["source"], "trial")
            self.assertTrue(shared["is_active"])
            self.assert_can_use_app(person, allowed=True)

    def test_refund_after_the_trial_ends_access_for_both_partners(self):
        owner = self.make_user("refund-owner")
        partner = self.make_user("refund-partner")
        self.pair(owner, partner)
        self.subscribe_apple(partner, plan="yearly", original="refund-yearly", days=200)
        self.expire_trial(owner)
        revoked = datetime.now(dt_timezone.utc) - timedelta(minutes=5)

        self.notify(
            apple_notification(
                "REFUND",
                transaction={
                    "productId": YEARLY_PRODUCT_ID,
                    "originalTransactionId": "refund-yearly",
                    "transactionId": "refund-yearly-txn",
                    "expiresDate": int((datetime.now(dt_timezone.utc) + timedelta(days=100)).timestamp() * 1000),
                    "revocationDate": int(revoked.timestamp() * 1000),
                },
            )
        )

        for person in (owner, partner):
            shared = self.billing(person)
            self.assertEqual(shared["status"], "expired")
            self.assertFalse(shared["is_active"])
            self.assert_can_use_app(person, allowed=False)

    def test_store_expiration_ends_a_monthly_couple_after_the_trial(self):
        owner = self.make_user("expire-owner")
        partner = self.make_user("expire-partner")
        self.pair(owner, partner)
        self.subscribe_apple(owner, plan="monthly", original="expire-monthly", days=12)
        self.expire_trial(owner)
        self.assert_can_use_app(partner, allowed=True)

        ended = datetime.now(dt_timezone.utc) - timedelta(hours=1)
        self.notify(
            apple_notification(
                "EXPIRED",
                transaction={
                    "productId": MONTHLY_PRODUCT_ID,
                    "originalTransactionId": "expire-monthly",
                    "transactionId": "expire-monthly-txn",
                    "expiresDate": int(ended.timestamp() * 1000),
                },
            )
        )

        for person in (owner, partner):
            self.assertEqual(self.billing(person)["status"], "expired")
            self.assertEqual(self.billing(person)["plan"], "monthly")
            self.assert_can_use_app(person, allowed=False)

    def test_deleting_the_purchaser_drops_the_partners_paid_access(self):
        buyer = self.make_user("delete-buyer")
        partner = self.make_user("delete-partner")
        self.subscribe_apple(buyer, plan="yearly", original="delete-yearly", days=366)
        self.pair(buyer, partner)
        self.age_account(partner)
        self.expire_trial(buyer)

        self.client.force_authenticate(user=buyer)
        resp = self.client.delete("/api/v1/auth/account/")
        self.assertEqual(resp.status_code, 204, resp.content)

        self.assertFalse(Membership.objects.filter(original_transaction_id="delete-yearly").exists())
        partners = self.billing(partner)
        self.assertEqual(partners["status"], "expired")
        self.assertIsNone(partners["plan"])
        self.assert_can_use_app(partner, allowed=False)
        self.assertTrue(PartnershipMember.objects.filter(user=partner).exists())
        self.assertFalse(PartnershipMember.objects.filter(user=buyer).exists())

    def test_deleting_a_partner_does_not_cancel_the_purchasers_plan(self):
        buyer = self.make_user("kept-buyer")
        partner = self.make_user("deleted-partner")
        self.subscribe_apple(buyer, plan="monthly", original="kept-monthly", days=31)
        self.pair(buyer, partner)
        self.expire_trial(buyer)

        self.client.force_authenticate(user=partner)
        resp = self.client.delete("/api/v1/auth/account/")
        self.assertEqual(resp.status_code, 204, resp.content)

        staying = self.billing(buyer)
        self.assertEqual(staying["status"], "active")
        self.assertEqual(staying["plan"], "monthly")
        self.assertTrue(staying["covers_couple"])
        self.assert_can_use_app(buyer, allowed=True)
        row = Membership.objects.get(original_transaction_id="kept-monthly")
        self.assertEqual(row.purchased_by_id, buyer.id)
        self.assertTrue(PartnershipMember.objects.filter(user=buyer).exists())
        self.assertFalse(PartnershipMember.objects.filter(user=partner).exists())
