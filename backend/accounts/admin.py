from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils import timezone

from accounts.memberships import grant_complimentary_membership, revoke_complimentary_membership
from .models import Membership, Partnership, PartnershipInvite, PartnershipMember, User, UserProfile


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False


class PartnershipMembershipInline(admin.StackedInline):
    model = Membership
    fk_name = "partnership"
    extra = 0
    max_num = 1
    can_delete = False
    readonly_fields = ("created_at", "updated_at", "granted_at")


@admin.action(description="Grant complimentary membership")
def grant_complimentary_action(modeladmin, request, queryset):
    for user in queryset:
        grant_complimentary_membership(
            user,
            granted_by=request.user,
            note="Granted from admin",
        )


@admin.action(description="Revoke complimentary membership")
def revoke_complimentary_action(modeladmin, request, queryset):
    for user in queryset:
        revoke_complimentary_membership(user)


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
    actions = [grant_complimentary_action, revoke_complimentary_action]
    fieldsets = BaseUserAdmin.fieldsets + (
        ("NightCap preferences", {"fields": ("preferred_language",)}),
    )


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "preferred_language", "tracking_mode", "onboarding_completed_at")


@admin.action(description="Grant complimentary membership to this couple")
def grant_couple_complimentary(modeladmin, request, queryset):
    for partnership in queryset:
        owner = partnership.members.select_related("user").order_by("joined_at").first()
        if owner is None:
            continue
        grant_complimentary_membership(
            owner.user,
            granted_by=request.user,
            note="Granted from partnership admin",
        )


@admin.register(Partnership)
class PartnershipAdmin(admin.ModelAdmin):
    inlines = [PartnershipMembershipInline]
    list_display = ("invite_code", "created_by", "created_at")
    search_fields = ("invite_code", "created_by__username")
    actions = [grant_couple_complimentary]


@admin.register(PartnershipMember)
class PartnershipMemberAdmin(admin.ModelAdmin):
    list_display = ("user", "partnership", "role", "joined_at")
    list_filter = ("role",)


@admin.register(PartnershipInvite)
class PartnershipInviteAdmin(admin.ModelAdmin):
    list_display = ("email", "partnership", "invited_by", "created_at", "accepted_at")
    search_fields = ("email",)


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "owner_label",
        "status_label",
        "plan",
        "complimentary",
        "trial_ends_at",
        "store_expires_at",
        "updated_at",
    )
    list_filter = ("complimentary", "plan", "store")
    search_fields = (
        "user__username",
        "user__email",
        "partnership__invite_code",
        "original_transaction_id",
        "grant_note",
    )
    readonly_fields = ("created_at", "updated_at", "granted_at")
    raw_id_fields = ("user", "partnership", "granted_by", "purchased_by")
    actions = ["grant_forever", "revoke_complimentary"]

    @admin.display(description="Owner")
    def owner_label(self, obj):
        if obj.partnership_id:
            return f"Couple {obj.partnership.invite_code}"
        return obj.user.username if obj.user_id else "—"

    @admin.display(description="Status")
    def status_label(self, obj):
        from accounts.memberships import membership_status

        return membership_status(obj)

    @admin.action(description="Grant complimentary (no expiry)")
    def grant_forever(self, request, queryset):
        now = timezone.now()
        queryset.update(
            complimentary=True,
            complimentary_until=None,
            granted_at=now,
            grant_note="Granted from membership admin",
        )

    @admin.action(description="Revoke complimentary")
    def revoke_complimentary(self, request, queryset):
        queryset.update(
            complimentary=False,
            complimentary_until=None,
            granted_by=None,
            granted_at=None,
            grant_note="",
        )