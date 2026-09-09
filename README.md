# NightCap

End-of-day ritual tracker: a Django API and Expo app in one repo.

The original `night_cap_backend` and `night_cap_mobile` repos are unchanged. This repo is the combined copy to work from.

## Layout

| Path | What |
|---|---|
| `backend/` | Django 5.x + DRF + JWT. PostgreSQL, Redis, Celery. Railway-ready. |
| `mobile/` | Expo (SDK 57) + TypeScript + NativeWind client |

## Local

Open this folder in Cursor. **Run and Debug** → **All services** starts the API and Expo together.

### Backend

```bash
cd backend
cp .env.example .env   # first time only
docker compose up --build
```

| | |
|---|---|
| API | http://localhost:8000 |
| Docs | http://localhost:8000/api/docs/ |
| Admin | http://localhost:8000/admin/ |
| Health | http://localhost:8000/api/health/ |

Dev Container: open `backend/` and **Dev Containers: Reopen in Container**. That starts Postgres, Redis, Celery, and Django.

### Mobile

```bash
cd mobile
cp .env.example .env   # first time only
npm install
npm start
```

`EXPO_PUBLIC_API_URL` in `mobile/.env`:

| Where the app runs | `EXPO_PUBLIC_API_URL` |
|---|---|
| iOS Simulator | `http://localhost:8000` |
| Android Emulator | `http://10.0.2.2:8000` |
| Physical device (same Wi‑Fi) | `http://<your-lan-ip>:8000` |

More detail: [`backend/README.md`](backend/README.md), [`mobile/README.md`](mobile/README.md), [`backend/docs/API_MOBILE.md`](backend/docs/API_MOBILE.md).
