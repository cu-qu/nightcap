"""Store product catalog and receipt verification for NightCap couple IAP."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone as dt_timezone
from pathlib import Path

import jwt
from django.conf import settings
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import ValidationError

from accounts.models import Membership

logger = logging.getLogger(__name__)

MONTHLY_PRODUCT_ID = "com.nightcap.app.couple.monthly"
YEARLY_PRODUCT_ID = "com.nightcap.app.couple.yearly"

PRODUCTS = {
    MONTHLY_PRODUCT_ID: {
        "plan": Membership.PLAN_MONTHLY,
        "period_days": 31,
        "display_price": "2.00",
        "period": "month",
        "label": "NightCap for two · monthly",
    },
    YEARLY_PRODUCT_ID: {
        "plan": Membership.PLAN_YEARLY,
        "period_days": 366,
        "display_price": "10.00",
        "period": "year",
        "label": "NightCap for two · yearly",
    },
}

def product_ids() -> list[str]:
    extra = getattr(settings, "IAP_PRODUCT_IDS", None)
    if extra:
        return list(extra)
    return list(PRODUCTS.keys())


def serialize_catalog() -> list[dict]:
    trial_days = int(getattr(settings, "IAP_TRIAL_DAYS", 30))
    return [
        {
            "id": product_id,
            "plan": meta["plan"],
            "price": meta["display_price"],
            "period": meta["period"],
            "label": meta["label"],
            "trial_days": trial_days,
        }
        for product_id, meta in PRODUCTS.items()
    ]


def _ms_to_datetime(value) -> datetime | None:
    if value in (None, "", 0):
        return None
    if isinstance(value, datetime):
        if timezone_is_naive(value):
            return value.replace(tzinfo=dt_timezone.utc)
        return value
    try:
        millis = int(value)
    except (TypeError, ValueError):
        parsed = parse_datetime(str(value))
        return parsed
    if millis > 10_000_000_000:
        millis = millis / 1000.0
    return datetime.fromtimestamp(millis, tz=dt_timezone.utc)


def timezone_is_naive(value: datetime) -> bool:
    return value.tzinfo is None or value.tzinfo.utcoffset(value) is None


def _plan_for_product(product_id: str) -> dict:
    meta = PRODUCTS.get(product_id)
    if meta is None:
        raise ValidationError({"product_id": "Unknown NightCap subscription product."})
    return meta


def _require_bundle(payload_bundle: str) -> None:
    expected = getattr(settings, "IAP_APPLE_BUNDLE_ID", "com.nightcap.app")
    if payload_bundle and payload_bundle != expected:
        raise ValidationError({"purchase_token": "This purchase is for a different app."})


def _require_package(package_name: str) -> None:
    expected = getattr(settings, "IAP_GOOGLE_PACKAGE_NAME", "com.nightcap.app")
    if package_name and package_name != expected:
        raise ValidationError({"purchase_token": "This purchase is for a different app."})


def _decode_jws(token: str, *, verify_signature: bool) -> dict:
    token = (token or "").strip()
    if token.count(".") != 2:
        raise ValidationError({"purchase_token": "Invalid App Store transaction."})
    options = {
        "verify_signature": verify_signature,
        "verify_exp": False,
        "verify_aud": False,
        "verify_iat": False,
    }
    if not verify_signature:
        return jwt.decode(token, options=options, algorithms=["ES256", "HS256", "RS256"])

    header = jwt.get_unverified_header(token)
    x5c = header.get("x5c") or []
    if not x5c:
        raise ValidationError({"purchase_token": "App Store transaction is missing a certificate."})
    try:
        from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
        from cryptography.x509 import load_der_x509_certificate
        import base64

        cert = load_der_x509_certificate(base64.b64decode(x5c[0]))
        public_key = cert.public_key()
        alg = header.get("alg") or "ES256"
        payload = jwt.decode(
            token,
            key=public_key,
            algorithms=[alg],
            options=options,
        )
        _ = public_key.public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
        return payload
    except ValidationError:
        raise
    except Exception as exc:
        logger.warning("Apple JWS verification failed: %s", exc)
        raise ValidationError({"purchase_token": "Could not verify the App Store transaction."}) from exc


def verify_apple_jws(jws: str) -> dict:
    verify = bool(getattr(settings, "IAP_APPLE_VERIFY_SIGNATURE", not settings.DEBUG))
    payload = _decode_jws(jws, verify_signature=verify)
    product_id = payload.get("productId") or payload.get("product_id") or ""
    meta = _plan_for_product(product_id)
    _require_bundle(payload.get("bundleId") or payload.get("bundle_id") or "")
    expires_at = _ms_to_datetime(payload.get("expiresDate") or payload.get("expires_date"))
    if expires_at is None:
        expires_at = datetime.now(dt_timezone.utc) + timedelta(days=meta["period_days"])
    original = str(
        payload.get("originalTransactionId")
        or payload.get("original_transaction_id")
        or payload.get("transactionId")
        or ""
    )
    return {
        "store": Membership.STORE_APPLE,
        "product_id": product_id,
        "plan": meta["plan"],
        "original_transaction_id": original,
        "transaction_id": str(payload.get("transactionId") or original),
        "expires_at": expires_at,
        "auto_renewing": payload.get("type") in (None, "Auto-Renewable Subscription"),
        "purchase_token": jws,
        "environment": payload.get("environment") or "",
    }


def _google_service_account_info() -> dict | None:
    raw = (getattr(settings, "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", "") or "").strip()
    if not raw:
        return None
    path = Path(raw)
    if path.is_file():
        return json.loads(path.read_text())
    return json.loads(raw)


def verify_google_purchase(purchase_token: str, product_id: str, package_name: str = "") -> dict:
    meta = _plan_for_product(product_id)
    package = package_name or getattr(settings, "IAP_GOOGLE_PACKAGE_NAME", "com.nightcap.app")
    _require_package(package)
    token = (purchase_token or "").strip()
    if not token:
        raise ValidationError({"purchase_token": "Missing Google Play purchase token."})

    info = _google_service_account_info()
    if info is None:
        if getattr(settings, "IAP_GOOGLE_ALLOW_UNVERIFIED", False):
            expires_at = datetime.now(dt_timezone.utc) + timedelta(days=meta["period_days"])
            return {
                "store": Membership.STORE_GOOGLE,
                "product_id": product_id,
                "plan": meta["plan"],
                "original_transaction_id": token[:200],
                "transaction_id": token[:200],
                "expires_at": expires_at,
                "auto_renewing": True,
                "purchase_token": token,
                "environment": "unverified",
            }
        raise ValidationError(
            {"purchase_token": "Google Play billing is not configured on the server."}
        )

    try:
        from google.auth.transport.requests import AuthorizedSession
        from google.oauth2 import service_account
    except ImportError as exc:
        raise ValidationError(
            {"purchase_token": "Google Play verification library is not installed."}
        ) from exc

    credentials = service_account.Credentials.from_service_account_info(
        info,
        scopes=["https://www.googleapis.com/auth/androidpublisher"],
    )
    session = AuthorizedSession(credentials)
    url = (
        "https://androidpublisher.googleapis.com/androidpublisher/v3/"
        f"applications/{package}/purchases/subscriptionsv2/tokens/{token}"
    )
    response = session.get(url, timeout=20)
    if response.status_code >= 400:
        logger.warning("Google Play verify failed: %s %s", response.status_code, response.text[:400])
        raise ValidationError({"purchase_token": "Google Play could not verify that subscription."})
    body = response.json()
    line = (body.get("lineItems") or [{}])[0]
    expiry = _ms_to_datetime(line.get("expiryTime") or body.get("expiryTimeMillis"))
    if expiry is None:
        expiry = datetime.now(dt_timezone.utc) + timedelta(days=meta["period_days"])
    offer = line.get("offerDetails") or {}
    store_product = offer.get("basePlanId") or product_id
    if store_product not in PRODUCTS and product_id in PRODUCTS:
        store_product = product_id
    _plan_for_product(product_id)
    original = body.get("latestOrderId") or token[:200]
    return {
        "store": Membership.STORE_GOOGLE,
        "product_id": product_id,
        "plan": meta["plan"],
        "original_transaction_id": str(original),
        "transaction_id": str(body.get("latestOrderId") or original),
        "expires_at": expiry,
        "auto_renewing": (line.get("autoRenewingPlan") or {}).get("autoRenewEnabled", True),
        "purchase_token": token,
        "environment": body.get("testPurchase") and "sandbox" or "production",
    }


def verify_purchase(*, platform: str, purchase_token: str, product_id: str = "", package_name: str = "") -> dict:
    platform = (platform or "").lower().strip()
    if platform in ("ios", "apple"):
        return verify_apple_jws(purchase_token)
    if platform in ("android", "google"):
        return verify_google_purchase(purchase_token, product_id, package_name)
    raise ValidationError({"platform": "platform must be apple or google."})


def decode_apple_notification(signed_payload: str) -> dict:
    verify = bool(getattr(settings, "IAP_APPLE_VERIFY_SIGNATURE", not settings.DEBUG))
    return _decode_jws(signed_payload, verify_signature=verify)
