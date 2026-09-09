from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, UserProfile


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    inlines = [UserProfileInline]
    list_display = (
        "username",
        "email",
        "email_verified",
        "preferred_language",
        "is_staff",
    )
    list_filter = ("is_staff", "is_superuser", "email_verified")
    fieldsets = BaseUserAdmin.fieldsets + (
        ("NightCap preferences", {"fields": ("preferred_language",)}),
    )


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "preferred_language")
