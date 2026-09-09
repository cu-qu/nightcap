# NightCap Mobile Frontend Implementation Plan

**Handoff brief for a separate Cursor session.** This backend repo does **not** contain the Expo app. Use this document to scaffold and build the iPhone/Android client against the NightCap Django API.

Interactive API: `http://localhost:8000/api/docs/`  
Mobile contract: [`API_MOBILE.md`](API_MOBILE.md)

---

## Product

**NightCap** — End of Day Ritual Tracker.

### Core nightly flow

1. Open app (notification or launch).
2. **Daily Spend** screen with quick categories (icon + amount):
   - Fast Food / Eating Out, Groceries, Car Gas, Car Repair, House Supplies, Clothes, Gifts, Online Shopping
3. Tap **Save Spend** → follow-up **"Anything else to NightCap tonight?"**
   - Chips: I Invested (amount), I Read (minutes), I Ran / Worked Out (km), Sauna / Meditation (boolean), Other custom habit
   - Optional reflection: **End the Day on a Good Note**
4. Save modes:
   - Full ritual → `POST /api/v1/ritual/` with spend + habits + reflection
   - Quick single category → same endpoint with one `items[]` entry

### Additional screens

- Month calendar
- Graphs (daily & weekly)
- Goal progress (on track / at risk / behind / reached)
- Settings → manage custom categories

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Runtime | Expo (latest stable) + TypeScript |
| Navigation | Expo Router |
| Styling | NativeWind (Tailwind) |
| State | Zustand |
| Local DB / offline | expo-sqlite |
| HTTP | fetch or ky/axios with JWT interceptors |
| UI tone | Clean, calm, **dark** with **purple** accents (product requirement) |

---

## Project bootstrap

```bash
npx create-expo-app@latest NightCap --template tabs
cd NightCap
npx expo install expo-router expo-secure-store expo-sqlite
npm install nativewind tailwindcss zustand
# configure NativeWind per current NativeWind Expo docs
```

Run:

```bash
npx expo start
# iOS simulator
npx expo run:ios
# Android emulator
npx expo run:android
```

Set `EXPO_PUBLIC_API_URL=http://localhost:8000` (use LAN IP for physical devices).

---

## Suggested folder structure

```text
NightCap/
├── app/
│   ├── (auth)/
│   │   ├── login.tsx
│   │   └── register.tsx
│   ├── (tabs)/
│   │   ├── index.tsx              # Daily Spend (home / ritual)
│   │   ├── follow-up.tsx          # habits + reflection (or modal)
│   │   ├── calendar.tsx
│   │   ├── graphs.tsx
│   │   ├── goals.tsx
│   │   └── settings.tsx
│   ├── _layout.tsx
│   └── +not-found.tsx
├── src/
│   ├── api/
│   │   ├── client.ts              # base URL, Bearer, refresh
│   │   ├── auth.ts
│   │   ├── categories.ts
│   │   ├── ritual.ts
│   │   ├── calendar.ts
│   │   ├── charts.ts
│   │   └── goals.ts
│   ├── db/
│   │   ├── schema.ts              # sqlite tables + outbox
│   │   └── sync.ts                # flush ritual queue when online
│   ├── store/
│   │   ├── authStore.ts
│   │   └── ritualDraftStore.ts    # tonight's amounts before save
│   ├── components/
│   │   ├── CategoryChip.tsx
│   │   ├── AmountInput.tsx
│   │   ├── GoalProgressCard.tsx
│   │   └── CalendarMonth.tsx
│   ├── theme/
│   │   └── colors.ts              # dark + purple tokens
│   └── types/
│       └── api.ts                 # mirror OpenAPI / generate from schema
├── assets/
├── app.json
├── package.json
└── README.md
```

---

## API mapping

| Screen / action | Endpoint |
|-----------------|----------|
| Register / login | `POST /api/v1/auth/register/`, `POST /api/v1/auth/token/` |
| Load chips | `GET /api/v1/category-groups/for-ritual/` |
| Save full or quick ritual | `POST /api/v1/ritual/` with `category_uuid` (writes NightCap) |
| Day record | `GET/PATCH /api/v1/nightcaps/{date}/` |
| Edit past date | same ritual / nightcaps APIs with chosen `date` |
| Day reflection only | `PATCH /api/v1/nightcaps/{date}/` (or legacy day-reflections) |
| Month view | `GET /api/v1/calendar/?year=&month=` |
| Graphs | `GET /api/v1/charts/?period=daily\|weekly` |
| Goals | `GET /api/v1/goals/` embeds `category_detail` + `progress`; create with `category_uuid` + `target_value` |
| Set/replace goal | `POST /api/v1/goals/set/` |
| Manage groups | CRUD `/api/v1/category-groups/` |
| Custom categories | CRUD `/api/v1/categories/` with `group` |

Auth storage: Expo SecureStore for `access` + `refresh`. Attach `Authorization: Bearer <access>` on every authenticated request; on 401 refresh once then retry.

Icon keys from backend (`fast_food`, `groceries`, …) should map to emoji/glyphs in a single `iconMap` constant.

### Ritual payload example

```ts
await api.ritual.save({
  date: todayIso,
  reflection: draft.reflection,
  items: [
    { category_uuid: groceries.uuid, amount: "42.15" },
    { category_uuid: read.uuid, quantity: "25" },
    { category_uuid: sauna.uuid, quantity: "1" },
  ],
});
```

---

## Offline-first sketch

1. Draft spend/habits in Zustand + persist to sqlite.
2. On Save, write an **outbox** row `{ type: 'ritual', payload, created_at }`.
3. Optimistic update of local calendar day markers.
4. Background flush: `POST /api/v1/ritual/` when network available; mark outbox synced.
5. On login/cold start, pull `GET /categories/`, recent calendar month, and goals.

Conflict policy for v1: server upsert wins (one value per category/day).

---

## UI / UX notes

- First tab = one calm composition (Daily Spend), not a dashboard.
- Dark background, purple accents for primary CTA and selected chips.
- Large amount inputs, thumb-friendly chips, minimal friction before save.
- After Save Spend, navigate to follow-up; allow Skip.
- Calendar: dots from `has_entries` / `has_reflection`; tap day to edit ritual for that date.
- Graphs: simple bar/line from charts `points`.
- Goals: color by `status_label` (`on_track`, `at_risk`, `behind`, `reached`).

Motion: subtle fade/slide between spend → follow-up; soft scale on chip select (2–3 intentional motions).

---

## Acceptance checklist

- [ ] Register seeds categories matching spend + follow-up chips
- [ ] Full ritual saves spend + habits + reflection in one request
- [ ] Single-category quick log works
- [ ] Past dates editable via calendar
- [ ] Month markers and charts render from API
- [ ] Goal cards show on_track / behind style labels
- [ ] Settings can create custom category
- [ ] JWT refresh works; tokens not in AsyncStorage plaintext if SecureStore available
- [ ] Runs on iOS Simulator and Android Emulator

---

## Commands cheatsheet

```bash
# Mobile
npx expo start
npx expo run:ios
npx expo run:android

# Backend (separate repo / terminal)
docker compose up
# docs: http://localhost:8000/api/docs/
```

---

## Cursor prompt starter (paste in mobile repo)

> Implement NightCap as Expo + Expo Router + TypeScript + NativeWind + Zustand + expo-sqlite per `MOBILE_FRONTEND_PLAN.md`. Use `docs/API_MOBILE.md` from the backend as the API contract. Prefer `category_uuid` and `POST /api/v1/ritual/` for saves. Dark UI with purple accents. Deliver the Daily Spend → Follow-up → Calendar → Graphs → Goals → Settings flow with offline outbox sync.
