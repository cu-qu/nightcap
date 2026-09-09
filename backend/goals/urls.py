from django.urls import path
from rest_framework.routers import DefaultRouter

from .onboarding_views import (
    OnboardingApplyView,
    OnboardingCompleteView,
    OnboardingStatusView,
    OnboardingTemplateListView,
)
from .views import GoalViewSet

router = DefaultRouter()
router.register("goals", GoalViewSet, basename="goal")

urlpatterns = [
    path("onboarding/templates/", OnboardingTemplateListView.as_view(), name="onboarding-templates"),
    path("onboarding/apply/", OnboardingApplyView.as_view(), name="onboarding-apply"),
    path("onboarding/status/", OnboardingStatusView.as_view(), name="onboarding-status"),
    path("onboarding/complete/", OnboardingCompleteView.as_view(), name="onboarding-complete"),
]
urlpatterns += router.urls
