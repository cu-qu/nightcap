from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import UserProfile
from goals.models import GoalTemplate
from goals.onboarding_serializers import (
    GoalTemplateSerializer,
    OnboardingApplySerializer,
    OnboardingSetupSerializer,
    OnboardingStatusSerializer,
)
from goals.onboarding_services import (
    apply_goal_templates,
    complete_onboarding,
    get_onboarding_status,
    setup_onboarding,
)
from goals.serializers import GoalSerializer


class OnboardingTemplateListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Onboarding"],
        summary="List starter goal templates",
        description=(
            "Curated goals for onboarding, grouped as finance, fitness, and habit. "
            "Pass `mode=solo` or `mode=couple` to hide couple-only or personal-only rows."
        ),
        parameters=[
            OpenApiParameter(
                name="mode",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                enum=["solo", "couple"],
            ),
            OpenApiParameter(
                name="group",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                enum=["finance", "fitness", "habit"],
            ),
        ],
        responses={200: GoalTemplateSerializer(many=True)},
    )
    def get(self, request):
        templates = GoalTemplate.objects.filter(is_active=True)
        group = request.query_params.get("group")
        if group:
            templates = templates.filter(group=group)
        mode = request.query_params.get("mode")
        if mode == UserProfile.MODE_SOLO:
            templates = templates.exclude(audience=GoalTemplate.AUDIENCE_COUPLE)
        elif mode == UserProfile.MODE_COUPLE:
            templates = templates.exclude(audience=GoalTemplate.AUDIENCE_PERSONAL)
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
        from accounts.partnerships import get_user_partnership

        partnership = get_user_partnership(request.user)
        result = apply_goal_templates(
            request.user,
            serializer.validated_data["templates"],
            partnership=partnership,
        )
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


class OnboardingSetupView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Onboarding"],
        summary="Finish onboarding in one step",
        description=(
            "Saves tracking mode (solo vs couple), optionally creates a couple space "
            "and emails an invite, applies selected goal templates with personal or "
            "shared scope, and marks onboarding complete."
        ),
        request=OnboardingSetupSerializer,
    )
    def post(self, request):
        serializer = OnboardingSetupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = setup_onboarding(
            request.user,
            mode=data["mode"],
            templates=list(data.get("templates") or []),
            invite_email=data.get("invite_email") or "",
        )
        goals = result["created_goals"] + result["updated_goals"]
        return Response(
            {
                "created_goal_count": len(result["created_goals"]),
                "updated_goal_count": len(result["updated_goals"]),
                "created_category_count": len(result["created_categories"]),
                "email_sent": result["email_sent"],
                "partnership": result["partnership"],
                "goals": GoalSerializer(goals, many=True, context={"request": request}).data,
                "onboarding": result["onboarding"],
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
