from datetime import date
from decimal import Decimal
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import Membership, PartnershipMember, User
from accounts.partnerships import accept_invite_code, ensure_partnership
from categories.defaults import create_default_categories_for_user
from categories.models import CategoryGroup, TrackingCategory
from entries.models import Entry, NightCap
from goals.models import Goal


def _png_upload(name="moment.png") -> SimpleUploadedFile:
    buf = BytesIO()
    Image.new("RGB", (8, 8), "red").save(buf, format="PNG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")


class DeleteAccountTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.password = "testpass123"
        self.email = "keep@example.com"
        self.username = "keepuser"
        self.user = User.objects.create_user(
            username=self.username,
            email=self.email,
            password=self.password,
        )
        create_default_categories_for_user(self.user)
        self.client.force_authenticate(user=self.user)

    def test_unauthenticated_delete_is_401(self):
        self.client.force_authenticate(user=None)
        resp = self.client.delete("/api/v1/auth/account/")
        self.assertEqual(resp.status_code, 401)

    def test_delete_account_scrubs_pii_and_returns_204(self):
        user_id = self.user.id
        resp = self.client.delete("/api/v1/auth/account/")
        self.assertEqual(resp.status_code, 204)
        self.assertEqual(resp.content, b"")

        user = User.objects.get(pk=user_id)
        self.assertTrue(user.is_deleted)
        self.assertFalse(user.is_active)
        self.assertIsNotNone(user.deleted_at)
        self.assertTrue(user.email.startswith("deleted-"))
        self.assertTrue(user.email.endswith("@deleted.invalid"))
        self.assertTrue(user.username.startswith("deleted_"))
        self.assertFalse(user.has_usable_password())
        self.assertFalse(User.objects.filter(email=self.email).exists())
        self.assertFalse(User.objects.filter(username=self.username).exists())
        self.assertEqual(User.objects.filter(email__iexact=self.email).count(), 0)

    def test_delete_account_removes_product_data_and_photos(self):
        category = TrackingCategory.objects.filter(user=self.user).first()
        nightcap = NightCap.objects.create(user=self.user, date=date.today())
        nightcap.favorite_photo = _png_upload()
        nightcap.save()
        self.assertTrue(nightcap.favorite_photo)
        photo_name = nightcap.favorite_photo.name

        Entry.objects.create(
            user=self.user,
            nightcap=nightcap,
            date=date.today(),
            category=category,
            amount=Decimal("12.00"),
        )
        Goal.objects.create(
            user=self.user,
            category=category,
            target_value=Decimal("100"),
            period=Goal.PERIOD_MONTHLY,
        )

        resp = self.client.delete("/api/v1/auth/account/")
        self.assertEqual(resp.status_code, 204)

        self.assertFalse(NightCap.objects.filter(user_id=self.user.id).exists())
        self.assertFalse(Entry.objects.filter(user_id=self.user.id).exists())
        self.assertFalse(Goal.objects.filter(user_id=self.user.id).exists())
        self.assertFalse(TrackingCategory.objects.filter(user_id=self.user.id).exists())
        self.assertFalse(CategoryGroup.objects.filter(user_id=self.user.id).exists())
        self.assertFalse(Membership.objects.filter(user_id=self.user.id).exists())
        self.assertFalse(nightcap.favorite_photo.storage.exists(photo_name))

    def test_delete_account_leaves_partnership(self):
        partnership = ensure_partnership(self.user)
        partner = User.objects.create_user(
            username="partner",
            email="partner@example.com",
            password="testpass123",
        )
        accept_invite_code(partner, partnership.invite_code)
        self.assertEqual(PartnershipMember.objects.filter(partnership=partnership).count(), 2)

        resp = self.client.delete("/api/v1/auth/account/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(PartnershipMember.objects.filter(user_id=self.user.id).exists())
        self.assertTrue(PartnershipMember.objects.filter(user=partner).exists())

    def test_login_and_me_fail_after_deletion(self):
        token_resp = self.client.post(
            "/api/v1/auth/token/",
            {"username": self.username, "password": self.password},
            format="json",
        )
        self.assertEqual(token_resp.status_code, 200, token_resp.content)
        access = token_resp.json()["access"]

        resp = self.client.delete("/api/v1/auth/account/")
        self.assertEqual(resp.status_code, 204)

        self.client.force_authenticate(user=None)
        login = self.client.post(
            "/api/v1/auth/token/",
            {"username": self.username, "password": self.password},
            format="json",
        )
        self.assertEqual(login.status_code, 401)

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        me = self.client.get("/api/v1/auth/me/")
        self.assertEqual(me.status_code, 401)
