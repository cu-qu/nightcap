from django.contrib import admin

from .models import Goal, GoalTemplate


@admin.register(Goal)
class GoalAdmin(admin.ModelAdmin):
    list_display = (
        "display_name",
        "user",
        "category",
        "period",
        "direction",
        "target_value",
        "scope",
        "accepted",
        "is_active",
    )
    list_filter = ("period", "direction", "scope", "accepted", "is_active")
    search_fields = ("name", "user__username", "category__name")


@admin.register(GoalTemplate)
class GoalTemplateAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "slug",
        "group",
        "audience",
        "suggested_scope",
        "category_name",
        "category_unit",
        "period",
        "direction",
        "target_value",
        "is_active",
        "sort_order",
    )
    list_filter = ("group", "audience", "suggested_scope", "period", "direction", "is_active")
    search_fields = ("title", "slug", "category_name", "description")
    prepopulated_fields = {"slug": ("title",)}
    ordering = ("group", "sort_order", "title")
