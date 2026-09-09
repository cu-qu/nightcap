import os
import sys
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production")

DEBUG = os.environ.get("DEBUG", "True").lower() in ("true", "1", "yes")

ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    "anymail",
    "core",
    "accounts",
    "categories",
    "entries",
    "goals",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("DJANGO_DB_NAME", "night_cap"),
        "USER": os.environ.get("DJANGO_DB_USER", "postgres"),
        "PASSWORD": os.environ.get("DJANGO_DB_PASSWORD", ""),
        "HOST": os.environ.get("DJANGO_DB_HOST", "localhost"),
        "PORT": os.environ.get("DJANGO_DB_PORT", "5432"),
        "ATOMIC_REQUESTS": True,
    }
}

_db_url = os.environ.get("DATABASE_URL")
if _db_url:
    try:
        import dj_database_url

        DATABASES["default"] = dj_database_url.parse(_db_url, conn_max_age=600)
    except ImportError:
        pass

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en"
LANGUAGES = [
    ("en", "English"),
    ("es", "Spanish"),
]
LOCALE_PATHS = [BASE_DIR / "locale"]
USE_I18N = True
USE_TZ = True
TIME_ZONE = "UTC"

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "mediafiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "accounts.User"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.OrderingFilter",
        "rest_framework.filters.SearchFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "100/hour",
        "user": "1000/hour",
    },
    "EXCEPTION_HANDLER": "core.exceptions.log_and_exception_handler",
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {"class": "logging.StreamHandler", "stream": sys.stdout},
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django.request": {"handlers": ["console"], "level": "ERROR", "propagate": False},
        "django.server": {"handlers": ["console"], "level": "ERROR", "propagate": False},
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=int(os.environ.get("JWT_ACCESS_LIFETIME_MINUTES", 60))
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=int(os.environ.get("JWT_REFRESH_DAYS", 7))
    ),
}

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

_resend_key = os.environ.get("RESEND_API_KEY", "").strip()
if os.environ.get("EMAIL_BACKEND", "").strip():
    EMAIL_BACKEND = os.environ["EMAIL_BACKEND"].strip()
elif _resend_key:
    EMAIL_BACKEND = "anymail.backends.resend.EmailBackend"
else:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

ANYMAIL = {
    "RESEND_API_KEY": _resend_key,
}

DEFAULT_FROM_EMAIL = os.environ.get(
    "DEFAULT_FROM_EMAIL", "NightCap <hello@nightcap.app>"
)
SERVER_EMAIL = os.environ.get("SERVER_EMAIL", DEFAULT_FROM_EMAIL)
EMAIL_USE_ANYMAIL_TAGS = os.environ.get("EMAIL_USE_ANYMAIL_TAGS", "True").lower() in (
    "true",
    "1",
    "yes",
)
EMAIL_VERIFICATION_FRONTEND_PATH = os.environ.get(
    "EMAIL_VERIFICATION_FRONTEND_PATH", "/verify-email"
)
EMAIL_VERIFICATION_SUBJECT = os.environ.get(
    "EMAIL_VERIFICATION_SUBJECT", "NightCap: Confirm your Email Address"
)
PASSWORD_RESET_FRONTEND_PATH = os.environ.get(
    "PASSWORD_RESET_FRONTEND_PATH", "/reset-password"
)
EMAIL_PASSWORD_RESET_SUBJECT = os.environ.get(
    "EMAIL_PASSWORD_RESET_SUBJECT", "Reset your Password"
)

CORS_ALLOWED_ORIGINS = os.environ.get(
    "CORS_ALLOWED_ORIGINS", "http://localhost:3000"
).split(",")
CORS_ALLOW_HEADERS = [
    "accept",
    "accept-language",
    "authorization",
    "content-type",
    "origin",
    "x-requested-with",
]

CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")
CELERY_TASK_DEFAULT_QUEUE = os.environ.get("CELERY_TASK_DEFAULT_QUEUE", "celery")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
        "OPTIONS": {"location": str(MEDIA_ROOT)},
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
        "OPTIONS": {"location": str(STATIC_ROOT)},
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": "NightCap API",
    "DESCRIPTION": """
REST API for the NightCap iOS habit and budget tracker.

**How to try it**
1. Use **Auth → token** (`POST /api/v1/auth/token/`) with your email and password.
2. Copy the `access` token from the response.
3. Click **Authorize**, paste the token (Swagger adds `Bearer` for you), then **Authorize**.
4. Use **Try it out** on any endpoint.

- **Auth** - Register, login with JWT, refresh tokens, current user, profile, email verification, and password reset.
- **Categories** - User-owned tracking categories for finance, fitness, habits, and custom logs.
- **Entries** - Daily logs with date-range filtering, pagination, CRUD, and daily summaries.
- **Ritual** - Batch upsert spending + habits + optional day reflection in one request.
- **Calendar / Charts** - Month markers and daily/weekly graph series for the mobile app.
- **Dashboard** - Streaks, weekly summaries, and finance totals for the signed-in user.
- **Export** - Trigger a JSON data export payload for offline-first sync and portability.
- **Health** - Lightweight service health check for Railway.
""",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "ENUM_NAME_OVERRIDES": {
        "TypeEnum": "categories.models.TrackingCategory.TYPE_CHOICES",
    },
    "PREPROCESSING_HOOKS": [
        "config.spectacular.prefer_v1_paths",
    ],
    "SWAGGER_UI_SETTINGS": {
        "deepLinking": True,
        "persistAuthorization": True,
        "displayOperationId": False,
        "filter": True,
        "tryItOutEnabled": True,
    },
    "TAGS": [
        {"name": "Auth", "description": "Registration, JWT token, refresh, current user"},
        {"name": "Profile", "description": "User profile and preferences"},
        {"name": "Categories", "description": "Tracking categories"},
        {"name": "CategoryGroups", "description": "Configurable NightCap ritual category sections"},
        {"name": "Entries", "description": "Daily logs and summaries"},
        {"name": "NightCaps", "description": "Per-day NightCap records for each user"},
        {"name": "Ritual", "description": "Nightly spend + habit batch save"},
        {"name": "DayReflection", "description": "End-of-day reflection notes (legacy; prefer NightCaps)"},
        {"name": "Calendar", "description": "Month calendar markers"},
        {"name": "Charts", "description": "Daily and weekly graph series"},
        {"name": "Goals", "description": "Weekly/monthly targets and progress"},
        {"name": "Onboarding", "description": "Starter goal templates and setup flow"},
        {"name": "Dashboard", "description": "Streaks, weekly summaries, and totals"},
        {"name": "Export", "description": "Data export"},
        {"name": "Health", "description": "Service health"},
    ],
}

SUPPORTED_LANGUAGES = ["en", "es"]
