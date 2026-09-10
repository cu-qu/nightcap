from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from categories.defaults import (
    DEFAULT_GROUPS,
    create_default_categories_for_user,
    create_default_groups_for_user,
)
from categories.models import CategoryGroup, TrackingCategory
from entries.models import NightCap


class CategoryGroupAndNightCapApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="groupuser",
            email="group@example.com",
            password="testpass123",
        )
        create_default_categories_for_user(self.user)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_default_groups_seeded(self):
        keys = set(
            CategoryGroup.objects.filter(user=self.user).values_list("key", flat=True)
        )
        self.assertEqual(keys, {g["key"] for g in DEFAULT_GROUPS})
        spend = CategoryGroup.objects.get(user=self.user, key="daily_spend")
        self.assertGreaterEqual(spend.categories.count(), 8)
        health = CategoryGroup.objects.get(user=self.user, key="follow_up")
        self.assertEqual(health.name, "Health")
        names = set(health.categories.values_list("name", flat=True))
        self.assertEqual(names, {"Water", "Workout"})

    def test_legacy_follow_up_group_renames_to_health(self):
        group = CategoryGroup.objects.get(user=self.user, key="follow_up")
        group.name = "Follow-up"
        group.icon = "follow_up"
        group.save(update_fields=["name", "icon"])
        create_default_groups_for_user(self.user)
        group.refresh_from_db()
        self.assertEqual(group.name, "Health")
        self.assertEqual(group.icon, "health")

    def test_category_emoji_seeded_and_writable(self):
        groceries = TrackingCategory.objects.get(user=self.user, name="Groceries")
        self.assertEqual(groceries.emoji, "🛒")
        resp = self.client.patch(
            f"/api/v1/categories/{groceries.id}/",
            {"emoji": "🥦"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.json()["emoji"], "🥦")
        ritual = self.client.get("/api/v1/category-groups/for-ritual/").json()
        spend_cats = next(g["categories"] for g in ritual if g["key"] == "daily_spend")
        grocery = next(c for c in spend_cats if c["name"] == "Groceries")
        self.assertEqual(grocery["emoji"], "🥦")

    def test_for_ritual_returns_ordered_groups_with_categories(self):
        resp = self.client.get("/api/v1/category-groups/for-ritual/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]["key"], "daily_spend")
        self.assertEqual(data[1]["key"], "follow_up")
        self.assertEqual(data[1]["name"], "Health")
        self.assertTrue(data[0]["categories"])
        self.assertIn("uuid", data[0]["categories"][0])

    def test_create_custom_group_and_assign_category(self):
        resp = self.client.post(
            "/api/v1/category-groups/",
            {
                "name": "Wind Down",
                "key": "wind_down",
                "sort_order": 2,
                "show_in_ritual": True,
                "icon": "moon",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        group_id = resp.json()["id"]
        cat_resp = self.client.post(
            "/api/v1/categories/",
            {
                "name": "Journal",
                "type": TrackingCategory.HABIT,
                "metric_kind": TrackingCategory.METRIC_BOOLEAN,
                "unit": "count",
                "group": group_id,
                "icon": "journal",
            },
            format="json",
        )
        self.assertEqual(cat_resp.status_code, 201, cat_resp.content)
        self.assertEqual(cat_resp.json()["group"], group_id)

        ritual_layout = self.client.get("/api/v1/category-groups/for-ritual/").json()
        keys = [g["key"] for g in ritual_layout]
        self.assertIn("wind_down", keys)

    def test_cannot_delete_default_group(self):
        spend = CategoryGroup.objects.get(user=self.user, key="daily_spend")
        resp = self.client.delete(f"/api/v1/category-groups/{spend.id}/")
        self.assertEqual(resp.status_code, 400)

    def test_cannot_delete_category_only_remove_from_group(self):
        spend = TrackingCategory.objects.get(user=self.user, name="Groceries")
        delete_resp = self.client.delete(f"/api/v1/categories/{spend.id}/")
        self.assertEqual(delete_resp.status_code, 405)
        self.assertTrue(
            TrackingCategory.objects.filter(pk=spend.id).exists()
        )

        remove_resp = self.client.post(
            f"/api/v1/categories/{spend.id}/remove-from-group/"
        )
        self.assertEqual(remove_resp.status_code, 200, remove_resp.content)
        spend.refresh_from_db()
        self.assertIsNone(spend.group_id)
        self.assertIsNone(remove_resp.json()["group"])

        # Or PATCH group null
        clothes = TrackingCategory.objects.get(user=self.user, name="Clothes")
        patch_resp = self.client.patch(
            f"/api/v1/categories/{clothes.id}/",
            {"group": None},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, 200)
        clothes.refresh_from_db()
        self.assertIsNone(clothes.group_id)

        ungrouped = self.client.get("/api/v1/categories/?ungrouped=true").json()
        names = {c["name"] for c in ungrouped["results"]} if "results" in ungrouped else {
            c["name"] for c in ungrouped
        }
        self.assertIn("Groceries", names)
        self.assertIn("Clothes", names)

    def test_nightcap_get_create_and_patch(self):
        today = date.today().isoformat()
        get_resp = self.client.get(f"/api/v1/nightcaps/{today}/")
        self.assertEqual(get_resp.status_code, 200)
        self.assertEqual(get_resp.json()["status"], NightCap.STATUS_DRAFT)
        self.assertEqual(get_resp.json()["mood"], "")

        patch = self.client.patch(
            f"/api/v1/nightcaps/{today}/",
            {"reflection": "Good night", "mood": "🙂", "status": "completed"},
            format="json",
        )
        self.assertEqual(patch.status_code, 200)
        self.assertEqual(patch.json()["reflection"], "Good night")
        self.assertEqual(patch.json()["mood"], "🙂")
        self.assertEqual(patch.json()["status"], "completed")
        self.assertIsNotNone(patch.json()["completed_at"])

        custom = self.client.patch(
            f"/api/v1/nightcaps/{today}/",
            {"mood": "🥳"},
            format="json",
        )
        self.assertEqual(custom.status_code, 200)
        self.assertEqual(custom.json()["mood"], "🥳")

    def test_ritual_returns_nightcap(self):
        spend = TrackingCategory.objects.get(user=self.user, name="Groceries")
        resp = self.client.post(
            "/api/v1/ritual/",
            {
                "date": date.today().isoformat(),
                "reflection": "Wrapped up.",
                "items": [{"category_uuid": str(spend.uuid), "amount": "10.00"}],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIn("nightcap", resp.json())
        self.assertEqual(resp.json()["nightcap"]["status"], "completed")
        self.assertEqual(
            NightCap.objects.filter(user=self.user, date=date.today()).count(), 1
        )

    def test_nightcap_retrieve_includes_entry_amounts(self):
        spend = TrackingCategory.objects.get(user=self.user, name="Groceries")
        today = date.today().isoformat()
        ritual = self.client.post(
            "/api/v1/ritual/",
            {
                "date": today,
                "items": [{"category_uuid": str(spend.uuid), "amount": "13.00"}],
            },
            format="json",
        )
        self.assertEqual(ritual.status_code, 200, ritual.content)

        resp = self.client.get(f"/api/v1/nightcaps/{today}/")
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertEqual(len(data["entries"]), 1)
        entry = data["entries"][0]
        self.assertEqual(entry["category_uuid"], str(spend.uuid))
        self.assertEqual(entry["amount"], "13.00")
        self.assertEqual(entry["category_detail"]["type"], "finance_expense")
        self.assertEqual(entry["category_detail"]["metric_kind"], "amount")
