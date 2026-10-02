from django.urls import path

from .partnership_views import (
    DevicePushTokenView,
    PartnershipInviteView,
    PartnershipJoinView,
    PartnershipLeaveView,
    PartnershipNudgeView,
    PartnershipRegenerateCodeView,
    PartnershipView,
)

urlpatterns = [
    path("partnership/", PartnershipView.as_view(), name="partnership"),
    path("partnership/invite/", PartnershipInviteView.as_view(), name="partnership-invite"),
    path("partnership/join/", PartnershipJoinView.as_view(), name="partnership-join"),
    path("partnership/leave/", PartnershipLeaveView.as_view(), name="partnership-leave"),
    path(
        "partnership/regenerate-code/",
        PartnershipRegenerateCodeView.as_view(),
        name="partnership-regenerate-code",
    ),
    path("partnership/nudge/", PartnershipNudgeView.as_view(), name="partnership-nudge"),
    path("devices/push-token/", DevicePushTokenView.as_view(), name="device-push-token"),
]
