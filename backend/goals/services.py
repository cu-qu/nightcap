import operator
from calendar import monthrange
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from functools import reduce

from django.db.models import Count, Q, Sum
from django.utils import timezone

from categories.models import TrackingCategory
from entries.models import Entry

from .models import Goal


@dataclass
class GoalProgress:
    goal_id: int
    category_id: int
    category_name: str
    period: str
    period_start: date
    period_end: date
    direction: str
    target_value: Decimal
    current_value: Decimal
    remaining_value: Decimal
    percent_used: float
    status: str
    warn_at_percent: int
    goal_uuid: str | None = None
    category_uuid: str | None = None

    def as_dict(self):
        return {
            "goal_id": self.goal_id,
            "goal_uuid": str(self.goal_uuid) if self.goal_uuid else None,
            "category_id": self.category_id,
            "category_uuid": str(self.category_uuid) if self.category_uuid else None,
            "category_name": self.category_name,
            "period": self.period,
            "period_start": self.period_start,
            "period_end": self.period_end,
            "direction": self.direction,
            "target_value": self.target_value,
            "current_value": self.current_value,
            "remaining_value": self.remaining_value,
            "percent_used": self.percent_used,
            "status": self.status,
            "status_label": status_to_label(self.status, self.direction),
            "warn_at_percent": self.warn_at_percent,
        }


def status_to_label(status: str, direction: str) -> str:
    """Map internal status codes to mobile-friendly on-track / behind labels."""
    if status == "ok":
        return "on_track"
    if status == "warning":
        return "at_risk"
    if status == "exceeded":
        return "behind"
    if status == "reached":
        return "reached"
    return status


def get_period_bounds(period: str, reference_date: date | None = None) -> tuple[date, date]:
    reference_date = reference_date or timezone.localdate()

    if period == Goal.PERIOD_DAILY:
        return reference_date, reference_date
    if period == Goal.PERIOD_WEEKLY:
        start = reference_date - timedelta(days=reference_date.weekday())
        return start, start + timedelta(days=6)
    if period == Goal.PERIOD_MONTHLY:
        start = reference_date.replace(day=1)
        last_day = monthrange(reference_date.year, reference_date.month)[1]
        end = reference_date.replace(day=last_day)
        return start, end
    raise ValueError(f"Unsupported period: {period}")


def count_week_starts_in_month(year: int, month: int) -> int:
    """
    Count Mon–Sun weeks that start in this calendar month.

    Matches `get_period_bounds(weekly)` (Monday start). Months have 4 or 5
    Monday week-starts depending on the calendar (handles leap years / year edges).

    Example: $45/week × 4 Mondays in July 2026 → $180 month equivalent.
    """
    days_in_month = monthrange(year, month)[1]
    return sum(
        1
        for day in range(1, days_in_month + 1)
        if date(year, month, day).weekday() == 0
    )


def build_progress(
    *,
    goal: Goal,
    period_start: date,
    period_end: date,
    target_value: Decimal,
    current_value: Decimal,
) -> GoalProgress:
    if target_value > 0:
        percent_used = float((current_value / target_value) * 100)
    else:
        percent_used = 0.0
    remaining_value = target_value - current_value
    if goal.direction == Goal.DIRECTION_MIN:
        remaining_value = max(Decimal("0"), target_value - current_value)
    return GoalProgress(
        goal_id=goal.id,
        goal_uuid=str(goal.uuid),
        category_id=goal.category_id,
        category_uuid=str(goal.category.uuid),
        category_name=goal.category.name,
        period=goal.period,
        period_start=period_start,
        period_end=period_end,
        direction=goal.direction,
        target_value=target_value,
        current_value=current_value,
        remaining_value=remaining_value,
        percent_used=round(percent_used, 2),
        status=_compute_status(goal.direction, percent_used, goal.warn_at_percent),
        warn_at_percent=goal.warn_at_percent,
    )


def scale_weekly_goal_to_month(
    goal: Goal, reference_date: date | None = None
) -> tuple[GoalProgress, int, Decimal]:
    """
    Expand a weekly goal into the calendar month for monthly summaries.

    - weeks_in_month = Mondays falling in that month (4 or 5)
    - target = weekly_target × weeks_in_month
    - current = category entries across the full calendar month
    """
    reference_date = reference_date or timezone.localdate()
    month_start, month_end = get_period_bounds(Goal.PERIOD_MONTHLY, reference_date)
    weeks_in_month = count_week_starts_in_month(
        reference_date.year, reference_date.month
    )
    if weeks_in_month < 1:
        weeks_in_month = 1
    base_target = goal.target_value
    month_target = base_target * weeks_in_month
    current_value = aggregate_goal_entries(goal, month_start, month_end)
    progress = build_progress(
        goal=goal,
        period_start=month_start,
        period_end=month_end,
        target_value=month_target,
        current_value=current_value,
    )
    return progress, weeks_in_month, base_target


def aggregate_entries(user, category, start: date, end: date, metric_kind: str) -> Decimal:
    queryset = Entry.objects.filter(
        user=user,
        category=category,
        date__gte=start,
        date__lte=end,
    )
    if metric_kind == TrackingCategory.METRIC_AMOUNT:
        total = queryset.aggregate(total=Sum("amount"))["total"]
    elif metric_kind == TrackingCategory.METRIC_QUANTITY:
        total = queryset.aggregate(total=Sum("quantity"))["total"]
    else:
        total = queryset.filter(quantity__gte=1).aggregate(total=Count("id"))["total"]
    return Decimal(total or 0)


def entry_metric_value(entry: Entry, metric_kind: str) -> Decimal:
    if metric_kind == TrackingCategory.METRIC_AMOUNT:
        return Decimal(entry.amount or 0)
    if metric_kind == TrackingCategory.METRIC_QUANTITY:
        return Decimal(entry.quantity or 0)
    if entry.quantity is not None and entry.quantity >= 1:
        return Decimal("1")
    return Decimal("0")


def combine_shared_day_values(day_entries: list[Entry], metric_kind: str) -> Decimal:
    """Count a shared day once when both partners marked With Partner.

    If both logged the matching category as `with_partner` on the same date,
    take the max of those values (typically the same session). Otherwise sum
    whatever was logged — Alone + Alone, or one partner only.
    """
    if not day_entries:
        return Decimal("0")
    partner_values = [
        entry_metric_value(entry, metric_kind)
        for entry in day_entries
        if entry.completed_with == Entry.COMPLETED_WITH_PARTNER
    ]
    if len(partner_values) >= 2:
        alone_total = sum(
            (
                entry_metric_value(entry, metric_kind)
                for entry in day_entries
                if entry.completed_with != Entry.COMPLETED_WITH_PARTNER
            ),
            Decimal("0"),
        )
        return max(partner_values) + alone_total
    return sum(
        (entry_metric_value(entry, metric_kind) for entry in day_entries),
        Decimal("0"),
    )


def partner_categories_for_goal(goal: Goal) -> list[tuple]:
    """Categories that roll into this goal (both partners when shared)."""
    if goal.scope != Goal.SCOPE_SHARED or not goal.partnership_id or not goal.accepted:
        return [(goal.user, goal.category)]
    accepted_user_ids = list(
        Goal.objects.filter(
            partnership_id=goal.partnership_id,
            scope=Goal.SCOPE_SHARED,
            is_active=True,
            accepted=True,
            category__name=goal.category.name,
            category__type=goal.category.type,
        ).values_list("user_id", flat=True)
    )
    categories = TrackingCategory.objects.filter(
        user_id__in=accepted_user_ids,
        name=goal.category.name,
        type=goal.category.type,
    ).select_related("user")
    pairs = [(category.user, category) for category in categories]
    return pairs or [(goal.user, goal.category)]


def aggregate_goal_entries(goal: Goal, start: date, end: date) -> Decimal:
    metric = goal.category.metric_kind
    pairs = partner_categories_for_goal(goal)
    # Spend always sums both partners. With Partner dedupe is for workouts/habits.
    if len(pairs) < 2 or not goal.category.uses_completed_with():
        total = Decimal("0")
        for user, category in pairs:
            total += aggregate_entries(user, category, start, end, metric)
        return total

    match = reduce(
        operator.or_,
        (Q(user=user, category=category) for user, category in pairs),
    )
    entries = Entry.objects.filter(match, date__gte=start, date__lte=end)
    by_date: dict[date, list[Entry]] = defaultdict(list)
    for entry in entries:
        by_date[entry.date].append(entry)
    total = Decimal("0")
    for day_entries in by_date.values():
        total += combine_shared_day_values(day_entries, metric)
    return total


def _compute_status(direction: str, percent_used: float, warn_at_percent: int) -> str:
    if direction == Goal.DIRECTION_MAX:
        if percent_used >= 100:
            return "exceeded"
        if percent_used >= warn_at_percent:
            return "warning"
        return "ok"
    if percent_used >= 100:
        return "reached"
    if percent_used < warn_at_percent:
        return "warning"
    return "ok"


def compute_goal_progress(goal: Goal, reference_date: date | None = None) -> GoalProgress:
    reference_date = reference_date or timezone.localdate()
    period_start, period_end = get_period_bounds(goal.period, reference_date)
    current_value = aggregate_goal_entries(goal, period_start, period_end)
    return build_progress(
        goal=goal,
        period_start=period_start,
        period_end=period_end,
        target_value=goal.target_value,
        current_value=current_value,
    )


def compute_all_goal_progress(user, reference_date: date | None = None) -> list[GoalProgress]:
    goals = (
        Goal.objects.filter(user=user, is_active=True)
        .exclude(scope=Goal.SCOPE_SHARED, accepted=False)
        .select_related("category", "partnership")
    )
    return [compute_goal_progress(goal, reference_date) for goal in goals]


# Simple mobile health labels for goal cards / group summaries.
HEALTH_HEALTHY = "healthy"
HEALTH_CLOSE = "close"
HEALTH_BEHIND = "behind"
HEALTH_PASSED = "passed"
HEALTH_OVER = "over"

MODE_STAY_UNDER = "stay_under"
MODE_PASS = "pass"
MODE_COMPLETED = "completed"


def goal_mode(goal: Goal) -> str:
    """Map direction + metric to simple UX modes."""
    if goal.direction == Goal.DIRECTION_MAX:
        return MODE_STAY_UNDER
    if goal.category.metric_kind == TrackingCategory.METRIC_BOOLEAN:
        return MODE_COMPLETED
    return MODE_PASS


def goal_health(direction: str, percent_used: float, warn_at_percent: int) -> str:
    """
    healthy  — comfortably on track / still working toward the goal
    close    — near spend limit (stay under) or near hit (pass/completed)
    passed   — pass/completed target hit
    over     — stay-under budget blown
    behind   — reserved (not used by default mapping)
    """
    if direction == Goal.DIRECTION_MAX:
        if percent_used >= 100:
            return HEALTH_OVER
        if percent_used >= warn_at_percent:
            return HEALTH_CLOSE
        return HEALTH_HEALTHY

    # min: pass / completed
    if percent_used >= 100:
        return HEALTH_PASSED
    if percent_used >= warn_at_percent:
        return HEALTH_CLOSE
    return HEALTH_HEALTHY


def _empty_health_counts() -> dict:
    return {
        "total": 0,
        "healthy": 0,
        "close": 0,
        "behind": 0,
        "passed": 0,
        "over": 0,
        "stay_under": 0,
        "pass": 0,
        "completed": 0,
    }


def _empty_mode_totals() -> dict:
    return {
        "goal_count": 0,
        "target_total": Decimal("0"),
        "current_total": Decimal("0"),
        "remaining_total": Decimal("0"),
        "percent_used": 0.0,
        "healthy": 0,
        "close": 0,
        "behind": 0,
        "passed": 0,
        "over": 0,
    }


def _empty_metrics() -> dict:
    return {
        "stay_under": _empty_mode_totals(),
        "pass": _empty_mode_totals(),
        "completed": _empty_mode_totals(),
        # Combined across all modes (useful for section headers).
        "target_total": Decimal("0"),
        "current_total": Decimal("0"),
        "remaining_total": Decimal("0"),
        "percent_used": 0.0,
        "avg_percent_used": 0.0,
    }


def _finalize_mode_totals(mode_totals: dict) -> dict:
    target = mode_totals["target_total"]
    current = mode_totals["current_total"]
    if target > 0:
        mode_totals["percent_used"] = round(float((current / target) * 100), 2)
    else:
        mode_totals["percent_used"] = 0.0
    return mode_totals


def _finalize_metrics(metrics: dict, goal_rows: list[dict]) -> dict:
    for mode in (MODE_STAY_UNDER, MODE_PASS, MODE_COMPLETED):
        metrics[mode] = _finalize_mode_totals(metrics[mode])

    target = metrics["target_total"]
    current = metrics["current_total"]
    if target > 0:
        metrics["percent_used"] = round(float((current / target) * 100), 2)
    else:
        metrics["percent_used"] = 0.0

    if goal_rows:
        metrics["avg_percent_used"] = round(
            sum(row["percent_used"] for row in goal_rows) / len(goal_rows), 2
        )
    else:
        metrics["avg_percent_used"] = 0.0
    return metrics


def _accumulate_metrics(metrics: dict, mode: str, progress: GoalProgress, health: str) -> None:
    bucket = metrics[mode]
    bucket["goal_count"] += 1
    bucket["target_total"] += progress.target_value
    bucket["current_total"] += progress.current_value
    bucket["remaining_total"] += progress.remaining_value
    bucket[health] += 1

    metrics["target_total"] += progress.target_value
    metrics["current_total"] += progress.current_value
    metrics["remaining_total"] += progress.remaining_value


def _periods_for_filter(period: str | None) -> list[str] | None:
    """
    Monthly views include weekly goals so week progress rolls into the month picture.
    Weekly views stay week-only. Daily stays daily-only.
    """
    if period is None:
        return None
    if period == Goal.PERIOD_MONTHLY:
        return [Goal.PERIOD_MONTHLY, Goal.PERIOD_WEEKLY]
    return [period]


def _empty_metrics_by_period() -> dict:
    return {
        Goal.PERIOD_WEEKLY: _empty_metrics(),
        Goal.PERIOD_MONTHLY: _empty_metrics(),
        Goal.PERIOD_DAILY: _empty_metrics(),
    }


def _finalize_metrics_by_period(
    metrics_by_period: dict, rows_by_period: dict[str, list[dict]]
) -> dict:
    finalized = {}
    for key, metrics in metrics_by_period.items():
        finalized[key] = _finalize_metrics(metrics, rows_by_period.get(key, []))
    return finalized


def compute_group_goal_summary(
    user,
    *,
    period: str | None = None,
    reference_date: date | None = None,
) -> dict:
    """
    Active goals rolled up by category group, with health, mode, and totals.

    Optional `period` filter:
    - weekly → weekly goals only
    - monthly → monthly goals **plus** weekly goals scaled into the month
      (weekly_target × Mondays-in-month; current = full-month entries)
    - daily → daily goals only

    `metrics` is the combined rollup of included goals (month-scaled for rolled weeklies).
    `metrics_by_period.monthly` includes true monthly goals and scaled weekly rollups.
    `metrics_by_period.weekly` keeps native this-week progress for rolled weeklies.
    """
    from categories.models import CategoryGroup

    reference_date = reference_date or timezone.localdate()
    include_periods = _periods_for_filter(period)
    includes_weekly_rolled_in = period == Goal.PERIOD_MONTHLY

    goals = (
        Goal.objects.filter(user=user, is_active=True)
        .exclude(scope=Goal.SCOPE_SHARED, accepted=False)
        .select_related("category", "category__group", "partnership")
        .order_by(
            "category__group__sort_order",
            "category__sort_order",
            "category__name",
            "period",
        )
    )
    if include_periods is not None:
        goals = goals.filter(period__in=include_periods)

    # Preserve default group order, then any other groups, then ungrouped.
    groups = list(
        CategoryGroup.objects.filter(user=user).order_by("sort_order", "name")
    )
    buckets: dict[str | None, dict] = {}
    for group in groups:
        buckets[str(group.uuid)] = {
            "uuid": str(group.uuid),
            "key": group.key,
            "name": group.name,
            "icon": group.icon or "",
            "goals": [],
            "counts": _empty_health_counts(),
            "metrics": _empty_metrics(),
            "metrics_by_period": _empty_metrics_by_period(),
            "_rows_by_period": {
                Goal.PERIOD_WEEKLY: [],
                Goal.PERIOD_MONTHLY: [],
                Goal.PERIOD_DAILY: [],
            },
        }
    buckets[None] = {
        "uuid": None,
        "key": None,
        "name": "Ungrouped",
        "icon": "",
        "goals": [],
        "counts": _empty_health_counts(),
        "metrics": _empty_metrics(),
        "metrics_by_period": _empty_metrics_by_period(),
        "_rows_by_period": {
            Goal.PERIOD_WEEKLY: [],
            Goal.PERIOD_MONTHLY: [],
            Goal.PERIOD_DAILY: [],
        },
    }

    overall_counts = _empty_health_counts()
    overall_metrics = _empty_metrics()
    overall_metrics_by_period = _empty_metrics_by_period()
    overall_rows_by_period: dict[str, list[dict]] = {
        Goal.PERIOD_WEEKLY: [],
        Goal.PERIOD_MONTHLY: [],
        Goal.PERIOD_DAILY: [],
    }
    all_rows: list[dict] = []

    for goal in goals:
        rolls_into_month = (
            includes_weekly_rolled_in and goal.period == Goal.PERIOD_WEEKLY
        )
        weeks_in_month = None
        base_target_value = None
        weekly_native = None

        if rolls_into_month:
            progress, weeks_in_month, base_target_value = scale_weekly_goal_to_month(
                goal, reference_date=reference_date
            )
            weekly_native = compute_goal_progress(goal, reference_date=reference_date)
        else:
            progress = compute_goal_progress(goal, reference_date=reference_date)

        mode = goal_mode(goal)
        health = goal_health(
            goal.direction, progress.percent_used, goal.warn_at_percent
        )
        group = goal.category.group
        bucket_key = str(group.uuid) if group else None
        if bucket_key not in buckets:
            # Group was deleted or orphaned — treat as ungrouped.
            bucket_key = None
        bucket = buckets[bucket_key]
        row = {
            "uuid": str(goal.uuid),
            "id": goal.id,
            "display_name": goal.display_name,
            "mode": mode,
            "health": health,
            "period": goal.period,
            "rolls_into_month": rolls_into_month,
            "weeks_in_month": weeks_in_month,
            "base_target_value": base_target_value,
            "direction": goal.direction,
            "target_value": progress.target_value,
            "current_value": progress.current_value,
            "remaining_value": progress.remaining_value,
            "percent_used": progress.percent_used,
            "period_start": progress.period_start,
            "period_end": progress.period_end,
            "warn_at_percent": goal.warn_at_percent,
            "scope": goal.scope,
            "category": {
                "uuid": str(goal.category.uuid),
                "name": goal.category.name,
                "emoji": goal.category.emoji or "",
                "icon": goal.category.icon or "",
                "metric_kind": goal.category.metric_kind,
                "unit": goal.category.unit,
            },
        }
        if weekly_native is not None:
            row["weekly_progress"] = {
                "target_value": weekly_native.target_value,
                "current_value": weekly_native.current_value,
                "remaining_value": weekly_native.remaining_value,
                "percent_used": weekly_native.percent_used,
                "period_start": weekly_native.period_start,
                "period_end": weekly_native.period_end,
                "health": goal_health(
                    goal.direction,
                    weekly_native.percent_used,
                    goal.warn_at_percent,
                ),
            }

        bucket["goals"].append(row)
        all_rows.append(row)

        # Scaled month values count as monthly metrics; keep native week totals separate.
        metrics_period_key = (
            Goal.PERIOD_MONTHLY if rolls_into_month else goal.period
        )
        bucket["_rows_by_period"][metrics_period_key].append(row)
        overall_rows_by_period[metrics_period_key].append(row)

        bucket["counts"]["total"] += 1
        bucket["counts"][health] += 1
        bucket["counts"][mode] += 1
        _accumulate_metrics(bucket["metrics"], mode, progress, health)
        _accumulate_metrics(
            bucket["metrics_by_period"][metrics_period_key], mode, progress, health
        )
        if weekly_native is not None:
            native_health = goal_health(
                goal.direction, weekly_native.percent_used, goal.warn_at_percent
            )
            _accumulate_metrics(
                bucket["metrics_by_period"][Goal.PERIOD_WEEKLY],
                mode,
                weekly_native,
                native_health,
            )
            weekly_stub = {"percent_used": weekly_native.percent_used}
            bucket["_rows_by_period"][Goal.PERIOD_WEEKLY].append(weekly_stub)
            overall_rows_by_period[Goal.PERIOD_WEEKLY].append(weekly_stub)

        overall_counts["total"] += 1
        overall_counts[health] += 1
        overall_counts[mode] += 1
        _accumulate_metrics(overall_metrics, mode, progress, health)
        _accumulate_metrics(
            overall_metrics_by_period[metrics_period_key], mode, progress, health
        )
        if weekly_native is not None:
            native_health = goal_health(
                goal.direction, weekly_native.percent_used, goal.warn_at_percent
            )
            _accumulate_metrics(
                overall_metrics_by_period[Goal.PERIOD_WEEKLY],
                mode,
                weekly_native,
                native_health,
            )

    # Finalize percent rollups per group, then overall.
    for bucket in buckets.values():
        rows_by_period = bucket.pop("_rows_by_period")
        bucket["metrics"] = _finalize_metrics(bucket["metrics"], bucket["goals"])
        bucket["metrics_by_period"] = _finalize_metrics_by_period(
            bucket["metrics_by_period"], rows_by_period
        )
        # Shape period keys for the serializer
        bucket["metrics_by_period"] = {
            "weekly": bucket["metrics_by_period"][Goal.PERIOD_WEEKLY],
            "monthly": bucket["metrics_by_period"][Goal.PERIOD_MONTHLY],
            "daily": bucket["metrics_by_period"][Goal.PERIOD_DAILY],
        }
    overall_metrics = _finalize_metrics(overall_metrics, all_rows)
    overall_metrics_by_period = _finalize_metrics_by_period(
        overall_metrics_by_period, overall_rows_by_period
    )

    weeks_in_month = None
    if period == Goal.PERIOD_MONTHLY:
        weeks_in_month = count_week_starts_in_month(
            reference_date.year, reference_date.month
        )

    # Drop empty ungrouped; keep empty default groups so UI can show sections.
    ordered_groups = []
    for group in groups:
        bucket = buckets[str(group.uuid)]
        if bucket["counts"]["total"] > 0 or group.is_default:
            ordered_groups.append(bucket)
    if buckets[None]["counts"]["total"] > 0:
        ordered_groups.append(buckets[None])

    return {
        "period": period,
        "includes_weekly_rolled_in": includes_weekly_rolled_in,
        "weeks_in_month": weeks_in_month,
        "reference_date": reference_date,
        "counts": overall_counts,
        "metrics": overall_metrics,
        "metrics_by_period": {
            "weekly": overall_metrics_by_period[Goal.PERIOD_WEEKLY],
            "monthly": overall_metrics_by_period[Goal.PERIOD_MONTHLY],
            "daily": overall_metrics_by_period[Goal.PERIOD_DAILY],
        },
        "groups": ordered_groups,
    }
