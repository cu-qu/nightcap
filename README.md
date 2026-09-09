# NightCap: Couple Habit Tracking

End-of-day ritual tracker for couples (and solo users): a Django API and Expo app in one repo.

The original `night_cap_backend` and `night_cap_mobile` repos are unchanged. This repo is the combined copy to work from.

## Layout

| Path | What |
|---|---|
| `backend/` | Django 5.x + DRF + JWT. PostgreSQL, Redis, Celery. Railway-ready. |
| `mobile/` | Expo (SDK 57) + TypeScript + NativeWind client |

## Local

Open this folder in Cursor. Command Palette → **Dev Containers: Reopen in Container**. That starts Postgres, Redis, Celery, and Expo Metro from the repo root. Start Django with **Run and Debug** → **Django: runserver (debug)** so the debugger owns port 8002.

| | |
|---|---|
| API | http://localhost:8002 |
| Docs | http://localhost:8002/api/docs/ |
| Expo Metro | http://localhost:8082 |

The root container uses 8002 / 8082 so it can run next to the original `night_cap` stack on 8000.

**Run and Debug** → **Expo: Start** (or **All services**) if you want Metro in a terminal instead of the background process. iOS Simulator / Android Emulator still run on the Mac; Metro in the container is enough for Expo Go.

**Run and Debug** → **All services** starts the API and Expo together (inside or outside the container).

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

You can still open `backend/` alone and reopen that folder in its container. The root container is the one to use from this repo.

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
