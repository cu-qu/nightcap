from django.conf import settings
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

from accounts.memberships import is_entitled

MEMBERSHIP_ENDED_DETAIL = (
    "Your NightCap membership has ended. Subscribe to keep using the app."
)
EMAIL_UNVERIFIED_DETAIL = "Confirm your email before using NightCap."


class HasActiveMembership(BasePermission):
    """Require a confirmed email and a current trial, store, or complimentary membership."""

    message = MEMBERSHIP_ENDED_DETAIL

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            return False
        if _email_unverified(user):
            raise PermissionDenied(detail=EMAIL_UNVERIFIED_DETAIL)
        if is_entitled(user):
            return True
        raise PermissionDenied(detail=self.message)


def _email_unverified(user) -> bool:
    if not getattr(settings, "EMAIL_VERIFICATION_REQUIRED", True):
        return False
    if getattr(user, "is_staff", False):
        return False
    return not getattr(user, "email_verified", False)
