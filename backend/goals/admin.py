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
        "is_active",
    )
    list_filter = ("period", "direction", "is_active")
    search_fields = ("name", "user__username", "category__name")


@admin.register(GoalTemplate)
class GoalTemplateAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "slug",
        "group",
        "category_name",
        "period",
        "direction",
        "target_value",
        "is_active",
        "sort_order",
    )
    list_filter = ("group", "period", "direction", "is_active")
    search_fields = ("title", "slug", "category_name", "description")
    prepopulated_fields = {"slug": ("title",)}
    ordering = ("group", "sort_order", "title")
