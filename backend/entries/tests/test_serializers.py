from datetime import date
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from categories.models import TrackingCategory
from entries.models import Entry


class EntryValidationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="entryuser",
            email="entry@example.com",
            password="testpass123",
        )
        self.expense = TrackingCategory.objects.create(
            user=self.user,
            name="Gas",
            type=TrackingCategory.FINANCE_EXPENSE,
            metric_kind=TrackingCategory.METRIC_AMOUNT,
            unit="usd",
        )
        self.fitness = TrackingCategory.objects.create(
            user=self.user,
            name="Push Ups",
            type=TrackingCategory.FITNESS,
            metric_kind=TrackingCategory.METRIC_QUANTITY,
            unit="reps",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_finance_entry_requires_amount(self):
        resp = self.client.post(
            "/api/v1/entries/",
            {
                "date": date.today().isoformat(),
                "category": self.expense.id,
                "label": "Shell",
                "quantity": 1,
            },
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("amount", resp.json())

    def test_fitness_entry_requires_quantity(self):
        resp = self.client.post(
            "/api/v1/entries/",
            {
                "date": date.today().isoformat(),
                "category": self.fitness.id,
                "label": "Morning",
                "amount": "25.00",
            },
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("quantity", resp.json())

    def test_valid_finance_and_fitness_entries(self):
        finance_resp = self.client.post(
            "/api/v1/entries/",
            {
                "date": date.today().isoformat(),
                "category": self.expense.id,
                "label": "Walgreens",
                "amount": "24.00",
            },
        )
        self.assertEqual(finance_resp.status_code, 201)
        self.assertIsNone(finance_resp.json()["quantity"])

        fitness_resp = self.client.post(
            "/api/v1/entries/",
            {
                "date": date.today().isoformat(),
                "category": self.fitness.id,
                "label": "Morning set",
                "quantity": 25,
            },
        )
        self.assertEqual(fitness_resp.status_code, 201)
        self.assertIsNone(fitness_resp.json()["amount"])

    def test_period_summary_endpoint(self):
        Entry.objects.create(
            user=self.user,
            category=self.expense,
            date=date.today(),
            label="Gas",
            amount=Decimal("32.00"),
        )
        resp = self.client.get("/api/v1/entries/period-summary/?period=weekly")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["period"], "weekly")
        self.assertEqual(len(data["by_category"]), 1)
        self.assertEqual(Decimal(str(data["by_category"][0]["amount_total"])), Decimal("32.00"))
