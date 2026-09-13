import datetime

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.utils import timezone


def backfill_trials(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    Membership = apps.get_model("accounts", "Membership")
    PartnershipMember = apps.get_model("accounts", "PartnershipMember")
    trial_days = int(getattr(settings, "IAP_TRIAL_DAYS", 30))
    now = timezone.now()
    for user in User.objects.all().iterator():
        if Membership.objects.filter(user=user).exists():
            continue
        member = PartnershipMember.objects.filter(user=user).select_related("partnership").first()
        partnership = member.partnership if member else None
        if partnership and Membership.objects.filter(partnership=partnership).exists():
            continue
        started = user.date_joined or now
        Membership.objects.create(
            user=None if partnership else user,
            partnership=partnership,
            trial_started_at=started,
            trial_ends_at=started + datetime.timedelta(days=trial_days),
            complimentary=bool(user.is_staff),
            granted_at=now if user.is_staff else None,
            grant_note="Staff complimentary" if user.is_staff else "",
        )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_couple_habits_onboarding"),
    ]

    operations = [
        migrations.CreateModel(
            name="Membership",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "complimentary",
                    models.BooleanField(default=False),
                ),
                (
                    "complimentary_until",
                    models.DateTimeField(
                        blank=True,
                        help_text="Leave blank for complimentary access that does not expire.",
                        null=True,
                    ),
                ),
                ("granted_at", models.DateTimeField(blank=True, null=True)),
                ("grant_note", models.CharField(blank=True, max_length=255)),
                ("trial_started_at", models.DateTimeField(blank=True, null=True)),
                ("trial_ends_at", models.DateTimeField(blank=True, null=True)),
                (
                    "plan",
                    models.CharField(
                        blank=True,
                        choices=[("monthly", "Monthly"), ("yearly", "Yearly")],
                        max_length=16,
                    ),
                ),
                (
                    "store",
                    models.CharField(
                        blank=True,
                        choices=[("apple", "App Store"), ("google", "Google Play")],
                        max_length=16,
                    ),
                ),
                ("product_id", models.CharField(blank=True, max_length=128)),
                ("original_transaction_id", models.CharField(blank=True, db_index=True, max_length=255)),
                ("latest_transaction_id", models.CharField(blank=True, max_length=255)),
                ("purchase_token", models.TextField(blank=True)),
                ("auto_renewing", models.BooleanField(default=False)),
                ("store_expires_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "granted_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="granted_memberships",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "partnership",
                    models.OneToOneField(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="membership",
                        to="accounts.partnership",
                    ),
                ),
                (
                    "purchased_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="store_purchases",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "user",
                    models.OneToOneField(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="membership",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "accounts_membership",
            },
        ),
        migrations.AddConstraint(
            model_name="membership",
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(("partnership__isnull", False), ("user__isnull", True))
                    | models.Q(("partnership__isnull", True), ("user__isnull", False))
                ),
                name="membership_owner_xor",
            ),
        ),
        migrations.AddConstraint(
            model_name="membership",
            constraint=models.UniqueConstraint(
                condition=~models.Q(("original_transaction_id", "")),
                fields=("original_transaction_id",),
                name="unique_store_original_transaction",
            ),
        ),
        migrations.RunPython(backfill_trials, noop),
    ]
