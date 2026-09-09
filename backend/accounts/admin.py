from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import Partnership, PartnershipInvite, PartnershipMember, User, UserProfile


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
    list_display = ("user", "preferred_language", "tracking_mode", "onboarding_completed_at")


@admin.register(Partnership)
class PartnershipAdmin(admin.ModelAdmin):
    list_display = ("invite_code", "created_by", "created_at")
    search_fields = ("invite_code", "created_by__username")


@admin.register(PartnershipMember)
class PartnershipMemberAdmin(admin.ModelAdmin):
    list_display = ("user", "partnership", "role", "joined_at")
    list_filter = ("role",)


@admin.register(PartnershipInvite)
class PartnershipInviteAdmin(admin.ModelAdmin):
    list_display = ("email", "partnership", "invited_by", "created_at", "accepted_at")
    search_fields = ("email",)
