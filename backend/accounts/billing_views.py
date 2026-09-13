from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.iap import decode_apple_notification, serialize_catalog, verify_purchase
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
            "plus the $2/month and $10/year product catalog. One subscription covers both partners."
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
            return Response({"detail": "Invalid notification."}, status=status.HTTP_400_BAD_REQUEST)

        renewal = payload.get("data") or payload
        signed_txn = (
            (renewal.get("signedTransactionInfo") if isinstance(renewal, dict) else None)
            or payload.get("signedTransactionInfo")
        )
        if not signed_txn:
            return Response({"ok": True})

        from accounts.iap import verify_apple_jws

        try:
            purchase = verify_apple_jws(signed_txn)
        except Exception:
            return Response({"ok": True})

        notification_type = payload.get("notificationType") or ""
        updates = {
            "store_expires_at": purchase["expires_at"],
            "auto_renewing": purchase.get("auto_renewing", True),
            "product_id": purchase["product_id"],
            "plan": purchase["plan"],
            "latest_transaction_id": purchase.get("transaction_id") or "",
        }
        if notification_type in {"EXPIRED", "REFUND", "REVOKE"}:
            updates["auto_renewing"] = False
        apply_store_notification(purchase["original_transaction_id"], updates)
        return Response({"ok": True})
