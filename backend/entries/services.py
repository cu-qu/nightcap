from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncWeek
from django.utils import timezone

from categories.models import TrackingCategory

from .models import DayReflection, Entry, NightCap


def finance_totals(queryset):
    aggregates = queryset.aggregate(
        expense_total=Sum(
            "amount",
            filter=Q(category__type=TrackingCategory.FINANCE_EXPENSE),
        ),
        income_total=Sum(
            "amount",
            filter=Q(category__type=TrackingCategory.FINANCE_INCOME),
        ),
    )
    expense_total = aggregates["expense_total"] or Decimal("0")
    income_total = aggregates["income_total"] or Decimal("0")
    return {
        "income": income_total,
        "expense": expense_total,
        "net": income_total - expense_total,
    }


def get_or_create_nightcap(user, nightcap_date: date) -> NightCap:
    nightcap, _ = NightCap.objects.get_or_create(
        user=user,
        date=nightcap_date,
        defaults={"status": NightCap.STATUS_DRAFT},
    )
    return nightcap


def sync_day_reflection(user, nightcap_date: date, reflection: str) -> None:
    """Keep legacy DayReflection row aligned with NightCap.reflection."""
    DayReflection.objects.update_or_create(
        user=user,
        date=nightcap_date,
        defaults={"reflection": reflection},
    )


def build_daily_summary(user, selected_date: date) -> dict:
    entries = Entry.objects.filter(user=user, date=selected_date).select_related("category")
    by_category = (
        entries.values(
            "category_id",
            "category__uuid",
            "category__name",
            "category__type",
            "category__metric_kind",
        )
        .annotate(
            count=Count("id"),
            amount_total=Sum("amount"),
            quantity_total=Sum("quantity"),
        )
        .order_by("category__type", "category__name")
    )
    nightcap = NightCap.objects.filter(user=user, date=selected_date).first()
    reflection = (nightcap.reflection if nightcap else "") or ""
    return {
        "date": selected_date,
        "entry_count": entries.count(),
        "finance_totals": finance_totals(entries),
        "by_category": list(by_category),
        "reflection": reflection,
        "has_reflection": bool(reflection),
        "nightcap_uuid": str(nightcap.uuid) if nightcap else None,
        "nightcap_status": nightcap.status if nightcap else None,
    }


def resolve_category(user, *, category_id=None, category_uuid=None) -> TrackingCategory:
    qs = TrackingCategory.objects.filter(user=user)
    if category_uuid is not None:
        return qs.get(uuid=category_uuid)
    return qs.get(pk=category_id)


def upsert_ritual(
    user,
    *,
    ritual_date: date,
    items: list[dict],
    reflection: str | None = None,
    mood: str | None = None,
    status: str | None = None,
) -> dict:
    """Upsert NightCap for the day, one entry per category, optional reflection/mood."""
    nightcap = get_or_create_nightcap(user, ritual_date)
    if reflection is not None:
        nightcap.reflection = reflection
        sync_day_reflection(user, ritual_date, reflection)
    if mood is not None:
        nightcap.mood = mood

    desired_status = status or NightCap.STATUS_COMPLETED
    if desired_status == NightCap.STATUS_COMPLETED:
        nightcap.status = NightCap.STATUS_COMPLETED
        if nightcap.completed_at is None:
            nightcap.completed_at = timezone.now()
    elif desired_status == NightCap.STATUS_DRAFT:
        nightcap.status = NightCap.STATUS_DRAFT
        nightcap.completed_at = None

    nightcap.save()

    for item in items:
        category = item["category"]
        defaults = {
            "label": item.get("label") or "",
            "notes": item.get("notes") or "",
            "amount": item.get("amount"),
            "quantity": item.get("quantity"),
            "nightcap": nightcap,
        }
        Entry.objects.update_or_create(
            user=user,
            date=ritual_date,
            category=category,
            defaults=defaults,
        )

    Entry.objects.filter(user=user, date=ritual_date, nightcap__isnull=True).update(
        nightcap=nightcap
    )

    entries = (
        Entry.objects.filter(user=user, date=ritual_date)
        .select_related("category", "category__group")
        .order_by(
            "category__group__sort_order", "category__sort_order", "category__name"
        )
    )
    return {
        "date": ritual_date,
        "reflection": nightcap.reflection,
        "nightcap": nightcap,
        "entries": list(entries),
        "summary": build_daily_summary(user, ritual_date),
    }


def _calendar_group_summaries(user, start: date, end: date) -> dict[date, list[dict]]:
    """
    For each date, summarize activity by category group (active groups recorded that night).
    """
    month_entries = (
        Entry.objects.filter(user=user, date__gte=start, date__lte=end)
        .select_related("category", "category__group")
        .order_by("date", "category__group__sort_order", "category__sort_order")
    )
    # date -> group_id (or None) -> summary
    by_date: dict[date, dict] = {}
    for entry in month_entries.iterator():
        day = entry.date
        group = entry.category.group if entry.category_id else None
        group_id = group.id if group else None
        day_map = by_date.setdefault(day, {})
        if group_id not in day_map:
            day_map[group_id] = {
                "uuid": group.uuid if group else None,
                "key": group.key if group else None,
                "name": group.name if group else "Ungrouped",
                "icon": group.icon if group else "",
                "sort_order": group.sort_order if group else 9999,
                "entry_count": 0,
                "expense_total": Decimal("0"),
                "amount_total": Decimal("0"),
                "quantity_total": Decimal("0"),
                "category_emojis": [],
                "_emoji_seen": set(),
            }
        bucket = day_map[group_id]
        bucket["entry_count"] += 1
        if entry.amount is not None:
            bucket["amount_total"] += entry.amount
            if entry.category.type == TrackingCategory.FINANCE_EXPENSE:
                bucket["expense_total"] += entry.amount
        if entry.quantity is not None:
            bucket["quantity_total"] += entry.quantity
        emoji = (entry.category.emoji or "").strip()
        if emoji and emoji not in bucket["_emoji_seen"]:
            bucket["_emoji_seen"].add(emoji)
            bucket["category_emojis"].append(emoji)

    result: dict[date, list[dict]] = {}
    for day, groups in by_date.items():
        rows = []
        for bucket in sorted(groups.values(), key=lambda g: (g["sort_order"], g["name"])):
            bucket.pop("_emoji_seen", None)
            bucket.pop("sort_order", None)
            rows.append(bucket)
        result[day] = rows
    return result


def calendar_month(user, year: int, month: int) -> dict:
    start = date(year, month, 1)
    end = date(year, month, monthrange(year, month)[1])
    entries = (
        Entry.objects.filter(user=user, date__gte=start, date__lte=end)
        .values("date")
        .annotate(
            entry_count=Count("id"),
            expense_total=Sum(
                "amount",
                filter=Q(category__type=TrackingCategory.FINANCE_EXPENSE),
            ),
            habit_count=Count(
                "id",
                filter=Q(
                    category__type__in=[
                        TrackingCategory.HABIT,
                        TrackingCategory.FITNESS,
                    ]
                ),
            ),
        )
    )
    by_date = {row["date"]: row for row in entries}
    nightcaps = {
        row.date: row
        for row in NightCap.objects.filter(user=user, date__gte=start, date__lte=end)
    }
    groups_by_date = _calendar_group_summaries(user, start, end)

    days = []
    cursor = start
    while cursor <= end:
        row = by_date.get(cursor)
        entry_count = row["entry_count"] if row else 0
        nightcap = nightcaps.get(cursor)
        reflection = (nightcap.reflection if nightcap else "") or ""
        mood = (nightcap.mood if nightcap else "") or ""
        days.append(
            {
                "date": cursor,
                "has_entries": entry_count > 0,
                "has_reflection": bool(reflection),
                "has_nightcap": nightcap is not None,
                "nightcap_status": nightcap.status if nightcap else None,
                "mood": mood,
                "entry_count": entry_count,
                "expense_total": (row["expense_total"] if row else None) or Decimal("0"),
                "habit_count": row["habit_count"] if row else 0,
                "groups": groups_by_date.get(cursor, []),
            }
        )
        cursor += timedelta(days=1)

    return {"year": year, "month": month, "days": days}


def chart_series(
    user,
    *,
    period: str,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict:
    today = timezone.localdate()
    if period == "daily":
        if end_date is None:
            end_date = today
        if start_date is None:
            start_date = end_date.replace(day=1)
        entries = Entry.objects.filter(
            user=user, date__gte=start_date, date__lte=end_date
        )
        points_qs = (
            entries.values("date")
            .annotate(
                entry_count=Count("id"),
                expense_total=Sum(
                    "amount",
                    filter=Q(category__type=TrackingCategory.FINANCE_EXPENSE),
                ),
                income_total=Sum(
                    "amount",
                    filter=Q(category__type=TrackingCategory.FINANCE_INCOME),
                ),
            )
            .order_by("date")
        )
        by_date = {row["date"]: row for row in points_qs}
        points = []
        cursor = start_date
        while cursor <= end_date:
            row = by_date.get(cursor)
            points.append(
                {
                    "date": cursor,
                    "week_start": None,
                    "entry_count": row["entry_count"] if row else 0,
                    "expense_total": (row["expense_total"] if row else None)
                    or Decimal("0"),
                    "income_total": (row["income_total"] if row else None)
                    or Decimal("0"),
                }
            )
            cursor += timedelta(days=1)
        by_category = (
            entries.values(
                "category_id",
                "category__uuid",
                "category__name",
                "category__type",
            )
            .annotate(
                entry_count=Count("id"),
                amount_total=Sum("amount"),
                quantity_total=Sum("quantity"),
            )
            .order_by("category__type", "category__name")
        )
        return {
            "period": "daily",
            "start_date": start_date,
            "end_date": end_date,
            "points": points,
            "by_category": list(by_category),
        }

    if end_date is None:
        end_date = today
    if start_date is None:
        week_start = end_date - timedelta(days=end_date.weekday())
        start_date = week_start - timedelta(weeks=7)

    entries = Entry.objects.filter(user=user, date__gte=start_date, date__lte=end_date)
    points_qs = (
        entries.annotate(week_start=TruncWeek("date"))
        .values("week_start")
        .annotate(
            entry_count=Count("id"),
            expense_total=Sum(
                "amount",
                filter=Q(category__type=TrackingCategory.FINANCE_EXPENSE),
            ),
            income_total=Sum(
                "amount",
                filter=Q(category__type=TrackingCategory.FINANCE_INCOME),
            ),
        )
        .order_by("week_start")
    )
    points = [
        {
            "date": None,
            "week_start": row["week_start"].date()
            if hasattr(row["week_start"], "date")
            else row["week_start"],
            "entry_count": row["entry_count"],
            "expense_total": row["expense_total"] or Decimal("0"),
            "income_total": row["income_total"] or Decimal("0"),
        }
        for row in points_qs
    ]
    by_category = (
        entries.values(
            "category_id",
            "category__uuid",
            "category__name",
            "category__type",
        )
        .annotate(
            entry_count=Count("id"),
            amount_total=Sum("amount"),
            quantity_total=Sum("quantity"),
        )
        .order_by("category__type", "category__name")
    )
    return {
        "period": "weekly",
        "start_date": start_date,
        "end_date": end_date,
        "points": points,
        "by_category": list(by_category),
    }
