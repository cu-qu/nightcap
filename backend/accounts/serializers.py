from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import UserProfile

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ("username", "email", "password")

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
        )
        from categories.defaults import create_default_categories_for_user

        create_default_categories_for_user(user)
        return user


class UserSerializer(serializers.ModelSerializer):
    preferred_language = serializers.CharField(required=False)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "email_verified",
            "preferred_language",
            "date_joined",
        )
        read_only_fields = (
            "id",
            "username",
            "email",
            "email_verified",
            "date_joined",
        )

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
        return obj.onboarding_completed_at is not None


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
