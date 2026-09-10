# NightCap Backend

Django REST API for the NightCap iOS habit and budget tracker.

## Stack

- Django 5.x and Django REST Framework
- PostgreSQL via `DATABASE_URL` or `DJANGO_DB_*` environment variables
- Simple JWT authentication
- Railway-ready Gunicorn deployment

## Local Development

### Dev Containers (recommended)

1. Open the **nightcap** repo root in Cursor or VS Code.
2. Command Palette → **Dev Containers: Reopen in Container**.
3. The root container starts PostgreSQL, Redis, Celery, and Expo. Start Django with **Run and Debug** → **Django: runserver (debug)**. API: http://localhost:8002 — Expo: http://localhost:8082

To use this backend folder on its own instead: open `backend/` and **Dev Containers: Reopen in Container**.
3. Wait for the container build, migrations, and runserver startup.
4. API: http://localhost:8000 — docs: http://localhost:8000/api/docs/

The dev container starts **PostgreSQL**, **Redis**, **Celery worker**, **Celery beat**, and the Django app. On first create it copies `.env.docker.example` → `.env`, runs migrations, and seeds base data.

Manual commands inside the container:

```bash
python manage.py migrate
python manage.py setup_base_data
python manage.py runserver 0.0.0.0:8000
celery -A config worker -Q celery -l info
```

### Docker Compose (without Dev Containers)

```bash
cp .env.docker.example .env   # first time only
docker compose up --build
```

API docs are available at http://localhost:8000/api/docs/.

## API Overview

- `POST /api/v1/auth/register/` (optional `invite_code`)
- `POST /api/v1/auth/token/`
- `POST /api/v1/auth/token/refresh/`
- `GET/PATCH /api/v1/auth/me/`
- `GET/PATCH /api/v1/auth/profile/`
- `GET/POST /api/v1/partnership/` — couple space + invite code
- `POST /api/v1/partnership/invite/` / `join/`
- `POST /api/v1/onboarding/setup/` — solo vs couple, templates, optional email invite
- `GET/POST /api/v1/categories/` (includes stable `uuid` and optional `group`)
- `GET/POST /api/v1/category-groups/` — configurable NightCap sections
- `GET /api/v1/category-groups/for-ritual/` — ordered groups + categories for the nightly UI
- `GET/POST /api/v1/entries/`
- `GET /api/v1/entries/daily-summary/?date=YYYY-MM-DD`
- `GET /api/v1/entries/period-summary/?period=weekly|monthly`
- `GET/POST /api/v1/nightcaps/` — one NightCap record per user per day
- `GET/PATCH /api/v1/nightcaps/{YYYY-MM-DD}/`
- `GET/POST/DELETE /api/v1/nightcaps/{YYYY-MM-DD}/photo/` — favorite photo of the day (Django `ImageField`)
- `GET /api/v1/ritual/shared/?date=` — partner values on Together categories for that NightCap date
- `POST /api/v1/ritual/` — nightly batch upsert (creates/updates NightCap + entries + reflection)
- `GET/PUT/PATCH /api/v1/day-reflections/{YYYY-MM-DD}/` (legacy; prefer NightCaps)
- `GET /api/v1/calendar/?year=&month=` — month markers for the calendar UI
- `GET /api/v1/charts/?period=daily|weekly&start_date=&end_date=`
- `GET/POST /api/v1/goals/` — simple category-tied goals; list embeds live `progress`
- `POST /api/v1/goals/set/` — upsert goal for category + period
- `GET /api/v1/goals/progress/` — includes `status_label` (`on_track` / `at_risk` / `behind` / `reached`)
- `GET /api/v1/onboarding/templates/` — starter goals to copy (editable in admin)
- `POST /api/v1/onboarding/apply/` — copy selected templates to your account
- `GET /api/v1/onboarding/status/` — onboarding progress
- `POST /api/v1/onboarding/complete/` — mark onboarding done
- `GET /api/v1/goals/{id}/progress/`
- `GET /api/v1/dashboard/`
- `POST /api/v1/export/`
- `GET /api/health/`

Entries are always scoped to the authenticated user and support date range filters with
`start_date`, `end_date`, `category`, and `category_type`. One entry per category per
date is enforced (ritual upserts use that uniqueness). Each day has at most one
`NightCap` record.

### Mobile docs

- Swagger UI: http://localhost:8000/api/docs/
- Mobile API guide: [`docs/API_MOBILE.md`](docs/API_MOBILE.md)
- Expo frontend handoff plan: [`docs/MOBILE_FRONTEND_PLAN.md`](docs/MOBILE_FRONTEND_PLAN.md)

Sync default ritual categories for existing users:

```bash
python manage.py sync_default_categories
```
