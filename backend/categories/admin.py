from django.contrib import admin

from .models import CategoryGroup, TrackingCategory


@admin.register(CategoryGroup)
class CategoryGroupAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "key",
        "user",
        "sort_order",
        "show_in_ritual",
        "is_default",
        "updated_at",
    )
    list_filter = ("show_in_ritual", "is_default")
    search_fields = ("name", "key", "user__username", "user__email", "uuid")
    readonly_fields = ("uuid",)


@admin.register(TrackingCategory)
class TrackingCategoryAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "emoji",
        "group",
        "type",
        "metric_kind",
        "unit",
        "user",
        "is_default",
        "uuid",
        "updated_at",
    )
    list_filter = ("type", "metric_kind", "is_default", "group")
    search_fields = ("name", "user__username", "user__email", "uuid")
    readonly_fields = ("uuid",)
