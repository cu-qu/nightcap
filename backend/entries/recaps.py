"""Month and year recaps assembled from NightCaps and daily check-in entries.

A linked couple shares one slideshow. On the 1st of each month a task freezes
the previous month for every active couple and every active solo member:
up to five top moments per person, with their photos, in chronological order.
"""

from __future__ import annotations

import calendar
import logging
from collections import Counter
from datetime import date
from decimal import Decimal

from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Count
from django.db.models.functions import ExtractMonth, ExtractYear
from django.utils import timezone

from accounts.partnerships import get_partner_user, get_user_partnership
from categories.models import TrackingCategory

from .media import recap_moment_photo_url
from .models import Entry, MonthlyRecap, NightCap
from .services import finance_totals

logger = logging.getLogger(__name__)

PHOTO_LIMIT_MONTH = 16
PHOTO_LIMIT_YEAR = 12
PHOTO_LIMIT_SEASON = 8
MOMENT_LIMIT_PER_PERSON = 5
MOMENT_LIMIT_YEAR = 5
MOMENT_LIMIT_SEASON = 5
CATEGORY_LIMIT = 8
HIGHLIGHT_DAYS = 7

MOOD_SCORE = {
    NightCap.MOOD_GREAT: 5,
    NightCap.MOOD_GOOD: 4,
    NightCap.MOOD_OKAY: 3,
    NightCap.MOOD_LOW: 2,
    NightCap.MOOD_ROUGH: 1,
}

SEASONS = (
    {
        "key": "winter",
        "name": "Winter",
        "tagline": "How the year opened — short days, slow evenings.",
        "month_ranges": ((1, 1), (2, None)),
    },
    {
        "key": "spring",
        "name": "Spring",
        "tagline": "Things opening up.",
        "month_ranges": ((3, 1), (5, 31)),
    },
    {
        "key": "summer",
        "name": "Summer",
        "tagline": "Long light.",
        "month_ranges": ((6, 1), (8, 31)),
    },
    {
        "key": "fall",
        "name": "Fall",
        "tagline": "Turning inward.",
        "month_ranges": ((9, 1), (11, 30)),
    },
    {
        "key": "winter_close",
        "name": "Winter again",
        "tagline": "The year coming home.",
        "month_ranges": ((12, 1), (12, 31)),
    },
)


def _display_name(user) -> str:
    name = (getattr(user, "first_name", None) or "").strip()
    return name or user.username


def _people_payload(people) -> list[dict]:
    return [{"id": str(person.id), "name": _display_name(person)} for person in people]


def recap_audience(user):
    """Linked couple shares one recap. Anyone else gets their own."""
    partnership = get_user_partnership(user)
    partner = get_partner_user(user)
    if partnership is not None and partner is not None:
        members = partnership.members.select_related("user").order_by("joined_at", "id")
        people = [member.user for member in members if not member.user.is_deleted]
        if len(people) >= 2:
            return partnership, people
    return None, [user]


def viewer_can_see_nightcap(viewer, nightcap) -> bool:
    if nightcap.user_id == viewer.id:
        return True
    partner = get_partner_user(viewer)
    return partner is not None and partner.id == nightcap.user_id


def _sample(items: list, limit: int) -> list:
    if limit <= 0 or not items:
        return []
    if len(items) <= limit:
        return items
    if limit == 1:
        return [items[len(items) // 2]]
    last = len(items) - 1
    return [items[round(i * last / (limit - 1))] for i in range(limit)]


def _clamp_range(start: date, end: date, today: date) -> tuple[date, date] | None:
    if start > today:
        return None
    return start, min(end, today)


def _month_end(year: int, month: int) -> date:
    return date(year, month, calendar.monthrange(year, month)[1])


def _season_bounds(year: int, spec: dict) -> tuple[date, date]:
    (start_month, start_day), (end_month, end_day) = spec["month_ranges"]
    start = date(year, start_month, start_day)
    if end_day is None:
        end = _month_end(year, end_month)
    else:
        end = date(year, end_month, end_day)
    return start, end


def _pretty_date(day: date) -> str:
    return f"{calendar.month_name[day.month]} {day.day}"


def _is_shared(people) -> bool:
    return len(people) > 1


def _moment_rank(nightcap: NightCap) -> tuple:
    text = (nightcap.favorite_moment or "").strip()
    return (
        1 if nightcap.favorite_photo else 0,
        1 if text else 0,
        MOOD_SCORE.get(nightcap.mood or "", 0),
        1 if nightcap.status == NightCap.STATUS_COMPLETED else 0,
        nightcap.date.toordinal(),
    )


def _has_moment(nightcap: NightCap) -> bool:
    return bool((nightcap.favorite_moment or "").strip() or nightcap.favorite_photo)


def rank_top_moments(nightcaps: list[NightCap], limit: int) -> list[NightCap]:
    """Best moments for one person. Caller sorts the merged set by date."""
    if limit <= 0:
        return []
    candidates = [nightcap for nightcap in nightcaps if _has_moment(nightcap)]
    candidates.sort(key=_moment_rank, reverse=True)
    return candidates[:limit]


def pick_highlight_nightcaps(
    nightcaps: list[NightCap], *, per_person: int = MOMENT_LIMIT_PER_PERSON
) -> list[NightCap]:
    grouped: dict = {}
    for nightcap in nightcaps:
        grouped.setdefault(nightcap.user_id, []).append(nightcap)
    chosen: list[NightCap] = []
    for group in grouped.values():
        chosen.extend(rank_top_moments(group, per_person))
    chosen.sort(key=lambda nightcap: (nightcap.date, str(nightcap.user_id)))
    return chosen


def _memory(nightcap: NightCap, request=None) -> dict:
    text = (nightcap.favorite_moment or "").strip()
    has_photo = bool(nightcap.favorite_photo)
    return {
        "date": nightcap.date,
        "text": text,
        "mood": nightcap.mood or "",
        "has_photo": has_photo,
        "photo_url": recap_moment_photo_url(nightcap, request) if has_photo else None,
        "author": _display_name(nightcap.user),
        "author_id": str(nightcap.user_id),
        "nightcap_uuid": nightcap.uuid,
    }


def _photo_from_memory(memory: dict) -> dict:
    return {
        "date": memory["date"],
        "favorite_moment": memory["text"],
        "mood": memory["mood"],
        "photo_url": memory["photo_url"],
    }


def _nights_body(snapshot: dict) -> str:
    n = snapshot["nights_logged"]
    days = snapshot["day_count"]
    if n == 0:
        return "No NightCaps in this stretch yet."
    if n == 1:
        return "One evening, closed out."
    return f"{n} of {days} evenings, closed out."


def _cover_body(snapshot: dict, people) -> str:
    body = _nights_body(snapshot)
    if _is_shared(people):
        names = " and ".join(_display_name(person) for person in people)
        return f"{names}. {body}"
    return body


def _stat_body(snapshot: dict, people) -> str:
    if not _is_shared(people):
        return _nights_body(snapshot)
    counts = {
        row["id"]: row["nights_logged"] for row in snapshot.get("people_nights") or []
    }
    parts = []
    for person in people:
        count = counts.get(str(person.id), 0)
        label = "NightCap" if count == 1 else "NightCaps"
        parts.append(f"{_display_name(person)} · {count} {label}")
    return " · ".join(parts)


def range_snapshot(
    users,
    start: date,
    end: date,
    request=None,
    *,
    photo_limit: int = PHOTO_LIMIT_MONTH,
    moment_limit: int = MOMENT_LIMIT_PER_PERSON,
    highlight_uuids: list | None = None,
) -> dict:
    if not isinstance(users, (list, tuple)):
        users = [users]
    user_ids = [user.pk for user in users]
    nightcaps = list(
        NightCap.objects.filter(user_id__in=user_ids, date__gte=start, date__lte=end)
        .select_related("user")
        .order_by("date", "user_id")
    )
    entry_qs = Entry.objects.filter(user_id__in=user_ids, date__gte=start, date__lte=end)
    finance = finance_totals(entry_qs)
    habit_days = (
        entry_qs.filter(
            category__type__in=[TrackingCategory.HABIT, TrackingCategory.FITNESS]
        )
        .values("date")
        .distinct()
        .count()
    )
    entries = list(entry_qs.select_related("category"))

    if highlight_uuids is None:
        highlights = pick_highlight_nightcaps(nightcaps, per_person=moment_limit)
    else:
        by_uuid = {str(nightcap.uuid): nightcap for nightcap in nightcaps}
        highlights = [
            by_uuid[str(item)]
            for item in highlight_uuids
            if str(item) in by_uuid and _has_moment(by_uuid[str(item)])
        ]
    moments = [_memory(nightcap, request) for nightcap in highlights]
    photos = [_photo_from_memory(memory) for memory in moments if memory["has_photo"]]
    if photo_limit and len(photos) > photo_limit:
        photos = _sample(photos, photo_limit)

    mood_counts = Counter(n.mood for n in nightcaps if (n.mood or "").strip())
    moods = [{"mood": mood, "count": count} for mood, count in mood_counts.most_common(8)]

    cat_map: dict[tuple, dict] = {}
    together_dates: set[date] = set()
    for entry in entries:
        key = (
            entry.category.name,
            entry.category.type,
            entry.category.metric_kind,
            entry.category.unit or "",
        )
        bucket = cat_map.setdefault(
            key,
            {
                "name": entry.category.name,
                "emoji": entry.category.emoji or "",
                "icon": entry.category.icon or "",
                "type": entry.category.type,
                "metric_kind": entry.category.metric_kind,
                "unit": entry.category.unit or "",
                "entry_count": 0,
                "amount": Decimal("0"),
                "quantity": Decimal("0"),
            },
        )
        bucket["entry_count"] += 1
        if entry.amount:
            bucket["amount"] += entry.amount
        if entry.quantity:
            bucket["quantity"] += entry.quantity
        if entry.completed_with == Entry.COMPLETED_WITH_PARTNER:
            together_dates.add(entry.date)

    categories = sorted(
        cat_map.values(),
        key=lambda c: (-c["entry_count"], -c["amount"], c["name"]),
    )[:CATEGORY_LIMIT]

    per_user = Counter(nightcap.user_id for nightcap in nightcaps)
    logged_dates = {nightcap.date for nightcap in nightcaps}

    return {
        "start_date": start,
        "end_date": end,
        "day_count": (end - start).days + 1,
        "nights_logged": len(logged_dates),
        "nights_completed": len(
            {
                nightcap.date
                for nightcap in nightcaps
                if nightcap.status == NightCap.STATUS_COMPLETED
            }
        ),
        "photo_count": sum(1 for nightcap in nightcaps if nightcap.favorite_photo),
        "photos": photos,
        "moments": moments,
        "moods": moods,
        "categories": categories,
        "expense_total": finance["expense"],
        "income_total": finance["income"],
        "habit_days": habit_days,
        "together_days": len(together_dates),
        "people_nights": [
            {
                "id": str(user.id),
                "name": _display_name(user),
                "nights_logged": per_user.get(user.id, 0),
            }
            for user in users
        ],
        "highlight_uuids": [str(nightcap.uuid) for nightcap in highlights],
    }


def _logged_body(snapshot: dict) -> str:
    parts = []
    if snapshot["expense_total"]:
        parts.append("spend")
    if snapshot["habit_days"]:
        parts.append("habits")
    if snapshot["together_days"]:
        parts.append("nights together")
    if not parts:
        return "The chips you tapped as the days closed."
    if len(parts) == 1:
        return f"Mostly {parts[0]}."
    return " · ".join(parts)


def _moment_slide(memory: dict, *, shared: bool) -> dict:
    text = memory["text"]
    photo = _photo_from_memory(memory) if memory["has_photo"] else None
    return {
        "type": "moment",
        "eyebrow": memory["author"] if shared else "",
        "title": text or "A still from the day",
        "body": _pretty_date(memory["date"]),
        "photos": [photo] if photo else [],
        "moments": [memory],
    }


def _append_moment_slides(slides: list[dict], moments: list[dict], *, shared: bool) -> None:
    for memory in moments:
        slides.append(_moment_slide(memory, shared=shared))


def month_slides(snapshot: dict, year: int, month: int, people) -> list[dict]:
    title = f"{calendar.month_name[month]} {year}"
    shared = _is_shared(people)
    slides: list[dict] = [
        {
            "type": "cover",
            "eyebrow": "Month Recap",
            "title": title,
            "body": _cover_body(snapshot, people),
        }
    ]
    if snapshot["nights_logged"]:
        slides.append(
            {
                "type": "stat",
                "title": "Nights you closed" if not shared else "Nights you both closed",
                "stat": str(snapshot["nights_logged"]),
                "label": "evenings",
                "body": _stat_body(snapshot, people),
            }
        )
    if snapshot["categories"]:
        slides.append(
            {
                "type": "logged",
                "title": "What you logged",
                "body": _logged_body(snapshot),
                "categories": snapshot["categories"],
                "expense_total": snapshot["expense_total"],
            }
        )
    if snapshot["moods"]:
        slides.append(
            {
                "type": "moods",
                "title": "How it felt",
                "body": "Moods from the wrap-up.",
                "moods": snapshot["moods"],
            }
        )
    if snapshot["together_days"]:
        slides.append(
            {
                "type": "together",
                "title": "Nights together",
                "stat": str(snapshot["together_days"]),
                "label": "together",
                "body": "Check-ins you marked with each other.",
            }
        )
    _append_moment_slides(slides, snapshot["moments"], shared=shared)
    slides.append(
        {
            "type": "close",
            "eyebrow": "Month Recap",
            "title": "That's the month",
            "body": "The days are still on Calendar whenever you want them.",
        }
    )
    return slides


def year_slides(year: int, overview: dict, seasons: list[dict], people) -> list[dict]:
    shared = _is_shared(people)
    slides: list[dict] = [
        {
            "type": "cover",
            "eyebrow": "Year Recap",
            "title": str(year),
            "body": _cover_body(overview, people),
        }
    ]
    if overview["nights_logged"]:
        slides.append(
            {
                "type": "stat",
                "title": "A year of nights",
                "stat": str(overview["nights_logged"]),
                "label": "evenings",
                "body": _stat_body(overview, people),
            }
        )
    _append_moment_slides(slides, overview["moments"], shared=shared)
    for season in seasons:
        if not season["nights_logged"]:
            continue
        slides.append(
            {
                "type": "season",
                "eyebrow": "The seasons",
                "title": season["name"],
                "body": season["tagline"],
                "season_key": season["key"],
                "stat": str(season["nights_logged"]),
                "label": "nights",
            }
        )
        if season["categories"]:
            slides.append(
                {
                    "type": "logged",
                    "title": f"Logged in {season['name']}",
                    "body": _logged_body(season),
                    "categories": season["categories"],
                    "expense_total": season["expense_total"],
                }
            )
    slides.append(
        {
            "type": "close",
            "eyebrow": "Year Recap",
            "title": "That's the year",
            "body": "Winter to winter — the nights you kept.",
        }
    )
    return slides


def empty_snapshot(start: date, end: date) -> dict:
    return {
        "start_date": start,
        "end_date": end,
        "day_count": max((end - start).days + 1, 0),
        "nights_logged": 0,
        "nights_completed": 0,
        "photo_count": 0,
        "photos": [],
        "moments": [],
        "moods": [],
        "categories": [],
        "expense_total": Decimal("0"),
        "income_total": Decimal("0"),
        "habit_days": 0,
        "together_days": 0,
        "people_nights": [],
        "highlight_uuids": [],
    }


def _lookup_stored(partnership, people, year: int, month: int) -> MonthlyRecap | None:
    if partnership is not None and _is_shared(people):
        return MonthlyRecap.objects.filter(
            partnership=partnership, year=year, month=month
        ).first()
    return MonthlyRecap.objects.filter(user=people[0], year=year, month=month).first()


def _store_month(partnership, people, year: int, month: int, highlight_uuids: list):
    if partnership is not None and _is_shared(people):
        return MonthlyRecap.objects.get_or_create(
            partnership=partnership,
            year=year,
            month=month,
            defaults={"highlight_uuids": highlight_uuids},
        )
    return MonthlyRecap.objects.get_or_create(
        user=people[0],
        year=year,
        month=month,
        defaults={"highlight_uuids": highlight_uuids},
    )


def _response_meta(people) -> dict:
    return {"shared": _is_shared(people), "people": _people_payload(people)}


def build_month_recap(user, year: int, month: int, request=None) -> dict:
    today = timezone.localdate()
    partnership, people = recap_audience(user)
    start = date(year, month, 1)
    end = _month_end(year, month)
    clamped = _clamp_range(start, end, today)
    month_closed = end < today
    stored = _lookup_stored(partnership, people, year, month) if month_closed else None
    highlight_uuids = list(stored.highlight_uuids) if stored is not None else None
    if clamped is None:
        snapshot = empty_snapshot(start, end)
        snapshot["day_count"] = 0
    else:
        snapshot = range_snapshot(
            people,
            clamped[0],
            clamped[1],
            request,
            highlight_uuids=highlight_uuids,
        )
    if month_closed and stored is None and snapshot["nights_logged"]:
        stored, created = _store_month(
            partnership, people, year, month, snapshot["highlight_uuids"]
        )
        if not created:
            snapshot = range_snapshot(
                people,
                clamped[0],
                clamped[1],
                request,
                highlight_uuids=list(stored.highlight_uuids),
            )
    return {
        "kind": "month",
        "year": year,
        "month": month,
        "title": f"{calendar.month_name[month]} {year}",
        **_response_meta(people),
        "snapshot": snapshot,
        "slides": month_slides(snapshot, year, month, people),
    }


def build_year_recap(user, year: int, request=None) -> dict:
    today = timezone.localdate()
    _partnership, people = recap_audience(user)
    start = date(year, 1, 1)
    end = date(year, 12, 31)
    clamped = _clamp_range(start, end, today)
    if clamped is None:
        overview = empty_snapshot(start, end)
        overview["day_count"] = 0
        seasons: list[dict] = []
    else:
        overview = range_snapshot(
            people,
            clamped[0],
            clamped[1],
            request,
            photo_limit=PHOTO_LIMIT_YEAR,
            moment_limit=MOMENT_LIMIT_YEAR,
        )
        seasons = []
        for spec in SEASONS:
            s_start, s_end = _season_bounds(year, spec)
            s_clamped = _clamp_range(s_start, s_end, today)
            if s_clamped is None:
                continue
            snap = range_snapshot(
                people,
                s_clamped[0],
                s_clamped[1],
                request,
                photo_limit=PHOTO_LIMIT_SEASON,
                moment_limit=MOMENT_LIMIT_SEASON,
            )
            seasons.append(
                {
                    "key": spec["key"],
                    "name": spec["name"],
                    "tagline": spec["tagline"],
                    **snap,
                }
            )
    return {
        "kind": "year",
        "year": year,
        "title": str(year),
        **_response_meta(people),
        "snapshot": overview,
        "seasons": seasons,
        "slides": year_slides(year, overview, seasons, people),
    }


def _previous_month(day: date) -> tuple[int, int]:
    if day.month == 1:
        return day.year - 1, 12
    return day.year, day.month - 1


def list_available_recaps(user, today: date | None = None) -> dict:
    """Past months/years with NightCaps. A linked couple sees both people's nights."""
    today = today or timezone.localdate()
    _partnership, people = recap_audience(user)
    month_start = date(today.year, today.month, 1)
    rows = (
        NightCap.objects.filter(user_id__in=[person.pk for person in people], date__lt=month_start)
        .annotate(year=ExtractYear("date"), month=ExtractMonth("date"))
        .values("year", "month")
        .annotate(nights_logged=Count("date", distinct=True))
        .order_by("-year", "-month")
    )
    months = [
        {
            "year": row["year"],
            "month": row["month"],
            "nights_logged": row["nights_logged"],
            "title": f"{calendar.month_name[row['month']]} {row['year']}",
        }
        for row in rows
    ]
    year_totals: dict[int, int] = {}
    for item in months:
        year_totals[item["year"]] = year_totals.get(item["year"], 0) + item["nights_logged"]
    years = [
        {"year": year, "nights_logged": nights, "title": str(year)}
        for year, nights in sorted(year_totals.items(), reverse=True)
    ]

    featured_month = None
    if today.day <= HIGHLIGHT_DAYS:
        prev_year, prev_month = _previous_month(today)
        featured_month = next(
            (
                item
                for item in months
                if item["year"] == prev_year and item["month"] == prev_month
            ),
            None,
        )

    featured_year = None
    if today.month == 1 and today.day <= HIGHLIGHT_DAYS:
        featured_year = next(
            (item for item in years if item["year"] == today.year - 1),
            None,
        )

    return {
        "highlight_days": HIGHLIGHT_DAYS,
        "shared": _is_shared(people),
        "featured_month": featured_month,
        "featured_year": featured_year,
        "months": months,
        "years": years,
    }


def _membership_active(partnership) -> bool:
    from accounts.memberships import membership_is_active

    try:
        membership = partnership.membership
    except ObjectDoesNotExist:
        return False
    return membership_is_active(membership)


def iter_recap_audiences():
    """Active couples (one shared recap) and active solo members."""
    from accounts.memberships import membership_is_active
    from accounts.models import Membership, Partnership

    covered: set = set()
    partnerships = Partnership.objects.prefetch_related("members__user").order_by("id")
    for partnership in partnerships:
        members = [
            member
            for member in partnership.members.all()
            if not member.user.is_deleted
        ]
        if not members or not _membership_active(partnership):
            continue
        members.sort(key=lambda member: (member.joined_at, member.id))
        if len(members) >= 2:
            people = [member.user for member in members]
            for person in people:
                covered.add(person.pk)
            yield partnership, people
            continue
        person = members[0].user
        covered.add(person.pk)
        yield None, [person]

    personal = Membership.objects.filter(
        user__isnull=False, user__is_deleted=False
    ).select_related("user")
    for membership in personal:
        user = membership.user
        if user.pk in covered:
            continue
        if not membership_is_active(membership, user=user):
            continue
        if get_partner_user(user) is not None:
            continue
        yield None, [user]


def _notify_recap_ready(people, year: int, month: int) -> None:
    from accounts.apns import send_apns
    from accounts.models import DevicePushToken

    title = f"{calendar.month_name[month]} recap"
    if _is_shared(people):
        body = "Your shared slideshow is ready — top moments from each of you, in order."
    else:
        body = "Your slideshow is ready — the top moments from the month, in order."
    data = {"type": "recap", "year": year, "month": month}
    for person in people:
        records = list(
            DevicePushToken.objects.filter(
                user=person, platform=DevicePushToken.PLATFORM_IOS
            )
        )
        if not records:
            continue
        try:
            send_apns(records, title=title, body=body, data=data)
        except Exception:
            logger.exception("Monthly recap push failed for %s", person.pk)


def _ensure_notified(recap: MonthlyRecap, people, year: int, month: int) -> None:
    if recap.notified_at is not None:
        return
    _notify_recap_ready(people, year, month)
    recap.notified_at = timezone.now()
    recap.save(update_fields=["notified_at"])


def generate_recaps_for_month(year: int, month: int) -> dict:
    """Freeze one month for every active couple and solo member who logged it."""
    start = date(year, month, 1)
    end = _month_end(year, month)
    created = 0
    existing = 0
    skipped = 0
    for partnership, people in iter_recap_audiences():
        stored = _lookup_stored(partnership, people, year, month)
        if stored is not None:
            _ensure_notified(stored, people, year, month)
            existing += 1
            continue
        nightcaps = list(
            NightCap.objects.filter(
                user__in=people, date__gte=start, date__lte=end
            ).select_related("user")
        )
        if not nightcaps:
            skipped += 1
            continue
        highlights = pick_highlight_nightcaps(nightcaps)
        recap, was_created = _store_month(
            partnership,
            people,
            year,
            month,
            [str(nightcap.uuid) for nightcap in highlights],
        )
        _ensure_notified(recap, people, year, month)
        if was_created:
            created += 1
        else:
            existing += 1
    return {
        "year": year,
        "month": month,
        "created": created,
        "existing": existing,
        "skipped": skipped,
    }


def generate_previous_month_recaps(today: date | None = None) -> dict:
    today = today or timezone.localdate()
    year, month = _previous_month(today)
    return generate_recaps_for_month(year, month)
