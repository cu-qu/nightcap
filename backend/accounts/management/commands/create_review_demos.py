from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.memberships import ensure_user_membership, grant_complimentary_membership
from accounts.models import User
from accounts.partnerships import accept_invite_code, ensure_partnership, get_partner_user
from categories.defaults import sync_default_categories_for_user
from goals.onboarding_services import complete_onboarding

DEMOS = (
    {"username": "demo1", "email": "demo1@nightcap.app", "kind": "solo"},
    {"username": "demo2", "email": "demo2@nightcap.app", "kind": "owner"},
    {"username": "demo3", "email": "demo3@nightcap.app", "kind": "partner"},
    {"username": "demo4", "email": "demo4@nightcap.app", "kind": "expired"},
)


class Command(BaseCommand):
    help = (
        "Create or refresh the App Review accounts: demo1 solo, "
        "demo2 and demo3 linked as partners, and demo4 solo with an ended "
        "trial so the payment sheet can open. Email is already verified and "
        "onboarding is complete. demo1–demo3 do not expire."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--password",
            required=True,
            help="Password set on all four accounts. Not stored in the repo.",
        )

    def handle(self, *args, **options):
        password = options["password"]
        if len(password) < 8:
            raise CommandError("Password must be at least 8 characters.")

        with transaction.atomic():
            users = {spec["username"]: self._upsert(spec, password) for spec in DEMOS}
            owner = users["demo2"]
            partner = users["demo3"]
            partnership = ensure_partnership(owner)
            linked = get_partner_user(owner)
            if linked is None:
                accept_invite_code(partner, partnership.invite_code)
            elif linked.id != partner.id:
                raise CommandError(
                    f"demo2 is already linked with {linked.username}, not demo3."
                )
            grant_complimentary_membership(users["demo1"], note="App Review solo demo")
            grant_complimentary_membership(owner, note="App Review couple demo")
            for user in users.values():
                complete_onboarding(user)
                sync_default_categories_for_user(user)
            _end_trial(users["demo4"])

        self.stdout.write(self.style.SUCCESS("App Review demos are ready."))
        self.stdout.write("demo1  solo, complimentary")
        self.stdout.write("demo2  partnered with demo3, complimentary")
        self.stdout.write("demo3  partnered with demo2")
        self.stdout.write("demo4  solo, trial ended — payment sheet")

    def _upsert(self, spec: dict, password: str) -> User:
        username = spec["username"]
        email = spec["email"]
        by_name = User.objects.filter(username=username).first()
        by_email = User.objects.filter(email__iexact=email).first()
        if by_name and by_email and by_name.id != by_email.id:
            raise CommandError(f"{username} and {email} belong to different accounts.")
        user = by_name or by_email
        if user and user.username != username:
            raise CommandError(f"{email} is already used by {user.username}.")
        if user and user.email.lower() != email.lower():
            raise CommandError(f"{username} already uses {user.email}.")

        if user is None:
            user = User.objects.create_user(username=username, email=email, password=password)
        else:
            user.email = email
            user.set_password(password)
        user.email_verified = True
        user.email_verification_token = ""
        user.is_active = True
        user.is_deleted = False
        user.save()
        return user


def _end_trial(user) -> None:
    """Leave a verified account on the paywall with working subscribe buttons."""
    now = timezone.now()
    membership = ensure_user_membership(user)
    membership.complimentary = False
    membership.complimentary_until = None
    membership.granted_by = None
    membership.granted_at = None
    membership.grant_note = ""
    membership.trial_started_at = now - timedelta(days=40)
    membership.trial_ends_at = now - timedelta(days=1)
    membership.save(
        update_fields=[
            "complimentary",
            "complimentary_until",
            "granted_by",
            "granted_at",
            "grant_note",
            "trial_started_at",
            "trial_ends_at",
            "updated_at",
        ]
    )
