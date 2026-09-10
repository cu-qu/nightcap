from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from categories.models import TrackingCategory
from entries.models import Entry
from goals.models import Goal
from goals.services import combine_shared_day_values, compute_goal_progress


class GoalProgressTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="goaluser",
            email="goal@example.com",
            password="testpass123",
        )
        self.other = User.objects.create_user(
            username="other",
            email="other@example.com",
            password="testpass123",
        )
        self.eating_out = TrackingCategory.objects.create(
            user=self.user,
            name="Eating Out",
            type=TrackingCategory.FINANCE_EXPENSE,
            metric_kind=TrackingCategory.METRIC_AMOUNT,
            unit="usd",
        )
        self.push_ups = TrackingCategory.objects.create(
            user=self.user,
            name="Push Ups",
            type=TrackingCategory.FITNESS,
            metric_kind=TrackingCategory.METRIC_QUANTITY,
            unit="reps",
        )
        self.other_category = TrackingCategory.objects.create(
            user=self.other,
            name="Other Dining",
            type=TrackingCategory.FINANCE_EXPENSE,
            metric_kind=TrackingCategory.METRIC_AMOUNT,
            unit="usd",
        )

    def test_monthly_max_goal_progress_and_status(self):
        goal = Goal.objects.create(
            user=self.user,
            category=self.eating_out,
            period=Goal.PERIOD_MONTHLY,
            direction=Goal.DIRECTION_MAX,
            target_value=Decimal("50.00"),
            warn_at_percent=80,
        )
        today = date.today()
        day1 = today.replace(day=1)
        day2 = day1 + timedelta(days=1)
        day3 = day1 + timedelta(days=2)
        Entry.objects.create(
            user=self.user,
            category=self.eating_out,
            date=day1,
            label="Taco Bell",
            amount=Decimal("38.00"),
        )
        progress = compute_goal_progress(goal, reference_date=today)
        self.assertEqual(progress.current_value, Decimal("38.00"))
        self.assertEqual(progress.status, "ok")
        self.assertEqual(progress.as_dict()["status_label"], "on_track")
        self.assertEqual(progress.percent_used, 76.0)

        Entry.objects.create(
            user=self.user,
            category=self.eating_out,
            date=day2,
            label="Coffee",
            amount=Decimal("8.00"),
        )
        progress = compute_goal_progress(goal, reference_date=today)
        self.assertEqual(progress.current_value, Decimal("46.00"))
        self.assertEqual(progress.status, "warning")
        self.assertEqual(progress.as_dict()["status_label"], "at_risk")

        Entry.objects.create(
            user=self.user,
            category=self.eating_out,
            date=day3,
            label="Dinner",
            amount=Decimal("10.00"),
        )
        progress = compute_goal_progress(goal, reference_date=today)
        self.assertEqual(progress.current_value, Decimal("56.00"))
        self.assertEqual(progress.status, "exceeded")
        self.assertEqual(progress.as_dict()["status_label"], "behind")

    def test_weekly_min_goal_progress(self):
        goal = Goal.objects.create(
            user=self.user,
            category=self.push_ups,
            period=Goal.PERIOD_WEEKLY,
            direction=Goal.DIRECTION_MIN,
            target_value=Decimal("100"),
            warn_at_percent=80,
        )
        today = date.today()
        monday = today - timedelta(days=today.weekday())
        Entry.objects.create(
            user=self.user,
            category=self.push_ups,
            date=monday,
            label="Morning set",
            quantity=25,
        )
        progress = compute_goal_progress(goal, reference_date=today)
        self.assertEqual(progress.current_value, Decimal("25"))
        self.assertEqual(progress.status, "warning")

        Entry.objects.create(
            user=self.user,
            category=self.push_ups,
            date=monday + timedelta(days=1),
            label="Evening set",
            quantity=80,
        )
        progress = compute_goal_progress(goal, reference_date=today)
        self.assertEqual(progress.current_value, Decimal("105"))
        self.assertEqual(progress.status, "reached")
        self.assertEqual(progress.as_dict()["status_label"], "reached")

    def test_goal_api_rejects_other_users_category(self):
        client = APIClient()
        client.force_authenticate(user=self.user)
        resp = client.post(
            "/api/v1/goals/",
            {
                "category": self.other_category.id,
                "period": "monthly",
                "direction": "max",
                "target_value": "50.00",
            },
        )
        self.assertEqual(resp.status_code, 400)

    def test_goals_progress_list_endpoint(self):
        Goal.objects.create(
            user=self.user,
            category=self.eating_out,
            period=Goal.PERIOD_MONTHLY,
            direction=Goal.DIRECTION_MAX,
            target_value=Decimal("50.00"),
        )
        client = APIClient()
        client.force_authenticate(user=self.user)
        resp = client.get("/api/v1/goals/progress/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 1)
        self.assertEqual(resp.json()[0]["category_name"], "Eating Out")


class CombineSharedDayValuesTests(TestCase):
    def test_both_with_partner_counts_once(self):
        entries = [
            Entry(quantity=Decimal("1"), completed_with=Entry.COMPLETED_WITH_PARTNER),
            Entry(quantity=Decimal("1"), completed_with=Entry.COMPLETED_WITH_PARTNER),
        ]
        self.assertEqual(
            combine_shared_day_values(entries, TrackingCategory.METRIC_QUANTITY),
            Decimal("1"),
        )

    def test_mixed_alone_and_partner_sums(self):
        entries = [
            Entry(quantity=Decimal("1"), completed_with=Entry.COMPLETED_WITH_PARTNER),
            Entry(quantity=Decimal("1"), completed_with=Entry.COMPLETED_ALONE),
        ]
        self.assertEqual(
            combine_shared_day_values(entries, TrackingCategory.METRIC_QUANTITY),
            Decimal("2"),
        )

    def test_single_with_partner_counts_full_value(self):
        entries = [
            Entry(quantity=Decimal("2"), completed_with=Entry.COMPLETED_WITH_PARTNER),
        ]
        self.assertEqual(
            combine_shared_day_values(entries, TrackingCategory.METRIC_QUANTITY),
            Decimal("2"),
        )
