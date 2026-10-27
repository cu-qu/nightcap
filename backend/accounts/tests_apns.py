from unittest.mock import patch

import httpx
import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.test import TestCase, override_settings

from accounts.apns import PRODUCTION_HOST, SANDBOX_HOST, send_apns
from accounts.models import DevicePushToken, User


def _p8() -> str:
    key = ec.generate_private_key(ec.SECP256R1())
    return key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()


class FakeResponse:
    def __init__(self, status_code: int, reason: str = ""):
        self.status_code = status_code
        self._reason = reason

    def json(self):
        return {"reason": self._reason} if self._reason else {}


class FakeClient:
    def __init__(self, responses: list[FakeResponse]):
        self.responses = list(responses)
        self.posts: list[tuple[str, dict, dict]] = []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def post(self, url, headers=None, json=None):
        self.posts.append((url, headers, json))
        if not self.responses:
            return FakeResponse(500, "InternalServerError")
        return self.responses.pop(0)


APNS = {
    "APNS_TEAM_ID": "TEAMID1234",
    "APNS_KEY_ID": "KEYID12345",
    "APNS_BUNDLE_ID": "com.dailynightcap.app",
}


@override_settings(**APNS)
class ApnsSendTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="pusher",
            email="pusher@example.com",
            password="testpass123",
        )
        self.token = "ab" * 32
        self.record = DevicePushToken.objects.create(
            user=self.user,
            token=self.token,
            platform="ios",
            environment="production",
        )

    def _send(self, client: FakeClient) -> bool:
        with override_settings(APNS_AUTH_KEY=_p8()):
            with patch("accounts.apns.httpx.Client", return_value=client):
                return send_apns(
                    [self.record],
                    title="owner nudged you",
                    body="Finish your NightCap.",
                    data={"type": "partner_nudge", "url": "/ritual/spend", "date": "2026-10-22"},
                )

    def test_posts_alert_to_production(self):
        client = FakeClient([FakeResponse(200)])
        self.assertTrue(self._send(client))
        url, headers, payload = client.posts[0]
        self.assertEqual(url, f"{PRODUCTION_HOST}/3/device/{self.token}")
        self.assertEqual(headers["apns-topic"], "com.dailynightcap.app")
        self.assertEqual(headers["apns-push-type"], "alert")
        self.assertTrue(headers["authorization"].startswith("bearer "))
        self.assertEqual(payload["aps"]["alert"]["title"], "owner nudged you")
        self.assertEqual(payload["type"], "partner_nudge")
        jwt.decode(
            headers["authorization"].removeprefix("bearer "),
            options={"verify_signature": False},
        )

    def test_sandbox_token_uses_sandbox_first(self):
        self.record.environment = "sandbox"
        self.record.save(update_fields=["environment"])
        client = FakeClient([FakeResponse(200)])
        self.assertTrue(self._send(client))
        self.assertTrue(client.posts[0][0].startswith(SANDBOX_HOST))

    def test_bad_device_token_retries_sandbox_then_drops(self):
        client = FakeClient(
            [FakeResponse(400, "BadDeviceToken"), FakeResponse(400, "BadDeviceToken")]
        )
        self.assertFalse(self._send(client))
        self.assertEqual(len(client.posts), 2)
        self.assertTrue(client.posts[1][0].startswith(SANDBOX_HOST))
        self.assertFalse(DevicePushToken.objects.filter(pk=self.record.pk).exists())

    def test_unregistered_token_is_removed(self):
        client = FakeClient([FakeResponse(410, "Unregistered")])
        self.assertFalse(self._send(client))
        self.assertFalse(DevicePushToken.objects.filter(pk=self.record.pk).exists())

    def test_missing_key_skips_send(self):
        with override_settings(APNS_AUTH_KEY=""):
            with patch("accounts.apns.httpx.Client") as client:
                self.assertFalse(
                    send_apns(
                        [self.record],
                        title="t",
                        body="b",
                        data={"type": "partner_nudge"},
                    )
                )
        client.assert_not_called()

    def test_connection_error_is_not_a_delivery(self):
        class DownClient(FakeClient):
            def post(self, url, headers=None, json=None):
                raise httpx.ConnectError("down")

        self.assertFalse(self._send(DownClient([])))
        self.assertTrue(DevicePushToken.objects.filter(pk=self.record.pk).exists())
