import operator
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal
from functools import reduce
from typing import NamedTuple
from uuid import UUID

from django.db.models import Count, Q, Sum
from django.utils import timezone

from categories.models import TrackingCategory

from .models import DayReflection, Entry, NightCap


class _ChartRow(NamedTuple):
    entry: Entry
    category: TrackingCategory
    mine: bool
    yours_amount: Decimal
    yours_quantity: Decimal


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
    favorite_moment: str | None = None,
    mood: str | None = None,
    status: str | None = None,
    replace_items: bool = False,
) -> dict:
    """Upsert NightCap for the day, one entry per category, optional reflection/mood.

    When replace_items is True, entries for the date that are not in `items`
    are deleted so a full NightCap edit can clear values.
    """
    nightcap = get_or_create_nightcap(user, ritual_date)
    if reflection is not None:
        nightcap.reflection = reflection
        sync_day_reflection(user, ritual_date, reflection)
    if favorite_moment is not None:
        nightcap.favorite_moment = favorite_moment
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

    seen_category_ids: list[int] = []
    for item in items:
        category = item["category"]
        defaults = {
            "label": item.get("label") or "",
            "notes": item.get("notes") or "",
            "amount": item.get("amount"),
            "quantity": item.get("quantity"),
            "nightcap": nightcap,
        }
        if not category.uses_completed_with():
            defaults["completed_with"] = Entry.COMPLETED_ALONE
        elif item.get("completed_with"):
            defaults["completed_with"] = item["completed_with"]
        Entry.objects.update_or_create(
            user=user,
            date=ritual_date,
            category=category,
            defaults=defaults,
        )
        seen_category_ids.append(category.id)

    if replace_items:
        stale = Entry.objects.filter(user=user, date=ritual_date)
        if seen_category_ids:
            stale = stale.exclude(category_id__in=seen_category_ids)
        stale.delete()

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
                "_cats": {},
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
        cat = entry.category
        cats = bucket["_cats"]
        if cat.id not in cats:
            cats[cat.id] = {
                "name": cat.name,
                "emoji": emoji,
                "unit": cat.unit or "",
                "metric_kind": cat.metric_kind,
                "type": cat.type,
                "amount": Decimal("0"),
                "quantity": Decimal("0"),
            }
        cat_row = cats[cat.id]
        if entry.amount is not None:
            cat_row["amount"] += entry.amount
        if entry.quantity is not None:
            cat_row["quantity"] += entry.quantity

    result: dict[date, list[dict]] = {}
    for day, groups in by_date.items():
        rows = []
        for bucket in sorted(groups.values(), key=lambda g: (g["sort_order"], g["name"])):
            cats = bucket.pop("_cats", {})
            bucket.pop("_emoji_seen", None)
            bucket.pop("sort_order", None)
            bucket["categories"] = sorted(
                cats.values(),
                key=lambda c: (
                    -c["amount"],
                    -c["quantity"],
                    c["name"],
                ),
            )
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
                "has_favorite_photo": bool(nightcap.favorite_photo) if nightcap else False,
                "favorite_moment": (
                    (nightcap.favorite_moment if nightcap else "") or ""
                ),
                "entry_count": entry_count,
                "expense_total": (row["expense_total"] if row else None) or Decimal("0"),
                "habit_count": row["habit_count"] if row else 0,
                "groups": groups_by_date.get(cursor, []),
            }
        )
        cursor += timedelta(days=1)

    return {"year": year, "month": month, "days": days}


_CHART_UNIT_ORDER = (
    "minutes",
    "miles",
    "km",
    "sessions",
    "reps",
    "pages",
    "glasses",
    "count",
)


def _chart_week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _chart_group_q(group: str) -> Q:
    q = Q(category__group__key=group)
    try:
        UUID(str(group))
    except (ValueError, TypeError, AttributeError):
        return q
    return q | Q(category__group__uuid=group)


def _category_matches_group(category: TrackingCategory, group: str) -> bool:
    grp = category.group
    if grp is None:
        return False
    if grp.key == group:
        return True
    try:
        UUID(str(group))
    except (ValueError, TypeError, AttributeError):
        return False
    return str(grp.uuid) == str(group)


def _viewer_shared_categories(user) -> dict[tuple[str, str], TrackingCategory]:
    from goals.models import Goal

    goals = Goal.objects.filter(
        user=user, is_active=True, scope=Goal.SCOPE_SHARED, accepted=True
    ).select_related("category", "category__group")
    return {(goal.category.name, goal.category.type): goal.category for goal in goals}


def _shared_category_ids(user) -> set[int]:
    return {category.id for category in _viewer_shared_categories(user).values()}


def _chart_partner(user):
    from accounts.partnerships import get_user_partnership

    partnership = get_user_partnership(user)
    if partnership is None:
        return None
    member = partnership.members.exclude(user=user).select_related("user").first()
    return member.user if member else None


def _entry_together_slice(
    entry: Entry, shared_ids: set[int], category: TrackingCategory | None = None
) -> str:
    """Together vs solo for chart filters.

    Workouts and habits use With Partner / Alone. Spend and other money
    categories follow the Together (shared) goal on that category.
    """
    category = category or entry.category
    if category.uses_completed_with():
        if entry.completed_with == Entry.COMPLETED_WITH_PARTNER:
            return "together"
        return "alone"
    if category.id in shared_ids:
        return "together"
    return "alone"


def _chart_row(entry: Entry, category: TrackingCategory, viewer_id: int) -> _ChartRow:
    mine = entry.user_id == viewer_id
    return _ChartRow(
        entry=entry,
        category=category,
        mine=mine,
        yours_amount=entry.amount if mine and entry.amount is not None else Decimal("0"),
        yours_quantity=(
            entry.quantity if mine and entry.quantity is not None else Decimal("0")
        ),
    )


def _dedupe_together_sessions(
    rows: list[tuple[Entry, TrackingCategory]],
    viewer_id: int,
) -> list[_ChartRow]:
    """Count one With Partner session when both people logged the same day."""
    passthrough: list[_ChartRow] = []
    grouped: dict[tuple, list[tuple[Entry, TrackingCategory]]] = {}
    for entry, category in rows:
        if not category.uses_completed_with():
            passthrough.append(_chart_row(entry, category, viewer_id))
            continue
        grouped.setdefault((entry.date, category.id), []).append((entry, category))

    out = list(passthrough)
    for group in grouped.values():
        with_partner = [
            row
            for row in group
            if row[0].completed_with == Entry.COMPLETED_WITH_PARTNER
        ]
        alone = [
            row
            for row in group
            if row[0].completed_with != Entry.COMPLETED_WITH_PARTNER
        ]
        if len(with_partner) >= 2:
            kept_entry, kept_cat = max(
                with_partner, key=lambda row: row[0].quantity or Decimal("0")
            )
            mine_entry = next(
                (row[0] for row in with_partner if row[0].user_id == viewer_id),
                None,
            )
            out.append(
                _ChartRow(
                    entry=kept_entry,
                    category=kept_cat,
                    mine=mine_entry is not None,
                    yours_amount=(
                        mine_entry.amount
                        if mine_entry is not None and mine_entry.amount is not None
                        else Decimal("0")
                    ),
                    yours_quantity=(
                        mine_entry.quantity
                        if mine_entry is not None and mine_entry.quantity is not None
                        else Decimal("0")
                    ),
                )
            )
            out.extend(_chart_row(entry, category, viewer_id) for entry, category in alone)
        else:
            out.extend(_chart_row(entry, category, viewer_id) for entry, category in group)
    return out


def _chart_entry_rows(
    user,
    *,
    start_date: date,
    end_date: date,
    group: str | None = None,
) -> list[_ChartRow]:
    """Own entries plus the partner's logs on Together categories."""
    entries_qs = (
        Entry.objects.filter(user=user, date__gte=start_date, date__lte=end_date)
        .select_related("category", "category__group")
        .order_by("date", "category__sort_order", "category__name")
    )
    if group:
        entries_qs = entries_qs.filter(_chart_group_q(group))
    rows = [(entry, entry.category) for entry in entries_qs]

    shared_map = _viewer_shared_categories(user)
    partner = _chart_partner(user)
    if partner is None or not shared_map:
        return _dedupe_together_sessions(rows, user.id)

    match = reduce(
        operator.or_,
        (Q(category__name=name, category__type=typ) for name, typ in shared_map),
    )
    partner_qs = (
        Entry.objects.filter(user=partner, date__gte=start_date, date__lte=end_date)
        .filter(match)
        .select_related("category", "category__group")
    )
    for entry in partner_qs:
        viewer_cat = shared_map.get((entry.category.name, entry.category.type))
        if viewer_cat is None:
            continue
        if group and not _category_matches_group(viewer_cat, group):
            continue
        rows.append((entry, viewer_cat))
    return _dedupe_together_sessions(rows, user.id)


def _empty_chart_bucket() -> dict:
    return {
        "entry_count": 0,
        "expense_total": Decimal("0"),
        "income_total": Decimal("0"),
        "together_count": 0,
        "alone_count": 0,
        "quantity_by_unit": {},
        "categories": {},
    }


def _finalize_quantity_units(unit_map: dict) -> list[dict]:
    rows = [
        {"unit": unit, "total": total}
        for unit, total in unit_map.items()
        if total
    ]
    rows.sort(
        key=lambda row: (
            _CHART_UNIT_ORDER.index(row["unit"])
            if row["unit"] in _CHART_UNIT_ORDER
            else 99,
            -row["total"],
        )
    )
    return rows


def _apply_chart_entry(
    bucket: dict, entry: Entry, category: TrackingCategory | None = None
) -> None:
    category = category or entry.category
    bucket["entry_count"] += 1
    if entry.amount is not None:
        if category.type == TrackingCategory.FINANCE_EXPENSE:
            bucket["expense_total"] += entry.amount
        elif category.type == TrackingCategory.FINANCE_INCOME:
            bucket["income_total"] += entry.amount
    if category.uses_completed_with():
        if entry.completed_with == Entry.COMPLETED_WITH_PARTNER:
            bucket["together_count"] += 1
        else:
            bucket["alone_count"] += 1
    if entry.quantity is not None and category.metric_kind != TrackingCategory.METRIC_AMOUNT:
        unit = category.unit or "count"
        unit_map = bucket["quantity_by_unit"]
        unit_map[unit] = unit_map.get(unit, Decimal("0")) + entry.quantity
    cats = bucket["categories"]
    cat_row = cats.get(category.id)
    if cat_row is None:
        cat_row = {
            "uuid": str(category.uuid),
            "name": category.name,
            "emoji": (category.emoji or "").strip(),
            "icon": category.icon or "",
            "type": category.type,
            "metric_kind": category.metric_kind,
            "unit": category.unit or "",
            "entry_count": 0,
            "amount": Decimal("0"),
            "quantity": Decimal("0"),
            "together_count": 0,
            "alone_count": 0,
        }
        cats[category.id] = cat_row
    cat_row["entry_count"] += 1
    if entry.amount is not None:
        cat_row["amount"] += entry.amount
    if entry.quantity is not None:
        cat_row["quantity"] += entry.quantity
    if category.uses_completed_with():
        if entry.completed_with == Entry.COMPLETED_WITH_PARTNER:
            cat_row["together_count"] += 1
        else:
            cat_row["alone_count"] += 1


def _point_payload(bucket: dict, *, day: date | None, week_start: date | None) -> dict:
    return {
        "date": day,
        "week_start": week_start,
        "entry_count": bucket["entry_count"],
        "expense_total": bucket["expense_total"],
        "income_total": bucket["income_total"],
        "together_count": bucket["together_count"],
        "alone_count": bucket["alone_count"],
        "quantity_by_unit": _finalize_quantity_units(bucket["quantity_by_unit"]),
        "by_category": sorted(
            bucket.get("categories", {}).values(),
            key=lambda row: (-row["amount"], -row["quantity"], row["name"]),
        ),
    }


def _chart_category_row(category: TrackingCategory, stats: dict) -> dict:
    group = category.group
    return {
        "category_id": category.id,
        "category__uuid": str(category.uuid),
        "category__name": category.name,
        "category__type": category.type,
        "uuid": str(category.uuid),
        "name": category.name,
        "emoji": (category.emoji or "").strip(),
        "icon": category.icon or "",
        "type": category.type,
        "metric_kind": category.metric_kind,
        "unit": category.unit or "",
        "group_uuid": str(group.uuid) if group else None,
        "group_key": group.key if group else None,
        "group_name": group.name if group else None,
        "entry_count": stats["entry_count"],
        "amount_total": stats["amount_total"],
        "quantity_total": stats["quantity_total"],
        "together_count": stats["together_count"],
        "alone_count": stats["alone_count"],
        "yours_amount": stats["yours_amount"],
        "yours_quantity": stats["yours_quantity"],
        "yours_entry_count": stats["yours_entry_count"],
    }


def _chart_group_row(group, stats: dict) -> dict:
    return {
        "uuid": group.uuid if group else None,
        "key": group.key if group else None,
        "name": group.name if group else "Ungrouped",
        "icon": group.icon if group else "",
        "entry_count": stats["entry_count"],
        "expense_total": stats["expense_total"],
        "amount_total": stats["amount_total"],
        "quantity_total": stats["quantity_total"],
        "together_count": stats["together_count"],
        "alone_count": stats["alone_count"],
        "category_emojis": stats["category_emojis"],
    }


def chart_series(
    user,
    *,
    period: str,
    start_date: date | None = None,
    end_date: date | None = None,
    group: str | None = None,
    with_filter: str | None = None,
) -> dict:
    today = timezone.localdate()
    if period == "daily":
        if end_date is None:
            end_date = today
        if start_date is None:
            start_date = end_date.replace(day=1)
    else:
        if end_date is None:
            end_date = today
        if start_date is None:
            week_start = end_date - timedelta(days=end_date.weekday())
            start_date = week_start - timedelta(weeks=7)

    rows = _chart_entry_rows(
        user, start_date=start_date, end_date=end_date, group=group
    )
    shared_ids = _shared_category_ids(user)
    if with_filter:
        rows = [
            row
            for row in rows
            if _entry_together_slice(row.entry, shared_ids, row.category)
            == with_filter
        ]

    point_buckets: dict[date, dict] = {}
    category_stats: dict[int, dict] = {}
    group_stats: dict = {}
    together_total = 0
    alone_total = 0

    for row in rows:
        entry = row.entry
        category = row.category
        bucket_key = entry.date if period == "daily" else _chart_week_start(entry.date)
        bucket = point_buckets.setdefault(bucket_key, _empty_chart_bucket())
        _apply_chart_entry(bucket, entry, category)

        cat_row = category_stats.get(category.id)
        if cat_row is None:
            cat_row = {
                "category": category,
                "entry_count": 0,
                "amount_total": Decimal("0"),
                "quantity_total": Decimal("0"),
                "together_count": 0,
                "alone_count": 0,
                "yours_amount": Decimal("0"),
                "yours_quantity": Decimal("0"),
                "yours_entry_count": 0,
            }
            category_stats[category.id] = cat_row
        cat_row["entry_count"] += 1
        if entry.amount is not None:
            cat_row["amount_total"] += entry.amount
        if entry.quantity is not None:
            cat_row["quantity_total"] += entry.quantity
        if row.mine:
            cat_row["yours_amount"] += row.yours_amount
            cat_row["yours_quantity"] += row.yours_quantity
            cat_row["yours_entry_count"] += 1
        if category.uses_completed_with():
            if entry.completed_with == Entry.COMPLETED_WITH_PARTNER:
                cat_row["together_count"] += 1
                together_total += 1
            else:
                cat_row["alone_count"] += 1
                alone_total += 1

        grp = category.group
        group_id = grp.id if grp else None
        g_row = group_stats.get(group_id)
        if g_row is None:
            g_row = {
                "group": grp,
                "entry_count": 0,
                "expense_total": Decimal("0"),
                "amount_total": Decimal("0"),
                "quantity_total": Decimal("0"),
                "together_count": 0,
                "alone_count": 0,
                "category_emojis": [],
                "_emoji_seen": set(),
            }
            group_stats[group_id] = g_row
        g_row["entry_count"] += 1
        if entry.amount is not None:
            g_row["amount_total"] += entry.amount
            if category.type == TrackingCategory.FINANCE_EXPENSE:
                g_row["expense_total"] += entry.amount
        if entry.quantity is not None:
            g_row["quantity_total"] += entry.quantity
        if category.uses_completed_with():
            if entry.completed_with == Entry.COMPLETED_WITH_PARTNER:
                g_row["together_count"] += 1
            else:
                g_row["alone_count"] += 1
        emoji = (category.emoji or "").strip()
        if emoji and emoji not in g_row["_emoji_seen"]:
            g_row["_emoji_seen"].add(emoji)
            g_row["category_emojis"].append(emoji)

    if period == "daily":
        points = []
        cursor = start_date
        while cursor <= end_date:
            bucket = point_buckets.get(cursor) or _empty_chart_bucket()
            points.append(_point_payload(bucket, day=cursor, week_start=None))
            cursor += timedelta(days=1)
    else:
        points = []
        cursor = _chart_week_start(start_date)
        last = _chart_week_start(end_date)
        while cursor <= last:
            bucket = point_buckets.get(cursor) or _empty_chart_bucket()
            points.append(_point_payload(bucket, day=None, week_start=cursor))
            cursor += timedelta(weeks=1)

    by_category = [
        _chart_category_row(stats["category"], stats)
        for stats in sorted(
            category_stats.values(),
            key=lambda row: (row["category"].type, row["category"].name),
        )
    ]
    by_group = []
    for stats in sorted(
        group_stats.values(),
        key=lambda row: (
            row["group"].sort_order if row["group"] else 9999,
            row["group"].name if row["group"] else "Ungrouped",
        ),
    ):
        stats.pop("_emoji_seen", None)
        by_group.append(_chart_group_row(stats["group"], stats))

    return {
        "period": period,
        "start_date": start_date,
        "end_date": end_date,
        "points": points,
        "by_category": by_category,
        "by_group": by_group,
        "together": {
            "together_count": together_total,
            "alone_count": alone_total,
        },
    }


def _entry_has_logged_value(entry: Entry, metric_kind: str) -> bool:
    if metric_kind == TrackingCategory.METRIC_AMOUNT:
        return entry.amount is not None
    return entry.quantity is not None


def shared_ritual_hints(user, ritual_date: date) -> dict:
    """Partner values on Together categories for this NightCap date.

    Matching uses the same name + type rule as shared goal progress. Hints are
    keyed to the current user's category UUID so the ritual UI can attach them
    without overwriting local input.
    """
    from accounts.partnerships import get_user_partnership
    from goals.models import Goal

    partnership = get_user_partnership(user)
    shared_goals = list(
        Goal.objects.filter(
            user=user, is_active=True, scope=Goal.SCOPE_SHARED, accepted=True
        ).select_related("category")
    )
    shared_uuids = [goal.category.uuid for goal in shared_goals]

    if partnership is None:
        return {
            "partner_username": None,
            "shared_category_uuids": shared_uuids,
            "entries": [],
        }

    partner_member = (
        partnership.members.exclude(user=user).select_related("user").first()
    )
    if partner_member is None:
        return {
            "partner_username": None,
            "shared_category_uuids": shared_uuids,
            "entries": [],
        }

    partner = partner_member.user
    if not shared_goals:
        return {
            "partner_username": partner.username,
            "shared_category_uuids": [],
            "entries": [],
        }

    keys = {(goal.category.name, goal.category.type) for goal in shared_goals}
    match = reduce(operator.or_, (Q(name=name, type=typ) for name, typ in keys))
    partner_cats = list(TrackingCategory.objects.filter(user=partner).filter(match))
    partner_by_key = {(cat.name, cat.type): cat for cat in partner_cats}
    entries_by_cat = {
        entry.category_id: entry
        for entry in Entry.objects.filter(
            user=partner,
            date=ritual_date,
            category_id__in=[cat.id for cat in partner_cats],
        )
    }

    hints = []
    for goal in shared_goals:
        category = goal.category
        partner_cat = partner_by_key.get((category.name, category.type))
        if partner_cat is None:
            continue
        entry = entries_by_cat.get(partner_cat.id)
        if entry is None or not _entry_has_logged_value(entry, category.metric_kind):
            continue
        hints.append(
            {
                "category_uuid": category.uuid,
                "partner_username": partner.username,
                "metric_kind": category.metric_kind,
                "unit": category.unit,
                "amount": entry.amount,
                "quantity": entry.quantity,
                "completed_with": entry.completed_with,
            }
        )

    return {
        "partner_username": partner.username,
        "shared_category_uuids": shared_uuids,
        "entries": hints,
    }
