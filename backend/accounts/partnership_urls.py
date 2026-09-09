from django.urls import path

from .partnership_views import (
    PartnershipInviteView,
    PartnershipJoinView,
    PartnershipRegenerateCodeView,
    PartnershipView,
)

urlpatterns = [
    path("partnership/", PartnershipView.as_view(), name="partnership"),
    path("partnership/invite/", PartnershipInviteView.as_view(), name="partnership-invite"),
    path("partnership/join/", PartnershipJoinView.as_view(), name="partnership-join"),
    path(
        "partnership/regenerate-code/",
        PartnershipRegenerateCodeView.as_view(),
        name="partnership-regenerate-code",
    ),
]
