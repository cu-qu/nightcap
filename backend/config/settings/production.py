import logging

from config.r2 import configured_media_storages, r2_is_enabled

from .base import *

DEBUG = os.environ.get("DEBUG", "false").lower() in ("true", "1", "yes")
ALLOWED_HOSTS = [host for host in os.environ.get("ALLOWED_HOSTS", "").split(",") if host]

# Recompute after production DEBUG default (base.py defaults DEBUG to True).
USE_R2_STORAGE = r2_is_enabled(debug=DEBUG)
STORAGES = configured_media_storages(USE_R2_STORAGE, MEDIA_ROOT, STATIC_ROOT)
if not USE_R2_STORAGE:
    logging.getLogger(__name__).warning(
        "Cloudflare R2 is not configured; NightCap photos will not persist "
        "across deploys. Set R2_ACCOUNT_ID (or R2_ENDPOINT_URL), "
        "R2_BUCKET_NAME, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY."
    )

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
CSRF_TRUSTED_ORIGINS = [
    origin for origin in os.environ.get("CSRF_TRUSTED_ORIGINS", "").split(",") if origin
]
CORS_ALLOWED_ORIGINS = [
    origin for origin in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",") if origin
]
