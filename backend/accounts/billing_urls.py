from django.urls import path

from .billing_views import AppleNotificationView, BillingVerifyView, BillingView

urlpatterns = [
    path("billing/", BillingView.as_view(), name="billing"),
    path("billing/verify/", BillingVerifyView.as_view(), name="billing-verify"),
    path(
        "billing/apple-notifications/",
        AppleNotificationView.as_view(),
        name="billing-apple-notifications",
    ),
]
