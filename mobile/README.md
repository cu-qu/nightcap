# NightCap Mobile

End of Day Ritual Tracker — Expo client for the NightCap Django API.

## Stack

- Expo (SDK 57) + TypeScript + Expo Router
- NativeWind (Tailwind)
- Zustand
- expo-sqlite (draft + ritual outbox)
- expo-secure-store (JWT access/refresh)

## Prerequisites

- Node.js 22+
- Backend running (this repo's `backend/`): `cd ../backend && docker compose up`
- API docs: http://localhost:8000/api/docs/
- Contract: [docs/API_MOBILE.md](docs/API_MOBILE.md)

## Setup

```bash
npm install
cp .env.example .env   # or edit .env
npm start
```

### Run from Cursor

**Run and Debug** → pick a launch config:

- **Expo: Start** — Metro bundler (`npm start`)
- **Expo: iOS** / **Expo: Android** — open simulator/emulator
- **Expo: Clear cache & start** — after env or NativeWind changes
- **Expo: Start (tunnel)** — if the phone can’t reach your Mac on LAN

Or terminal: `npm start`, then press `i` / `a` in the Expo CLI.

### Point at the local Django API

Set `EXPO_PUBLIC_API_URL` in [`.env`](.env) (restart Expo after changes):

| Where the app runs | `EXPO_PUBLIC_API_URL` |
|--------------------|------------------------|
| iOS Simulator | `http://localhost:8000` |
| Android Emulator | `http://10.0.2.2:8000` |
| Physical device (same Wi‑Fi) | `http://<your-lan-ip>:8000` |

Find your Mac LAN IP:

```bash
ipconfig getifaddr en0
```

Example for a phone: `EXPO_PUBLIC_API_URL=http://192.168.1.42:8000`

Backend must be reachable on that host (`docker compose up` / Django on port 8000). Cleartext HTTP is allowed for Android in `app.json`.

## Scripts

```bash
npm start              # Expo Metro
npm run ios            # Expo + iOS Simulator
npm run android        # Expo + Android Emulator
npm run start:clear    # clear Metro cache
npm run start:tunnel   # Expo tunnel
```

## App flow

1. Register / login (JWT in SecureStore)
2. **Tonight** — Daily Spend chips → Save Spend → Follow-up habits + reflection
3. Saves via `POST /api/v1/ritual/` (queued in sqlite outbox, flushed when online)
4. Calendar / Graphs / Goals / Settings tabs

## Acceptance checklist

- [ ] Register seeds spend + follow-up categories
- [ ] Full ritual saves spend + habits + reflection
- [ ] Long-press chip for single-category quick log
- [ ] Calendar day opens ritual for that date
- [ ] Month markers and charts render
- [ ] Goals show on_track / at_risk / behind / reached
- [ ] Settings can create a custom habit category
- [ ] JWT refresh on 401; tokens in SecureStore
- [ ] Runs on iOS Simulator and Android Emulator
