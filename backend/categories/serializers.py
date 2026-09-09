from rest_framework import serializers

from .models import CategoryGroup, TrackingCategory, default_metric_for_type


class TrackingCategorySerializer(serializers.ModelSerializer):
    group_uuid = serializers.UUIDField(source="group.uuid", read_only=True, allow_null=True)
    group_key = serializers.CharField(source="group.key", read_only=True, allow_null=True)

    class Meta:
        model = TrackingCategory
        fields = (
            "id",
            "uuid",
            "group",
            "group_uuid",
            "group_key",
            "name",
            "type",
            "metric_kind",
            "unit",
            "icon",
            "emoji",
            "sort_order",
            "is_default",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "uuid",
            "group_uuid",
            "group_key",
            "is_default",
            "created_at",
            "updated_at",
        )

    def validate_group(self, value):
        request = self.context.get("request")
        if value is None:
            return value
        if request and value.user_id != request.user.id:
            raise serializers.ValidationError("Group does not belong to this user.")
        return value

    def validate_emoji(self, value):
        if value is None:
            return ""
        value = str(value).strip()
        if len(value) > 16:
            raise serializers.ValidationError("Emoji must be 16 characters or fewer.")
        return value

    def validate(self, attrs):
        category_type = attrs.get("type", getattr(self.instance, "type", TrackingCategory.CUSTOM))
        if "metric_kind" not in attrs and not self.instance:
            metric_kind, unit = default_metric_for_type(category_type)
            attrs["metric_kind"] = metric_kind
            if "unit" not in attrs:
                attrs["unit"] = unit
        elif "unit" not in attrs and not getattr(self.instance, "unit", None):
            _, unit = default_metric_for_type(category_type)
            attrs["unit"] = unit
        return attrs


class CategoryGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = CategoryGroup
        fields = (
            "id",
            "uuid",
            "name",
            "key",
            "sort_order",
            "icon",
            "show_in_ritual",
            "is_default",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "uuid", "is_default", "created_at", "updated_at")


class CategoryGroupDetailSerializer(CategoryGroupSerializer):
    categories = TrackingCategorySerializer(many=True, read_only=True)

    class Meta(CategoryGroupSerializer.Meta):
        fields = CategoryGroupSerializer.Meta.fields + ("categories",)


class RitualCategoryGroupSerializer(serializers.ModelSerializer):
    """Groups configured for the NightCap ritual UI, with nested categories."""

    categories = serializers.SerializerMethodField()

    class Meta:
        model = CategoryGroup
        fields = (
            "id",
            "uuid",
            "name",
            "key",
            "sort_order",
            "icon",
            "show_in_ritual",
            "categories",
        )

    def get_categories(self, obj):
        qs = obj.categories.all().order_by("sort_order", "name")
        return TrackingCategorySerializer(qs, many=True, context=self.context).data
