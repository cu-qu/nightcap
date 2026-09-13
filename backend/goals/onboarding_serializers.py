from rest_framework import serializers

from accounts.models import UserProfile
from goals.models import Goal, GoalTemplate


class GoalTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = GoalTemplate
        fields = (
            "slug",
            "title",
            "description",
            "example_entry_label",
            "category_name",
            "category_type",
            "category_icon",
            "category_emoji",
            "category_unit",
            "category_group_key",
            "period",
            "direction",
            "target_value",
            "warn_at_percent",
            "group",
            "audience",
            "suggested_scope",
            "suggest_solo",
            "suggest_couple",
            "sort_order",
        )


class OnboardingTemplateSelectionSerializer(serializers.Serializer):
    slug = serializers.SlugField()
    target_value = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        help_text="Optional override of the template default target.",
    )
    scope = serializers.ChoiceField(
        choices=Goal.SCOPE_CHOICES,
        required=False,
        help_text="personal = just me, shared = together. Couple mode only.",
    )
    period = serializers.ChoiceField(
        choices=[
            (Goal.PERIOD_DAILY, "Daily"),
            (Goal.PERIOD_WEEKLY, "Weekly"),
            (Goal.PERIOD_MONTHLY, "Monthly"),
        ],
        required=False,
        help_text="Override the template period. Weekly spend caps roll up as 4× in monthly tracking.",
    )


class OnboardingApplySerializer(serializers.Serializer):
    templates = OnboardingTemplateSelectionSerializer(many=True, min_length=1)
    mark_complete = serializers.BooleanField(
        default=False,
        help_text="Set true to mark onboarding complete after applying templates.",
    )

    def validate_templates(self, value):
        slugs = [item["slug"] for item in value]
        found = set(
            GoalTemplate.objects.filter(slug__in=slugs, is_active=True).values_list(
                "slug", flat=True
            )
        )
        missing = [slug for slug in slugs if slug not in found]
        if missing:
            raise serializers.ValidationError(f"Unknown or inactive templates: {missing}")
        return value


class OnboardingSetupSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=UserProfile.MODE_CHOICES)
    templates = OnboardingTemplateSelectionSerializer(many=True, required=False)
    invite_email = serializers.EmailField(required=False, allow_blank=True)
    approve_together = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        help_text="UUIDs of Together goals this user is approving.",
    )
    mark_complete = serializers.BooleanField(default=True)

    def validate_templates(self, value):
        if not value:
            return value
        slugs = [item["slug"] for item in value]
        found = set(
            GoalTemplate.objects.filter(slug__in=slugs, is_active=True).values_list(
                "slug", flat=True
            )
        )
        missing = [slug for slug in slugs if slug not in found]
        if missing:
            raise serializers.ValidationError(f"Unknown or inactive templates: {missing}")
        return value


class OnboardingStatusSerializer(serializers.Serializer):
    onboarding_completed = serializers.BooleanField()
    onboarding_completed_at = serializers.DateTimeField(allow_null=True)
    tracking_mode = serializers.CharField()
    active_goal_count = serializers.IntegerField()
    available_template_count = serializers.IntegerField()
    inherited_shared_templates = serializers.ListField(child=serializers.CharField())
    together_goals = serializers.ListField(child=serializers.JSONField())
    partnership = serializers.JSONField(allow_null=True)
