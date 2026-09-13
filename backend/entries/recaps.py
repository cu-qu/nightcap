"""Month and year recaps assembled from NightCaps and daily check-in entries."""

from __future__ import annotations

import calendar
from collections import Counter
from datetime import date
from decimal import Decimal

from django.db.models import Count
from django.db.models.functions import ExtractMonth, ExtractYear
from django.utils import timezone

from categories.models import TrackingCategory

from .models import Entry, NightCap
from .serializers import nightcap_photo_url
from .services import finance_totals

PHOTO_LIMIT_MONTH = 16
PHOTO_LIMIT_YEAR = 12
PHOTO_LIMIT_SEASON = 8
MOMENT_LIMIT_MONTH = 8
MOMENT_LIMIT_YEAR = 10
MOMENT_LIMIT_SEASON = 5
CATEGORY_LIMIT = 8
HIGHLIGHT_DAYS = 7

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


def _nights_body(snapshot: dict) -> str:
    n = snapshot["nights_logged"]
    days = snapshot["day_count"]
    if n == 0:
        return "No NightCaps in this stretch yet."
    if n == 1:
        return "One evening, closed out."
    return f"{n} of {days} evenings, closed out."


def range_snapshot(
    user,
    start: date,
    end: date,
    request=None,
    *,
    photo_limit: int = PHOTO_LIMIT_MONTH,
    moment_limit: int = MOMENT_LIMIT_MONTH,
) -> dict:
    nightcaps = list(
        NightCap.objects.filter(user=user, date__gte=start, date__lte=end).order_by("date")
    )
    entry_qs = Entry.objects.filter(user=user, date__gte=start, date__lte=end)
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

    memories = []
    for n in nightcaps:
        text = (n.favorite_moment or "").strip()
        has_photo = bool(n.favorite_photo)
        if not has_photo and not text:
            continue
        memories.append(
            {
                "date": n.date,
                "text": text,
                "mood": n.mood or "",
                "has_photo": has_photo,
                "photo_url": nightcap_photo_url(n, request) if has_photo else None,
            }
        )
    photos = [
        {
            "date": m["date"],
            "favorite_moment": m["text"],
            "mood": m["mood"],
            "photo_url": m["photo_url"],
        }
        for m in memories
        if m["has_photo"]
    ]
    with_photo = [m for m in memories if m["has_photo"]]
    without_photo = [m for m in memories if not m["has_photo"]]
    moments = _sample(with_photo + without_photo, moment_limit)
    mood_counts = Counter(n.mood for n in nightcaps if (n.mood or "").strip())
    moods = [{"mood": mood, "count": count} for mood, count in mood_counts.most_common(8)]

    cat_map: dict[int, dict] = {}
    together_dates: set[date] = set()
    for entry in entries:
        bucket = cat_map.setdefault(
            entry.category_id,
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

    return {
        "start_date": start,
        "end_date": end,
        "day_count": (end - start).days + 1,
        "nights_logged": len(nightcaps),
        "nights_completed": sum(
            1 for n in nightcaps if n.status == NightCap.STATUS_COMPLETED
        ),
        "photo_count": sum(1 for n in nightcaps if n.favorite_photo),
        "photos": _sample(photos, photo_limit),
        "moments": moments,
        "moods": moods,
        "categories": categories,
        "expense_total": finance["expense"],
        "income_total": finance["income"],
        "habit_days": habit_days,
        "together_days": len(together_dates),
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


def month_slides(snapshot: dict, year: int, month: int) -> list[dict]:
    title = f"{calendar.month_name[month]} {year}"
    slides: list[dict] = [
        {
            "type": "cover",
            "eyebrow": "Month Recap",
            "title": title,
            "body": _nights_body(snapshot),
        }
    ]
    if snapshot["nights_logged"]:
        slides.append(
            {
                "type": "stat",
                "title": "Nights you closed",
                "stat": str(snapshot["nights_logged"]),
                "label": "NightCaps",
                "body": _nights_body(snapshot),
            }
        )
    if snapshot["photos"] or snapshot["moments"]:
        slides.append(
            {
                "type": "moments",
                "title": "Photos & moments",
                "body": "Favorite stills and lines from the check-ins.",
                "photos": snapshot["photos"],
                "moments": snapshot["moments"]
                or [
                    {
                        "date": p["date"],
                        "text": p["favorite_moment"],
                        "mood": p["mood"],
                        "has_photo": True,
                        "photo_url": p["photo_url"],
                    }
                    for p in snapshot["photos"]
                ],
            }
        )
    if len(snapshot["photos"]) > 1:
        slides.append(
            {
                "type": "photos",
                "title": "Favorite frames",
                "body": "Photos you saved with the day.",
                "photos": snapshot["photos"],
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
    slides.append(
        {
            "type": "close",
            "eyebrow": "Month Recap",
            "title": "That's the month",
            "body": "The days are still on Calendar whenever you want them.",
        }
    )
    return slides


def year_slides(year: int, overview: dict, seasons: list[dict]) -> list[dict]:
    slides: list[dict] = [
        {
            "type": "cover",
            "eyebrow": "Year Recap",
            "title": str(year),
            "body": _nights_body(overview),
        }
    ]
    if overview["nights_logged"]:
        slides.append(
            {
                "type": "stat",
                "title": "A year of nights",
                "stat": str(overview["nights_logged"]),
                "label": "NightCaps",
                "body": _nights_body(overview),
            }
        )
    if overview["photos"] or overview["moments"]:
        slides.append(
            {
                "type": "moments",
                "title": "Photos & moments",
                "body": "Favorite stills and lines, across the seasons.",
                "photos": overview["photos"],
                "moments": overview["moments"]
                or [
                    {
                        "date": p["date"],
                        "text": p["favorite_moment"],
                        "mood": p["mood"],
                        "has_photo": True,
                        "photo_url": p["photo_url"],
                    }
                    for p in overview["photos"]
                ],
            }
        )
    if len(overview["photos"]) > 1:
        slides.append(
            {
                "type": "photos",
                "title": "A year in frames",
                "body": "Favorite photos, across the seasons.",
                "photos": overview["photos"],
            }
        )
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
        if season["photos"] or season["moments"]:
            slides.append(
                {
                    "type": "moments",
                    "title": f"{season['name']} moments",
                    "body": "Photos and lines from this stretch.",
                    "photos": season["photos"],
                    "moments": season["moments"]
                    or [
                        {
                            "date": p["date"],
                            "text": p["favorite_moment"],
                            "mood": p["mood"],
                            "has_photo": True,
                            "photo_url": p["photo_url"],
                        }
                        for p in season["photos"]
                    ],
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
    }


def build_month_recap(user, year: int, month: int, request=None) -> dict:
    today = timezone.localdate()
    start = date(year, month, 1)
    end = _month_end(year, month)
    clamped = _clamp_range(start, end, today)
    if clamped is None:
        snapshot = empty_snapshot(start, end)
        snapshot["day_count"] = 0
    else:
        snapshot = range_snapshot(user, clamped[0], clamped[1], request)
    return {
        "kind": "month",
        "year": year,
        "month": month,
        "title": f"{calendar.month_name[month]} {year}",
        "snapshot": snapshot,
        "slides": month_slides(snapshot, year, month),
    }


def build_year_recap(user, year: int, request=None) -> dict:
    today = timezone.localdate()
    start = date(year, 1, 1)
    end = date(year, 12, 31)
    clamped = _clamp_range(start, end, today)
    if clamped is None:
        overview = empty_snapshot(start, end)
        overview["day_count"] = 0
        seasons: list[dict] = []
    else:
        overview = range_snapshot(
            user,
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
                user,
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
        "snapshot": overview,
        "seasons": seasons,
        "slides": year_slides(year, overview, seasons),
    }


def _previous_month(day: date) -> tuple[int, int]:
    if day.month == 1:
        return day.year - 1, 12
    return day.year, day.month - 1


def list_available_recaps(user, today: date | None = None) -> dict:
    """Past months/years with NightCaps. Featured only in the first week of a new period."""
    today = today or timezone.localdate()
    month_start = date(today.year, today.month, 1)
    rows = (
        NightCap.objects.filter(user=user, date__lt=month_start)
        .annotate(year=ExtractYear("date"), month=ExtractMonth("date"))
        .values("year", "month")
        .annotate(nights_logged=Count("id"))
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
        "featured_month": featured_month,
        "featured_year": featured_year,
        "months": months,
        "years": years,
    }
