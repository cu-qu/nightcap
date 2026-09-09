# NightCap Mobile API Guide

Contract for the Expo NightCap client. Interactive docs: `/api/docs/`. Raw OpenAPI: `/api/schema/`.

Base URL (local): `http://localhost:8000`

All mobile endpoints live under `/api/v1/` and require `Authorization: Bearer <access>` except register/token.

## Auth

1. `POST /api/v1/auth/register/` — `{ username, email, password, invite_code? }` → `{ user, access, refresh }` and seeds default ritual categories. `user` includes `onboarding_completed`, `tracking_mode`, and `partnership`.
2. `POST /api/v1/auth/token/` — `{ email or username, password }` → `{ access, refresh }`.
3. `POST /api/v1/auth/token/refresh/` — `{ refresh }` → new `access`.
4. `GET/PATCH /api/v1/auth/me/` and `/api/v1/auth/profile/`.

## Couple space & onboarding

NightCap is couple habit tracking with personal goals.

- `GET/POST /api/v1/partnership/` — current couple space (`invite_code`, members) or create one
- `POST /api/v1/partnership/invite/` — `{ email? }` share code; emails if provided
- `POST /api/v1/partnership/join/` — `{ invite_code }` copies shared goals onto the joining account
- `GET /api/v1/onboarding/templates/?mode=solo|couple` — spend / workout / habit starters (`Together` vs `Just me` via `suggested_scope`)
- `POST /api/v1/onboarding/setup/` — `{ mode, templates: [{ slug, scope?, target_value? }], invite_email? }` creates the couple space if needed, applies goals, marks onboarding complete

Goals have `scope`: `personal` | `shared`. Shared progress sums both partners’ matching categories.

Prefer category/entry/goal/NightCap **`uuid`** fields in the mobile client. Integer `id` remains for back-compat.

## Category groups (NightCap layout)

Configurable sections shown on each NightCap screen.

- `GET/POST /api/v1/category-groups/`
- `GET/PATCH/PUT/DELETE /api/v1/category-groups/{id}/` — default groups cannot be deleted
- **`GET /api/v1/category-groups/for-ritual/`** — ordered groups with `show_in_ritual=true` and nested categories (use this for Daily Spend + Follow-up UI)

**Categories are never deleted by users.** Remove from a group instead:

- `POST /api/v1/categories/{id}/remove-from-group/`
- or `PATCH /api/v1/categories/{id}/` with `{ "group": null }`
- `DELETE /api/v1/categories/{id}/` returns **405**
- List ungrouped: `GET /api/v1/categories/?ungrouped=true`
- Deleting a non-default group detaches its categories (does not delete them)

Default groups (seeded on register / sync):

| key | name | purpose |
|-----|------|---------|
| `daily_spend` | Daily Spend | Amount chips for tonight's spending |
| `follow_up` | Follow-up | Habits / invested / workout after spend |

Categories include `group`, `group_uuid`, `group_key`, `sort_order`, `icon` (optional key), and **`emoji`** (saved display glyph, e.g. `"🛒"`).

```http
PATCH /api/v1/categories/{id}/
{ "emoji": "🛒" }
```

Filter with `?group_key=daily_spend`.

## NightCap (one per user per day)

- `GET /api/v1/nightcaps/?start_date=&end_date=`
- `POST /api/v1/nightcaps/` — upsert by `date` with optional `reflection` / `mood` / `status`
- `GET/PATCH /api/v1/nightcaps/{YYYY-MM-DD}/` — detail includes linked `entries`

Fields: `uuid`, `date`, `reflection`, `mood`, `status` (`draft` | `completed`), `completed_at`, `entries`.

`mood` (optional) — any short emoji/string (max 32 chars). Suggested presets:

| mood | meaning |
|------|---------|
| 🤩 | Great |
| 🙂 | Good |
| 😐 | Okay |
| 😔 | Low |
| 😣 | Rough |

Custom moods are allowed (e.g. `"🔥"`, `"😴"`, `"🪩"`).

## Default categories (seeded on register)

| Name | Type | Metric | Unit | Icon key |
|------|------|--------|------|----------|
| Fast Food | finance_expense | amount | usd | fast_food |
| Eating Out | finance_expense | amount | usd | eating_out |
| Food Deliveries | finance_expense | amount | usd | food_deliveries |
| Groceries | finance_expense | amount | usd | groceries |
| Car Gas | finance_expense | amount | usd | car_gas |
| Car Repair | finance_expense | amount | usd | car_repair |
| House Supplies | finance_expense | amount | usd | house_supplies |
| Clothes | finance_expense | amount | usd | clothes |
| Gifts | finance_expense | amount | usd | gifts |
| Online Shopping | finance_expense | amount | usd | online_shopping |
| Going Out | finance_expense | amount | usd | going_out |
| I Invested | finance_income | amount | usd | invested |
| I Read | habit | quantity | minutes | read |
| I Ran / Worked Out | fitness | quantity | km | run_workout |
| Sauna / Meditation | habit | boolean | count | sauna_meditation |

Sync missing defaults for existing users:

```bash
python manage.py sync_default_categories
```

## Nightly ritual (primary write path)

`POST /api/v1/ritual/`

Creates/updates the **NightCap** for that date, upserts entries, sets reflection.

```json
{
  "date": "2026-07-13",
  "reflection": "Ended on a good note.",
  "mood": "🙂",
  "status": "completed",
  "items": [
    { "category_uuid": "<uuid>", "amount": "18.50" },
    { "category_uuid": "<uuid>", "quantity": "30" },
    { "category_uuid": "<uuid>", "quantity": "1", "label": "Evening sauna" }
  ]
}
```

Rules:

- Upserts **one entry per category per date** (`unique_entry_per_user_date_category`).
- `items` may be empty (reflection-only).
- Single quick-log = one item (or `POST /api/v1/entries/`).
- Accepts `category_uuid` **or** integer `category` (not both).
- Metric validation follows category `metric_kind` (`amount` | `quantity` | `boolean` with quantity `0`/`1`).
- `quantity` supports decimals (e.g. `3.5` km).

Response:

```json
{
  "date": "2026-07-13",
  "reflection": "Ended on a good note.",
  "entries": [ /* EntrySerializer[] */ ],
  "summary": { /* daily-summary shape + reflection flags */ }
}
```

## Day reflection

- Via ritual: optional `reflection` field.
- Direct: `GET|PUT|PATCH /api/v1/day-reflections/2026-07-13/` with body `{ "reflection": "…" }`.

## Categories & settings

- `GET/POST /api/v1/categories/`
- `GET/PATCH/PUT/DELETE /api/v1/categories/{id}/`
- Each category includes `uuid`, `icon`, `metric_kind`, `unit`, `is_default`.
- Custom habits: create with `type=habit` or `custom`.

## Calendar

`GET /api/v1/calendar/?year=2026&month=7`

Each day includes NightCap mood plus a **groups** summary for category groups that had entries that night (active groups recorded on the NightCap).

```json
{
  "year": 2026,
  "month": 7,
  "days": [
    {
      "date": "2026-07-13",
      "has_entries": true,
      "has_reflection": true,
      "has_nightcap": true,
      "nightcap_status": "completed",
      "mood": "🙂",
      "entry_count": 4,
      "expense_total": "42.10",
      "habit_count": 2,
      "groups": [
        {
          "uuid": "...",
          "key": "daily_spend",
          "name": "Daily Spend",
          "icon": "spend",
          "entry_count": 3,
          "expense_total": "42.10",
          "amount_total": "42.10",
          "quantity_total": "0.00",
          "category_emojis": ["🍔", "🛒", "🛵"]
        },
        {
          "uuid": "...",
          "key": "follow_up",
          "name": "Follow-up",
          "icon": "follow_up",
          "entry_count": 1,
          "expense_total": "0.00",
          "amount_total": "0.00",
          "quantity_total": "30.00",
          "category_emojis": ["📖"]
        }
      ]
    }
  ]
}
```

## Charts

`GET /api/v1/charts/?period=daily&start_date=2026-07-01&end_date=2026-07-31`  
`GET /api/v1/charts/?period=weekly`

Defaults: daily = current month; weekly = last 8 weeks.

Response includes `points[]` (`date` or `week_start`, totals, `entry_count`) and `by_category` rollup.

## Goals (simple, one category each)

A goal tracks a **single category** over a period (`daily` | `weekly` | `monthly`).

**One active goal per category** — weekly *or* monthly, not both. Use `POST /goals/set/` to create or replace (including switching period).

**Setup**

```http
POST /api/v1/goals/
```

```json
{
  "category_uuid": "<groceries-uuid>",
  "target_value": "200.00",
  "period": "monthly"
}
```

Optional: `direction` (`max` stay under / `min` hit target), `name`, `warn_at_percent` (default 80).

Defaults:
- Money/amount categories → `direction=max` (budget)
- Habits/quantity/boolean → `direction=min` (hit target)
- `period=monthly` if omitted

Upsert helper (replace for the same category — any prior weekly/monthly goal):

```http
POST /api/v1/goals/set/
```

**Track**

```http
GET /api/v1/goals/
```

Each item includes:
- `category_detail` — the tied category (`uuid`, `name`, `metric_kind`, `unit`, `icon`)
- `progress` — live totals from that category’s entries in the current period

```json
{
  "uuid": "...",
  "target_value": "200.00",
  "period": "monthly",
  "direction": "max",
  "category_detail": { "uuid": "...", "name": "Groceries", "metric_kind": "amount", "unit": "usd" },
  "progress": {
    "current_value": "40.00",
    "percent_used": 20.0,
    "status": "ok",
    "status_label": "on_track",
    "period_start": "2026-07-01",
    "period_end": "2026-07-31"
  }
}
```

| status | status_label |
|--------|----------------|
| ok | on_track |
| warning | at_risk |
| exceeded | behind |
| reached | reached |

Also:
- `GET /api/v1/goals/{id}/` — one goal + progress
- `GET /api/v1/goals/{id}/progress/` — progress only
- `GET /api/v1/goals/progress/` — all active progress rows
- `GET /api/v1/goals/?category_uuid=` — filter
- `GET /api/v1/goals/?active=false` — include deactivated
- `PATCH /api/v1/goals/{id}/` — change target/period/direction
- `DELETE /api/v1/goals/{id}/` — soft-deactivate (`is_active=false`)

### Group goal summary (health by category group)

```http
GET /api/v1/goals/group-summary/
GET /api/v1/goals/group-summary/?period=weekly
GET /api/v1/goals/group-summary/?period=monthly
```

Returns active goals nested under category groups (Daily Spend, Follow-up, …) with
simple **mode** and **health** for mobile UI:

| mode | meaning |
|------|---------|
| `stay_under` | Budget — don't go over |
| `pass` | Hit at least the target (quantity) |
| `completed` | Do it N times (boolean/habit) |

| health | meaning |
|--------|---------|
| `healthy` | Comfortably on track / still working toward it |
| `close` | Near spend **limit** (stay under) **or** near being **reached** (pass/complete) |
| `passed` | Pass/complete target hit |
| `over` | Stay-under budget exceeded |

(`behind` appears in `counts` for forward-compat; default mapping uses the four states above. Threshold = each goal’s `warn_at_percent`, default 80.)

**Totals / metrics** (top-level and per group):

| field | meaning |
|-------|---------|
| `metrics.stay_under.*` | Sum of budget goals: `target_total`, `current_total`, `remaining_total`, `percent_used`, health breakdown |
| `metrics.pass.*` | Sum of “pass X” goals |
| `metrics.completed.*` | Sum of “complete N times” goals |
| `metrics.target_total` / `current_total` / `remaining_total` | Combined across modes in that scope |
| `metrics.percent_used` | `current_total / target_total` |
| `metrics.avg_percent_used` | Mean of each goal’s `percent_used` |

**Period filter / week → month roll-up**

| `?period=` | Includes |
|------------|----------|
| `weekly` | Weekly goals only (native week window) |
| `monthly` | Monthly goals **and** weekly goals scaled into the month |
| `daily` | Daily goals only |
| _(omitted)_ | All active goals (native periods, no scaling) |

When `period=monthly`, weekly goals are expanded into a month equivalent:

- `weeks_in_month` = number of **Mondays** in that calendar month (4 or 5; leap years / year edges handled)
- `target_value` = `base_target_value × weeks_in_month` (e.g. $45/week × 4 = **$180**)
- `current_value` = entries for the **full calendar month**
- `period_start` / `period_end` = month bounds
- `rolls_into_month: true`, plus `weekly_progress` for the native this-week window
- Scaled values feed `metrics` and `metrics_by_period.monthly`
- Native this-week totals stay under `metrics_by_period.weekly` / `weekly_progress`

True monthly goals are unchanged and also live under `metrics_by_period.monthly`.

```json
{
  "period": "monthly",
  "reference_date": "2026-07-14",
  "counts": {
    "total": 2,
    "healthy": 0,
    "close": 1,
    "behind": 0,
    "passed": 0,
    "over": 0,
    "stay_under": 1,
    "pass": 0,
    "completed": 1
  },
  "metrics": {
    "stay_under": {
      "goal_count": 1,
      "target_total": "200.00",
      "current_total": "170.00",
      "remaining_total": "30.00",
      "percent_used": 85.0,
      "healthy": 0,
      "close": 1,
      "behind": 0,
      "passed": 0,
      "over": 0
    },
    "pass": { "goal_count": 0, "target_total": "0.00", "current_total": "0.00", "remaining_total": "0.00", "percent_used": 0.0 },
    "completed": { "goal_count": 1, "target_total": "2.00", "current_total": "2.00", "remaining_total": "0.00", "percent_used": 100.0, "passed": 1 },
    "target_total": "202.00",
    "current_total": "172.00",
    "remaining_total": "30.00",
    "percent_used": 85.15,
    "avg_percent_used": 92.5
  },
  "groups": [
    {
      "key": "daily_spend",
      "name": "Daily Spend",
      "counts": { "total": 1, "stay_under": 1, "close": 1 },
      "metrics": {
        "stay_under": { "goal_count": 1, "target_total": "200.00", "current_total": "170.00", "remaining_total": "30.00", "percent_used": 85.0 },
        "target_total": "200.00",
        "current_total": "170.00",
        "remaining_total": "30.00",
        "percent_used": 85.0,
        "avg_percent_used": 85.0
      },
      "goals": [
        {
          "display_name": "Groceries",
          "mode": "stay_under",
          "health": "close",
          "target_value": "200.00",
          "current_value": "170.00",
          "remaining_value": "30.00",
          "percent_used": 85.0,
          "category": { "uuid": "...", "name": "Groceries", "emoji": "🛒", "metric_kind": "amount", "unit": "usd" }
        }
      ]
    }
  ]
}
```

Default groups with zero goals still appear so the client can render empty sections.
Ungrouped goals appear under `"name": "Ungrouped"` only when present.

## Suggested client sequence (nightly)

1. `GET /api/v1/category-groups/for-ritual/` → render Spend then Follow-up chips.
2. User fills Daily Spend → optionally Continue.
3. `POST /api/v1/ritual/` with spend items + habit items + reflection (creates NightCap).
4. Month tab → `GET /api/v1/calendar/` (includes `has_nightcap` / `nightcap_status`).
5. Or open a day → `GET /api/v1/nightcaps/{date}/`.
6. Graphs → `GET /api/v1/charts/?period=daily|weekly`.
7. Goals → `GET /api/v1/goals/group-summary/?period=weekly|monthly` (health by group), or `GET /api/v1/goals/` for the flat list.

## Related docs

- Swagger UI: `/api/docs/`
- Expo build brief: [`MOBILE_FRONTEND_PLAN.md`](MOBILE_FRONTEND_PLAN.md)
