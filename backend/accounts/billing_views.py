import logging

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.iap import (
    decode_apple_notification,
    serialize_catalog,
    updates_from_apple_notification,
    verify_purchase,
)

logger = logging.getLogger(__name__)
from accounts.memberships import (
    apply_store_notification,
    apply_verified_purchase,
    ensure_user_membership,
    serialize_membership,
)
from accounts.serializers import BillingVerifySerializer


class BillingView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Billing"],
        summary="Membership and subscription products",
        description=(
            "Returns the caller's couple membership (trial, store, complimentary, or expired) "
            "plus the $3/month and $15/year product catalog. One subscription covers both partners."
        ),
    )
    def get(self, request):
        membership = ensure_user_membership(request.user)
        return Response(
            {
                "membership": serialize_membership(membership, user=request.user),
                "products": serialize_catalog(),
            }
        )


class BillingVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Billing"],
        summary="Verify an App Store or Play purchase",
        description=(
            "Sends the StoreKit 2 JWS (iOS) or Play Billing purchase token (Android). "
            "On success the couple space is entitled until the store expiry."
        ),
        request=BillingVerifySerializer,
    )
    def post(self, request):
        serializer = BillingVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        purchase = verify_purchase(
            platform=data["platform"],
            purchase_token=data["purchase_token"],
            product_id=data.get("product_id") or "",
            package_name=data.get("package_name") or "",
        )
        membership = apply_verified_purchase(request.user, purchase)
        return Response({"membership": serialize_membership(membership, user=request.user)})


class AppleNotificationView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        tags=["Billing"],
        summary="App Store Server Notification V2",
        description="Webhook for renewals, refunds, and expirations. Configure this URL in App Store Connect.",
    )
    def post(self, request):
        signed = request.data.get("signedPayload") or ""
        if not signed:
            return Response({"detail": "Missing signedPayload."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            payload = decode_apple_notification(signed)
        except Exception:
            logger.warning("Rejected an App Store notification with a bad signature.")
            return Response({"detail": "Invalid notification."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            updates = updates_from_apple_notification(payload)
        except ValidationError as exc:
            logger.warning("Ignored an App Store notification: %s", exc.detail)
            return Response({"ok": True})
        except Exception:
            logger.exception("Could not read an App Store notification.")
            return Response({"detail": "Invalid notification."}, status=status.HTTP_400_BAD_REQUEST)

        if not updates:
            return Response({"ok": True})

        original = updates.pop("original_transaction_id")
        membership = apply_store_notification(original, updates)
        if membership is None:
            logger.info(
                "App Store notification %s did not match a NightCap membership.",
                payload.get("notificationType") or "unknown",
            )
        return Response({"ok": True})
