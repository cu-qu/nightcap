from __future__ import annotations

import json
import urllib.error
import urllib.request
from datetime import date

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts.emails import PartnerNudgeEmail
from accounts.models import DevicePushToken, PartnerNudge
from accounts.partnerships import get_partner_user, get_user_partnership

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
MAX_NUDGE_AGE_DAYS = 14
NUDGE_PATH = "/ritual/spend"
NUDGE_CHANNEL_ID = "nightcap-nudges"


def user_has_logged_nightcap(user, day: date) -> bool:
    from entries.models import Entry, NightCap

    if NightCap.objects.filter(user=user, date=day).exists():
        return True
    return Entry.objects.filter(user=user, date=day).exists()


def acknowledge_incoming_nudges(user, day: date) -> None:
    PartnerNudge.objects.filter(
        to_user=user, date=day, read_at__isnull=True
    ).update(read_at=timezone.now())


def register_push_token(user, token: str, platform: str = "") -> DevicePushToken:
    token = (token or "").strip()
    if len(token) < 16:
        raise ValidationError({"detail": "That push token looks invalid."})
    platform = (platform or "").strip().lower()
    if platform not in {
        DevicePushToken.PLATFORM_IOS,
        DevicePushToken.PLATFORM_ANDROID,
        DevicePushToken.PLATFORM_WEB,
        "",
    }:
        platform = ""
    DevicePushToken.objects.filter(token=token).exclude(user=user).delete()
    record, _ = DevicePushToken.objects.update_or_create(
        token=token,
        defaults={"user": user, "platform": platform},
    )
    return record


def unregister_push_token(user, token: str) -> None:
    DevicePushToken.objects.filter(user=user, token=(token or "").strip()).delete()


def _format_nudge_day(day: date) -> str:
    return day.strftime("%A, %B ") + str(day.day)


def _expo_tickets_ok(payload: object) -> bool:
    if not isinstance(payload, dict):
        return False
    tickets = payload.get("data")
    if isinstance(tickets, dict):
        tickets = [tickets]
    if not isinstance(tickets, list):
        return False
    return any(
        isinstance(ticket, dict) and ticket.get("status") == "ok" for ticket in tickets
    )


def _send_expo_push(tokens: list[str], *, title: str, body: str, data: dict) -> bool:
    messages = [
        {
            "to": token,
            "title": title,
            "body": body,
            "sound": "default",
            "priority": "high",
            "badge": 1,
            "channelId": NUDGE_CHANNEL_ID,
            "data": data,
        }
        for token in tokens
        if token
    ]
    if not messages:
        return False
    request = urllib.request.Request(
        EXPO_PUSH_URL,
        data=json.dumps(messages).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            if not (200 <= response.status < 300):
                return False
            raw = response.read()
            if not raw:
                return True
            try:
                return _expo_tickets_ok(json.loads(raw.decode("utf-8")))
            except (json.JSONDecodeError, UnicodeDecodeError):
                return True
    except (OSError, urllib.error.URLError):
        return False


def serialize_nudge(nudge: PartnerNudge, *, already_sent: bool = False) -> dict:
    channels = [part for part in nudge.delivered_via.split(",") if part]
    return {
        "date": nudge.date,
        "from_username": nudge.from_user.username,
        "to_username": nudge.to_user.username,
        "created_at": nudge.created_at,
        "already_sent": already_sent,
        "delivered_via": channels,
    }


def send_partner_nudge(user, day: date) -> dict:
    today = timezone.localdate()
    if day > today:
        raise ValidationError({"detail": "You can only nudge for today or a past day."})
    if (today - day).days > MAX_NUDGE_AGE_DAYS:
        raise ValidationError({"detail": "That day is too far back to nudge."})

    partnership = get_user_partnership(user)
    partner = get_partner_user(user)
    if partnership is None or partner is None:
        raise ValidationError({"detail": "Link a partner before sending a nudge."})

    if user_has_logged_nightcap(partner, day):
        raise ValidationError(
            {
                "detail": (
                    f"{partner.username} already NightCap’d {_format_nudge_day(day)}."
                )
            }
        )

    existing = PartnerNudge.objects.filter(
        from_user=user, to_user=partner, date=day
    ).first()
    if existing:
        return serialize_nudge(existing, already_sent=True)

    channels: list[str] = []
    day_label = _format_nudge_day(day)
    title = f"{user.username} nudged you 🌙"
    body = f"Finish your NightCap for {day_label}."
    tokens = list(
        DevicePushToken.objects.filter(user=partner).values_list("token", flat=True)
    )
    pushed = bool(
        tokens
        and _send_expo_push(
            tokens,
            title=title,
            body=body,
            data={
                "type": "partner_nudge",
                "url": NUDGE_PATH,
                "date": day.isoformat(),
            },
        )
    )
    if pushed:
        channels.append("push")
    else:
        try:
            PartnerNudgeEmail(
                to_email=partner.email,
                from_username=user.username,
                day_label=day_label,
            ).send()
            channels.append("email")
        except Exception:
            pass

    if not channels:
        channels.append("in_app")

    nudge = PartnerNudge.objects.create(
        partnership=partnership,
        from_user=user,
        to_user=partner,
        date=day,
        delivered_via=",".join(channels),
    )
    return serialize_nudge(nudge, already_sent=False)
