"""Browser pages linked from verification and password-reset emails."""

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.shortcuts import render
from django.views import View

from .services import PasswordResetError, confirm_password_reset, verify_email_token


class VerifyEmailPage(View):
    def get(self, request):
        token = (request.GET.get("token") or "").strip()
        if not token:
            return render(
                request,
                "auth/verify_email.html",
                {
                    "title": "Confirm your email",
                    "message": "This confirmation link is missing a token.",
                },
                status=400,
            )
        if verify_email_token(token):
            return render(
                request,
                "auth/verify_email.html",
                {
                    "title": "Email confirmed",
                    "message": "Your email is confirmed. Return to NightCap and sign in.",
                },
            )
        return render(
            request,
            "auth/verify_email.html",
            {
                "title": "Link not valid",
                "message": "This confirmation link is invalid or was already used.",
            },
            status=400,
        )


class PasswordResetPage(View):
    def get(self, request):
        return render(request, "auth/reset_password.html", self._context(request))

    def post(self, request):
        uid = (request.POST.get("uid") or "").strip()
        token = (request.POST.get("token") or "").strip()
        new_password = request.POST.get("new_password") or ""
        context = self._context(request, uid=uid, token=token)
        if not uid or not token:
            context["error"] = "This reset link is missing information. Request a new one in the app."
            return render(request, "auth/reset_password.html", context, status=400)
        try:
            validate_password(new_password)
            confirm_password_reset(uid=uid, token=token, new_password=new_password)
        except ValidationError as exc:
            context["error"] = " ".join(exc.messages)
            return render(request, "auth/reset_password.html", context, status=400)
        except PasswordResetError as exc:
            context["error"] = str(exc)
            return render(request, "auth/reset_password.html", context, status=400)
        return render(
            request,
            "auth/verify_email.html",
            {
                "title": "Password updated",
                "message": "Your password is updated. Return to NightCap and sign in.",
            },
        )

    def _context(self, request, *, uid: str | None = None, token: str | None = None) -> dict:
        return {
            "title": "Reset your password",
            "uid": uid if uid is not None else (request.GET.get("uid") or ""),
            "token": token if token is not None else (request.GET.get("token") or ""),
        }
