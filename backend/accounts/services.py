import logging

from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from .emails import PasswordResetEmail, VerifyAccountEmail

logger = logging.getLogger(__name__)


class PasswordResetError(Exception):
    """The reset link is missing, invalid, or expired."""


def send_verification_email(user, *, verification_url: str | None = None) -> None:
    """
    Generate a fresh verification token, persist it, and send the verification email.
    Logs and swallows errors so callers (e.g. registration) are not blocked by mail outages.
    """
    try:
        user.regenerate_email_verification_token()
        token = user.email_verification_token
        VerifyAccountEmail(user, token, verification_url=verification_url).send()
    except Exception:
        logger.exception(
            "Failed to send verification email for user_id=%s email=%s",
            getattr(user, "pk", None),
            getattr(user, "email", None),
        )


def verify_email_token(token: str) -> bool:
    """Mark the matching account verified. Returns False for a bad or used token."""
    token = (token or "").strip()
    if not token:
        return False
    User = get_user_model()
    updated = User.objects.filter(
        email_verification_token=token, email_verified=False
    ).update(email_verified=True, email_verification_token="")
    return bool(updated)


def confirm_password_reset(*, uid: str, token: str, new_password: str):
    """Set a new password from the uid and token in a reset email."""
    User = get_user_model()
    try:
        user_id = force_str(urlsafe_base64_decode(uid))
        user = User.objects.get(pk=user_id, is_active=True)
    except (User.DoesNotExist, ValueError, TypeError, OverflowError) as exc:
        raise PasswordResetError("Invalid or expired reset link.") from exc
    if not default_token_generator.check_token(user, token):
        raise PasswordResetError("Invalid or expired reset link.")
    user.set_password(new_password)
    user.save(update_fields=["password"])
    return user


def send_password_reset_email(user, *, reset_url: str | None = None) -> None:
    """Send password reset link (Django PasswordResetTokenGenerator). Logs failures."""
    try:
        uid = urlsafe_base64_encode(force_bytes(str(user.pk)))
        token = default_token_generator.make_token(user)
        PasswordResetEmail(user, uid, token, reset_url=reset_url).send()
    except Exception:
        logger.exception(
            "Failed to send password reset email for user_id=%s email=%s",
            getattr(user, "pk", None),
            getattr(user, "email", None),
        )

