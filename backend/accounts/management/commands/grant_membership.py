from datetime import datetime

from django.core.management.base import BaseCommand, CommandError
from django.utils.dateparse import parse_datetime

from accounts.memberships import grant_complimentary_membership, revoke_complimentary_membership
from accounts.models import User


class Command(BaseCommand):
    help = "Grant or revoke complimentary NightCap membership for a user (covers their couple)."

    def add_arguments(self, parser):
        parser.add_argument("--username", help="Account username")
        parser.add_argument("--email", help="Account email")
        parser.add_argument(
            "--until",
            help="Optional expiry (ISO datetime). Omit for membership that does not expire.",
        )
        parser.add_argument("--note", default="Granted from CLI", help="Admin note")
        parser.add_argument(
            "--revoke",
            action="store_true",
            help="Remove complimentary access instead of granting it.",
        )

    def handle(self, *args, **options):
        username = (options.get("username") or "").strip()
        email = (options.get("email") or "").strip()
        if bool(username) == bool(email):
            raise CommandError("Pass exactly one of --username or --email.")
        if username:
            user = User.objects.filter(username=username).first()
        else:
            user = User.objects.filter(email__iexact=email).first()
        if user is None:
            raise CommandError("No account matched.")

        if options["revoke"]:
            revoke_complimentary_membership(user)
            self.stdout.write(self.style.SUCCESS(f"Revoked complimentary membership for {user.username}"))
            return

        until = None
        raw_until = (options.get("until") or "").strip()
        if raw_until:
            until = parse_datetime(raw_until)
            if until is None:
                try:
                    until = datetime.fromisoformat(raw_until)
                except ValueError as exc:
                    raise CommandError("Could not parse --until. Use ISO format.") from exc
            if until.tzinfo is None:
                from django.utils import timezone as djtz

                until = djtz.make_aware(until)

        membership = grant_complimentary_membership(
            user,
            until=until,
            note=options.get("note") or "",
        )
        expiry = membership.complimentary_until or "never"
        self.stdout.write(
            self.style.SUCCESS(
                f"Granted complimentary membership to {user.username} (expires {expiry})"
            )
        )
