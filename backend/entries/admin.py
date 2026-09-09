from django.contrib import admin

from .models import DayReflection, Entry, NightCap


@admin.register(NightCap)
class NightCapAdmin(admin.ModelAdmin):
    list_display = ("user", "date", "mood", "status", "completed_at", "uuid", "updated_at")
    list_filter = ("status", "date")
    search_fields = ("user__username", "user__email", "uuid", "reflection", "mood")
    readonly_fields = ("uuid",)


@admin.register(Entry)
class EntryAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "date",
        "category",
        "amount",
        "quantity",
        "nightcap",
        "uuid",
        "updated_at",
    )
    list_filter = ("date", "category__type")
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
