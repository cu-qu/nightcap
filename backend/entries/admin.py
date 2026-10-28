from django.contrib import admin

from .models import DayReflection, Entry, MonthlyRecap, NightCap


@admin.register(MonthlyRecap)
class MonthlyRecapAdmin(admin.ModelAdmin):
    list_display = ("year", "month", "partnership", "user", "generated_at", "notified_at")
    list_filter = ("year", "month")
    search_fields = ("user__username", "user__email", "partnership__invite_code")
    readonly_fields = ("generated_at", "notified_at")


@admin.register(NightCap)
class NightCapAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "date",
        "mood",
        "status",
        "has_favorite_photo",
        "completed_at",
        "uuid",
        "updated_at",
    )
    list_filter = ("status", "date")
    search_fields = (
        "user__username",
        "user__email",
        "uuid",
        "reflection",
        "favorite_moment",
        "mood",
    )
    readonly_fields = ("uuid", "has_favorite_photo", "created_at", "updated_at")
    fields = (
        "user",
        "date",
        "mood",
        "status",
        "reflection",
        "favorite_moment",
        "favorite_photo",
        "has_favorite_photo",
        "completed_at",
        "uuid",
        "created_at",
        "updated_at",
    )

    @admin.display(boolean=True, description="Photo")
    def has_favorite_photo(self, obj):
        return bool(obj.favorite_photo)


@admin.register(Entry)
class EntryAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "date",
        "category",
        "amount",
        "quantity",
        "completed_with",
        "nightcap",
        "uuid",
        "updated_at",
    )
    list_filter = ("date", "category__type", "completed_with")
    search_fields = (
        "user__username",
        "user__email",
        "category__name",
        "uuid",
        "value",
        "notes",
    )
    readonly_fields = ("uuid",)


@admin.register(DayReflection)
class DayReflectionAdmin(admin.ModelAdmin):
    list_display = ("user", "date", "updated_at")
    list_filter = ("date",)
    search_fields = ("user__username", "user__email", "reflection")
