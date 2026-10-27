import logging

from config.hosts import parse_allowed_hosts, trusted_origins
from config.r2 import configured_media_storages, r2_is_enabled

from .base import *

DEBUG = os.environ.get("DEBUG", "false").lower() in ("true", "1", "yes")
ALLOWED_HOSTS = parse_allowed_hosts(
    os.environ.get("ALLOWED_HOSTS", ""),
    os.environ.get("RAILWAY_PUBLIC_DOMAIN", ""),
)

# Recompute after production DEBUG default (base.py defaults DEBUG to True).
USE_R2_STORAGE = r2_is_enabled(debug=DEBUG)
STORAGES = configured_media_storages(USE_R2_STORAGE, MEDIA_ROOT, STATIC_ROOT)
STORAGES["staticfiles"] = {
    "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
}
if not USE_R2_STORAGE:
    logging.getLogger(__name__).warning(
        "Cloudflare R2 is not configured; NightCap photos will not persist "
        "across deploys. Set R2_ACCOUNT_ID (or R2_ENDPOINT_URL), "
        "R2_BUCKET_NAME, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY."
    )

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
CSRF_TRUSTED_ORIGINS = trusted_origins(
    os.environ.get("CSRF_TRUSTED_ORIGINS", ""),
    os.environ.get("RAILWAY_PUBLIC_DOMAIN", ""),
)
CORS_ALLOWED_ORIGINS = [
    origin for origin in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",") if origin
]
