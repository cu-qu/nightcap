from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import GoalTemplate
from .onboarding_serializers import (
    GoalTemplateSerializer,
    OnboardingApplySerializer,
    OnboardingStatusSerializer,
)
from .onboarding_services import (
    apply_goal_templates,
    complete_onboarding,
    get_onboarding_status,
)
from .serializers import GoalSerializer


class OnboardingTemplateListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Onboarding"],
        summary="List starter goal templates",
        description=(
            "Returns curated goals users can copy during onboarding, grouped for finance, "
            "fitness, and habits. Edit templates in Django admin."
        ),
        responses={200: GoalTemplateSerializer(many=True)},
    )
    def get(self, request):
        templates = GoalTemplate.objects.filter(is_active=True)
        group = request.query_params.get("group")
        if group:
            templates = templates.filter(group=group)
        serializer = GoalTemplateSerializer(templates, many=True)
        grouped = {}
        for item in serializer.data:
            grouped.setdefault(item["group"], []).append(item)
        return Response({"templates": serializer.data, "by_group": grouped})


class OnboardingApplyView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Onboarding"],
        summary="Apply starter goal templates",
        description=(
            "Creates or updates categories and goals from selected templates. "
            "Users can override `target_value` per template before copying."
        ),
        request=OnboardingApplySerializer,
        responses={200: GoalSerializer(many=True)},
    )
    def post(self, request):
        serializer = OnboardingApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = apply_goal_templates(request.user, serializer.validated_data["templates"])
        if serializer.validated_data.get("mark_complete"):
            complete_onboarding(request.user)
        goals = result["created_goals"] + result["updated_goals"]
        return Response(
            {
                "created_goal_count": len(result["created_goals"]),
                "updated_goal_count": len(result["updated_goals"]),
                "created_category_count": len(result["created_categories"]),
                "goals": GoalSerializer(goals, many=True, context={"request": request}).data,
                "onboarding": get_onboarding_status(request.user),
            }
        )


class OnboardingStatusView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Onboarding"],
        summary="Onboarding status",
        responses={200: OnboardingStatusSerializer},
    )
    def get(self, request):
        return Response(get_onboarding_status(request.user))


class OnboardingCompleteView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Onboarding"],
        summary="Mark onboarding complete",
        request=None,
        responses={200: OnboardingStatusSerializer},
    )
    def post(self, request):
        complete_onboarding(request.user)
        return Response(get_onboarding_status(request.user))
