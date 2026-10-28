from django.urls import path

from .partnership_views import (
    DevicePushTokenView,
    PartnershipBlockView,
    PartnershipInviteView,
    PartnershipJoinView,
    PartnershipLeaveView,
    PartnershipNudgeView,
    PartnershipReportView,
    PartnershipRegenerateCodeView,
    PartnershipView,
)

urlpatterns = [
    path("partnership/", PartnershipView.as_view(), name="partnership"),
    path("partnership/invite/", PartnershipInviteView.as_view(), name="partnership-invite"),
    path("partnership/join/", PartnershipJoinView.as_view(), name="partnership-join"),
    path("partnership/leave/", PartnershipLeaveView.as_view(), name="partnership-leave"),
    path("partnership/report/", PartnershipReportView.as_view(), name="partnership-report"),
    path("partnership/block/", PartnershipBlockView.as_view(), name="partnership-block"),
    path(
        "partnership/regenerate-code/",
        PartnershipRegenerateCodeView.as_view(),
        name="partnership-regenerate-code",
    ),
    path("partnership/nudge/", PartnershipNudgeView.as_view(), name="partnership-nudge"),
    path("devices/push-token/", DevicePushTokenView.as_view(), name="device-push-token"),
]
