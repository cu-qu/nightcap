from rest_framework import serializers

from .models import GoalTemplate


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
            "period",
            "direction",
            "target_value",
            "warn_at_percent",
            "group",
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


class OnboardingStatusSerializer(serializers.Serializer):
    onboarding_completed = serializers.BooleanField()
    onboarding_completed_at = serializers.DateTimeField(allow_null=True)
    active_goal_count = serializers.IntegerField()
    available_template_count = serializers.IntegerField()
