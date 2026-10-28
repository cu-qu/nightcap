"""Check APNs credentials and send one test alert.

Run from the repo root, against the API container (it has the key and the database):

  railway ssh -s "nightcap api" -e production \\
    python manage.py shell -c "$(cat backend/scripts/verify_apns.py)"

That lists credentials and registered iPhones. It does not send.

To deliver a test notification:

  railway ssh -s "nightcap api" -e production \\
    env APNS_VERIFY_SEND=1 python manage.py shell -c "$(cat backend/scripts/verify_apns.py)"

Set APNS_VERIFY_USER to a username to target one account. Otherwise every
registered iOS token is tried. Sandbox tokens go to Apple's sandbox first.
"""

import os

from accounts.apns import (
    TOKEN_RE,
    _hosts_for,
    _normalize_token,
    _reason,
    load_auth_key,
    provider_token,
)
from accounts.models import DevicePushToken
from django.conf import settings

import httpx

team_id = (settings.APNS_TEAM_ID or "").strip()
key_id = (settings.APNS_KEY_ID or "").strip()
bundle_id = (settings.APNS_BUNDLE_ID or settings.IAP_APPLE_BUNDLE_ID or "").strip()
private_key = load_auth_key()

print(f"team id:    {team_id or 'MISSING'}")
print(f"key id:     {key_id or 'MISSING'}")
print(f"bundle id:  {bundle_id or 'MISSING'}")
print(f"auth key:   {'loaded' if private_key.startswith('-----BEGIN') else 'MISSING'}")

authorization = ""
if team_id and key_id and private_key:
    try:
        authorization = provider_token(team_id, key_id, private_key)
        print("provider token: signed")
    except Exception as exc:
        print(f"provider token: FAILED ({exc})")
else:
    print("provider token: skipped")

records = list(
    DevicePushToken.objects.filter(platform=DevicePushToken.PLATFORM_IOS).select_related("user")
)
target = (os.environ.get("APNS_VERIFY_USER") or "").strip()
if target:
    records = [record for record in records if record.user.username == target]

print(f"ios devices: {len(records)}")
for record in records:
    token = _normalize_token(record.token)
    tail = token[-8:] if token else ""
    print(
        f"  {record.user.username}  {record.environment or 'unknown'}  "
        f"…{tail}  updated {record.updated_at:%Y-%m-%d %H:%M} UTC"
    )

if os.environ.get("APNS_VERIFY_SEND") != "1":
    print("not sent. Re-run with APNS_VERIFY_SEND=1 to deliver a test alert.")
elif not authorization or not bundle_id:
    print("not sent. Credentials are incomplete.")
elif not records:
    print("not sent. No iOS device token is registered yet.")
    print("Open NightCap again after allowing notifications so the phone can upload its token.")
else:
    payload = {
        "aps": {
            "alert": {
                "title": "NightCap APNs check",
                "body": "Sandbox push reached this iPhone.",
            },
            "sound": "default",
        },
        "type": "apns_verify",
    }
    with httpx.Client(http2=True, timeout=10) as client:
        for record in records:
            token = _normalize_token(record.token)
            if not TOKEN_RE.fullmatch(token):
                print(f"  {record.user.username}: token is not a valid APNs token")
                continue
            headers = {
                "authorization": f"bearer {authorization}",
                "apns-topic": bundle_id,
                "apns-push-type": "alert",
                "apns-priority": "10",
            }
            delivered = False
            for host in _hosts_for(record.environment):
                try:
                    response = client.post(
                        f"{host}/3/device/{token}",
                        headers=headers,
                        json=payload,
                    )
                except httpx.HTTPError as exc:
                    print(f"  {record.user.username}: {host} connection failed ({exc})")
                    continue
                reason = _reason(response)
                print(
                    f"  {record.user.username}: {host} -> {response.status_code}"
                    + (f" {reason}" if reason else "")
                )
                if response.status_code == 200:
                    delivered = True
                    break
                if reason != "BadDeviceToken":
                    break
            if delivered:
                print(f"  {record.user.username}: Apple accepted the notification")
