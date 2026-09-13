from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

from accounts.memberships import is_entitled

MEMBERSHIP_ENDED_DETAIL = (
    "Your NightCap membership has ended. Subscribe to keep using the app."
)


class HasActiveMembership(BasePermission):
    """Require a current trial, store, complimentary, or staff entitlement."""

    message = MEMBERSHIP_ENDED_DETAIL

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            return False
        if is_entitled(user):
            return True
        raise PermissionDenied(detail=self.message)
