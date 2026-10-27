"""Send partner nudges through Apple Push Notification service."""

from __future__ import annotations

import logging
import re
import time
from pathlib import Path

import httpx
import jwt
from django.conf import settings

from accounts.models import DevicePushToken

logger = logging.getLogger(__name__)

PRODUCTION_HOST = "https://api.push.apple.com"
SANDBOX_HOST = "https://api.sandbox.push.apple.com"
TOKEN_RE = re.compile(r"^[0-9a-fA-F]{64,200}$")
DROP_REASONS = {"BadDeviceToken", "Unregistered", "ExpiredToken"}

_provider_cache: dict[str, object] = {"token": "", "exp": 0, "kid": "", "team": ""}


def load_auth_key() -> str:
    raw = (getattr(settings, "APNS_AUTH_KEY", "") or "").strip()
    if not raw:
        return ""
    if "BEGIN PRIVATE KEY" in raw or "BEGIN EC PRIVATE KEY" in raw:
        return raw.replace("\\n", "\n")
    path = Path(raw)
    if path.is_file():
        return path.read_text()
    return raw.replace("\\n", "\n")


def provider_token(team_id: str, key_id: str, private_key: str) -> str:
    now = int(time.time())
    cached = _provider_cache
    if (
        cached["token"]
        and cached["kid"] == key_id
        and cached["team"] == team_id
        and now < int(cached["exp"])
    ):
        return str(cached["token"])
    encoded = jwt.encode(
        {"iss": team_id, "iat": now},
        private_key,
        algorithm="ES256",
        headers={"kid": key_id},
    )
    if isinstance(encoded, bytes):
        encoded = encoded.decode()
    cached.update(token=encoded, exp=now + 50 * 60, kid=key_id, team=team_id)
    return encoded


def _hosts_for(environment: str) -> list[str]:
    if environment == DevicePushToken.ENV_SANDBOX:
        return [SANDBOX_HOST, PRODUCTION_HOST]
    return [PRODUCTION_HOST, SANDBOX_HOST]


def _normalize_token(token: str) -> str:
    return re.sub(r"[<>\s]", "", token or "")


def send_apns(
    records: list[DevicePushToken],
    *,
    title: str,
    body: str,
    data: dict,
) -> bool:
    """Deliver an alert to any of the iOS device tokens. True if Apple accepts one."""
    team_id = (getattr(settings, "APNS_TEAM_ID", "") or "").strip()
    key_id = (getattr(settings, "APNS_KEY_ID", "") or "").strip()
    bundle_id = (
        getattr(settings, "APNS_BUNDLE_ID", "") or getattr(settings, "IAP_APPLE_BUNDLE_ID", "")
    ).strip()
    private_key = load_auth_key()
    if not (team_id and key_id and bundle_id and private_key):
        logger.warning("APNs is not configured; partner nudge push was skipped.")
        return False

    payload = {
        "aps": {
            "alert": {"title": title, "body": body},
            "sound": "default",
            "badge": 1,
        },
        **data,
    }
    try:
        authorization = provider_token(team_id, key_id, private_key)
    except Exception:
        logger.exception("Could not sign the APNs provider token.")
        return False

    delivered = False
    try:
        with httpx.Client(http2=True, timeout=10) as client:
            for record in records:
                if _deliver(client, record, authorization, bundle_id, payload):
                    delivered = True
    except Exception:
        logger.exception("APNs request failed.")
        return delivered
    return delivered


def _deliver(
    client: httpx.Client,
    record: DevicePushToken,
    authorization: str,
    bundle_id: str,
    payload: dict,
) -> bool:
    token = _normalize_token(record.token)
    if not TOKEN_RE.fullmatch(token):
        record.delete()
        return False

    headers = {
        "authorization": f"bearer {authorization}",
        "apns-topic": bundle_id,
        "apns-push-type": "alert",
        "apns-priority": "10",
    }
    hosts = _hosts_for(record.environment)
    for index, host in enumerate(hosts):
        try:
            response = client.post(
                f"{host}/3/device/{token}",
                headers=headers,
                json=payload,
            )
        except httpx.HTTPError:
            logger.warning("APNs connection to %s failed.", host)
            if index == len(hosts) - 1:
                return False
            continue
        if response.status_code == 200:
            return True
        reason = _reason(response)
        logger.warning("APNs rejected a device token (%s %s).", response.status_code, reason)
        retry_other_host = reason == "BadDeviceToken" and index < len(hosts) - 1
        if retry_other_host:
            continue
        if response.status_code in (400, 410) and reason in DROP_REASONS:
            record.delete()
        return False
    return False


def _reason(response: httpx.Response) -> str:
    try:
        body = response.json()
    except Exception:
        return ""
    if isinstance(body, dict):
        return str(body.get("reason") or "")
    return ""
