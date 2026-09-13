from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import HasActiveMembership

from accounts.partnerships import (
    accept_invite_code,
    ensure_partnership,
    get_user_partnership,
    leave_partnership,
    regenerate_invite_code,
    send_partner_invite,
    serialize_partnership,
)
from accounts.serializers import MessageSerializer, PartnershipInviteSerializer, PartnershipJoinSerializer


class PartnershipView(APIView):
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.request.method == "GET":
            return [IsAuthenticated()]
        return [IsAuthenticated(), HasActiveMembership()]

    @extend_schema(
        tags=["Partnership"],
        summary="Current couple space",
        description="Returns the caller's partnership, or `{ partnership: null }` if none.",
    )
    def get(self, request):
        return Response({"partnership": serialize_partnership(get_user_partnership(request.user))})

    @extend_schema(
        tags=["Partnership"],
        summary="Create couple space",
        description="Creates a partnership and invite code if the user does not already have one.",
    )
    def post(self, request):
        partnership = ensure_partnership(request.user)
        return Response({"partnership": serialize_partnership(partnership)}, status=status.HTTP_201_CREATED)


class PartnershipInviteView(APIView):
    permission_classes = [IsAuthenticated, HasActiveMembership]

    @extend_schema(
        tags=["Partnership"],
        summary="Invite a partner",
        description=(
            "Ensures a couple space exists and returns the share code. "
            "If `email` is provided, also sends an invite email."
        ),
        request=PartnershipInviteSerializer,
    )
    def post(self, request):
        serializer = PartnershipInviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        partnership = ensure_partnership(request.user)
        email = serializer.validated_data.get("email") or ""
        email_sent = False
        if email:
            try:
                send_partner_invite(partnership, request.user, email)
                email_sent = True
            except Exception:
                email_sent = False
        return Response(
            {
                "partnership": serialize_partnership(partnership),
                "email_sent": email_sent,
            }
        )


class PartnershipJoinView(APIView):
    permission_classes = [IsAuthenticated, HasActiveMembership]

    @extend_schema(
        tags=["Partnership"],
        summary="Join with invite code",
        request=PartnershipJoinSerializer,
    )
    def post(self, request):
        serializer = PartnershipJoinSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        partnership = accept_invite_code(request.user, serializer.validated_data["invite_code"])
        return Response({"partnership": serialize_partnership(partnership)})


class PartnershipLeaveView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Partnership"],
        summary="Unlink from couple space",
        description=(
            "Leaves the current partnership. Together goals become personal. "
            "If a partner remains, they keep the couple space with a new invite code."
        ),
        request=None,
        responses={200: MessageSerializer},
    )
    def post(self, request):
        leave_partnership(request.user)
        return Response({"partnership": None})


class PartnershipRegenerateCodeView(APIView):
    permission_classes = [IsAuthenticated, HasActiveMembership]

    @extend_schema(
        tags=["Partnership"],
        summary="Regenerate invite code",
        request=None,
        responses={200: MessageSerializer},
    )
    def post(self, request):
        partnership = get_user_partnership(request.user)
        if partnership is None:
            return Response(
                {"detail": "Create a couple space first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        regenerate_invite_code(partnership)
        return Response({"partnership": serialize_partnership(partnership)})
