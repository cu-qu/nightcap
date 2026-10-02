"""Cloudflare R2 (S3-compatible) media storage.

Favorite photos stay on NightCap.favorite_photo (Django ImageField). The field
stores the object key; this module chooses filesystem vs R2 for default storage.
"""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse

R2_HOST_SUFFIX = ".r2.cloudflarestorage.com"


def _env(name: str, default: str = "", environ: dict | None = None) -> str:
    env = environ if environ is not None else os.environ
    return (env.get(name) or default).strip()


def r2_connection(environ: dict | None = None) -> dict[str, str]:
    """Resolve endpoint, account id, and bucket.

    Accepts either split vars or the S3 URL Cloudflare shows, e.g.
    ``https://<accountid>.r2.cloudflarestorage.com/<bucket>``.
    """
    env = environ if environ is not None else os.environ
    account_id = _env("R2_ACCOUNT_ID", environ=env)
    bucket = _env("R2_BUCKET_NAME", environ=env)
    explicit = _env("R2_ENDPOINT_URL", environ=env)
    endpoint = ""

    if explicit:
        parsed = urlparse(explicit)
        host = parsed.netloc
        path_parts = [part for part in parsed.path.split("/") if part]
        if host.endswith(R2_HOST_SUFFIX):
            endpoint = f"{parsed.scheme}://{host}"
            if not account_id:
                account_id = host[: -len(R2_HOST_SUFFIX)]
            if path_parts and not bucket:
                bucket = path_parts[0]
        else:
            endpoint = explicit.rstrip("/")
    elif account_id:
        endpoint = f"https://{account_id}{R2_HOST_SUFFIX}"

    return {
        "endpoint_url": endpoint,
        "account_id": account_id,
        "bucket_name": bucket,
    }


def r2_endpoint_url(environ: dict | None = None) -> str:
    return r2_connection(environ)["endpoint_url"]


def r2_credentials_configured(environ: dict | None = None) -> bool:
    conn = r2_connection(environ)
    return bool(
        conn["bucket_name"]
        and _env("R2_ACCESS_KEY_ID", environ=environ)
        and _env("R2_SECRET_ACCESS_KEY", environ=environ)
        and conn["endpoint_url"]
    )


def r2_is_enabled(debug: bool | None = None, environ: dict | None = None) -> bool:
    """Use R2 when credentials exist.

    Production/stage turn it on automatically. Local/DEBUG stays on disk unless
    R2_ENABLED=true so tests and laptops do not write to the bucket by accident.
    """
    env = environ if environ is not None else os.environ
    if not r2_credentials_configured(env):
        return False
    raw = _env("R2_ENABLED", environ=env).lower()
    if raw in ("false", "0", "no"):
        return False
    if raw in ("true", "1", "yes"):
        return True
    settings_module = _env("DJANGO_SETTINGS_MODULE", environ=env)
    if "production" in settings_module or "stage" in settings_module:
        return True
    if debug is False:
        return True
    return False


def r2_storage_options(environ: dict | None = None) -> dict:
    env = environ if environ is not None else os.environ
    conn = r2_connection(env)
    expire = int(_env("R2_SIGNED_URL_EXPIRE", "3600", environ=env) or "3600")
    options: dict = {
        "access_key": _env("R2_ACCESS_KEY_ID", environ=env),
        "secret_key": _env("R2_SECRET_ACCESS_KEY", environ=env),
        "bucket_name": conn["bucket_name"],
        "endpoint_url": conn["endpoint_url"],
        "region_name": _env("R2_REGION", "auto", environ=env) or "auto",
        "signature_version": "s3v4",
        "addressing_style": _env("R2_ADDRESSING_STYLE", "path", environ=env) or "path",
        "default_acl": None,
        "querystring_auth": True,
        "querystring_expire": max(expire, 60),
        "file_overwrite": False,
        "location": _env("R2_LOCATION", "media", environ=env),
        "object_parameters": {
            "CacheControl": "private, max-age=3600",
        },
    }
    custom_domain = _env("R2_CUSTOM_DOMAIN", environ=env)
    if custom_domain:
        options["custom_domain"] = custom_domain.rstrip("/")
        if _env("R2_QUERYSTRING_AUTH", "true", environ=env).lower() in (
            "false",
            "0",
            "no",
        ):
            options["querystring_auth"] = False
    return options


def configured_media_storages(
    use_r2: bool,
    media_root: Path | str,
    static_root: Path | str,
) -> dict:
    staticfiles = {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
        "OPTIONS": {"location": str(static_root)},
    }
    if use_r2:
        return {
            "default": {
                "BACKEND": "storages.backends.s3.S3Storage",
                "OPTIONS": r2_storage_options(),
            },
            "staticfiles": staticfiles,
        }
    return {
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
            "OPTIONS": {"location": str(media_root)},
        },
        "staticfiles": staticfiles,
    }
