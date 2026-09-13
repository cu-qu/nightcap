from .base import *

DEBUG = True

# base.py sets django.server to ERROR (quieter prod logs). For local dev, show each HTTP line
# from runserver ("GET /api/... HTTP/1.1" 200, etc.). Cannot deepcopy LOGGING (handlers hold stdout).
LOGGING = {
    **LOGGING,
    "loggers": {
        **LOGGING["loggers"],
        "django.server": {
            **LOGGING["loggers"]["django.server"],
            "level": "INFO",
        },
    },
}
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "*"]

CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:50527",
]
CORS_ALLOW_ALL_ORIGINS = os.environ.get("CORS_ALLOW_ALL_ORIGINS", "false").lower() in ("true", "1", "yes")

IAP_APPLE_VERIFY_SIGNATURE = False
IAP_STAFF_COMPLIMENTARY = True
