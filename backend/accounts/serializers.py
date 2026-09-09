from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import UserProfile

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    invite_code = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        help_text="Optional partner invite code from NightCap.",
    )

    class Meta:
        model = User
        fields = ("username", "email", "password", "invite_code")

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate_invite_code(self, value):
        code = (value or "").strip().upper().replace(" ", "").replace("-", "")
        if not code:
            return ""
        from accounts.models import Partnership

        if not Partnership.objects.filter(invite_code=code).exists():
            raise serializers.ValidationError("That invite code is invalid.")
        partnership = Partnership.objects.get(invite_code=code)
        if partnership.members.count() >= 2:
            raise serializers.ValidationError("This couple already has two people.")
        return code

    def create(self, validated_data):
        invite_code = validated_data.pop("invite_code", "") or ""
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
        )
        from categories.defaults import create_default_categories_for_user

        create_default_categories_for_user(user)
        if invite_code:
            from accounts.partnerships import accept_invite_code

            accept_invite_code(user, invite_code)
        return user


class UserSerializer(serializers.ModelSerializer):
    preferred_language = serializers.CharField(required=False)
    onboarding_completed = serializers.SerializerMethodField()
    tracking_mode = serializers.SerializerMethodField()
    partnership = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "email_verified",
            "preferred_language",
            "onboarding_completed",
            "tracking_mode",
            "partnership",
            "date_joined",
        )
        read_only_fields = (
            "id",
            "username",
            "email",
            "email_verified",
            "onboarding_completed",
            "tracking_mode",
            "partnership",
            "date_joined",
        )

    def _profile(self, obj):
        return getattr(obj, "profile", None)

    def get_onboarding_completed(self, obj) -> bool:
        profile = self._profile(obj)
        if profile and profile.onboarding_completed_at is not None:
            return True
        from goals.models import Goal

        return Goal.objects.filter(user=obj, is_active=True).exists()

    def get_tracking_mode(self, obj) -> str:
        profile = self._profile(obj)
        return profile.tracking_mode if profile else UserProfile.MODE_SOLO

    def get_partnership(self, obj):
        from accounts.partnerships import get_user_partnership, serialize_partnership

        return serialize_partnership(get_user_partnership(obj))

    def update(self, instance, validated_data):
        pref_lang = validated_data.pop("preferred_language", None)
        if pref_lang is not None:
            instance.preferred_language = pref_lang
            instance.save(update_fields=["preferred_language"])
            if hasattr(instance, "profile"):
                instance.profile.preferred_language = pref_lang
                instance.profile.save(update_fields=["preferred_language"])
        return instance


class UserProfileSerializer(serializers.ModelSerializer):
    onboarding_completed = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = (
            "preferred_language",
            "tracking_mode",
            "onboarding_completed",
            "onboarding_completed_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "onboarding_completed",
            "onboarding_completed_at",
            "created_at",
            "updated_at",
        )

    def get_onboarding_completed(self, obj) -> bool:
        if obj.onboarding_completed_at is not None:
            return True
        from goals.models import Goal

        return Goal.objects.filter(user=obj.user, is_active=True).exists()


class PartnershipInviteSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False, allow_blank=True)


class PartnershipJoinSerializer(serializers.Serializer):
    invite_code = serializers.CharField()


class MessageSerializer(serializers.Serializer):
    detail = serializers.CharField()


class EmailVerifiedSerializer(serializers.Serializer):
    detail = serializers.CharField()
    email_verified = serializers.BooleanField(required=False)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_new_password(self, value):
        validate_password(value)
        return value
