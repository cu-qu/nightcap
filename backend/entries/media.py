"""URLs for NightCap.favorite_photo (local disk or Cloudflare R2)."""

from __future__ import annotations

from django.conf import settings


def uses_object_storage() -> bool:
    return bool(getattr(settings, "USE_R2_STORAGE", False))


def nightcap_photo_url(obj, request=None) -> str | None:
    """Return a fetchable URL for the saved favorite photo.

    On R2 this is a time-limited signed object URL from the ImageField storage
    backend. Locally (and as a fallback) it is the authenticated API proxy
    ``GET /api/v1/nightcaps/{date}/photo/``.
    """
    if not getattr(obj, "favorite_photo", None):
        return None
    if uses_object_storage():
        try:
            url = obj.favorite_photo.url
        except Exception:
            url = ""
        if url:
            return url
    path = f"/api/v1/nightcaps/{obj.date.isoformat()}/photo/"
    stamp = int(obj.updated_at.timestamp()) if getattr(obj, "updated_at", None) else 0
    if stamp:
        path = f"{path}?t={stamp}"
    if request is not None:
        return request.build_absolute_uri(path)
    return path
