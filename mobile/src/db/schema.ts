import * as SQLite from "expo-sqlite";

import type {
  CalendarDay,
  Category,
  CompletedWith,
  RitualRequest,
} from "@/src/types/api";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync("nightcap.db");
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS categories_cache (
          uuid TEXT PRIMARY KEY NOT NULL,
          json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS calendar_cache (
          year INTEGER NOT NULL,
          month INTEGER NOT NULL,
          json TEXT NOT NULL,
          PRIMARY KEY (year, month)
        );
        CREATE TABLE IF NOT EXISTS ritual_draft (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS outbox (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          synced_at TEXT
        );
      `);
      return db;
    })();
  }
  return dbPromise;
}

export type RitualDraftPersist = {
  date: string;
  spendValues: Record<string, string>;
  habitValues: Record<string, string>;
  booleanValues: Record<string, boolean>;
  completedWith: Record<string, CompletedWith>;
  mood: string;
  reflection: string;
  favoriteMoment: string;
  favoritePhotoUri: string;
  favoritePhotoName: string;
  favoritePhotoType: string;
  hasRemotePhoto: boolean;
  photoCleared: boolean;
};

export async function cacheCategories(categories: Category[]) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM categories_cache");
    for (const cat of categories) {
      await db.runAsync(
        "INSERT INTO categories_cache (uuid, json) VALUES (?, ?)",
        cat.uuid,
        JSON.stringify(cat)
      );
    }
  });
}

export async function loadCachedCategories(): Promise<Category[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ json: string }>(
    "SELECT json FROM categories_cache"
  );
  return rows.map((r) => JSON.parse(r.json) as Category);
}

export async function cacheCalendar(
  year: number,
  month: number,
  days: CalendarDay[]
) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO calendar_cache (year, month, json) VALUES (?, ?, ?)
     ON CONFLICT(year, month) DO UPDATE SET json = excluded.json`,
    year,
    month,
    JSON.stringify(days)
  );
}

export async function loadCachedCalendar(
  year: number,
  month: number
): Promise<CalendarDay[] | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ json: string }>(
    "SELECT json FROM calendar_cache WHERE year = ? AND month = ?",
    year,
    month
  );
  if (!row) return null;
  return JSON.parse(row.json) as CalendarDay[];
}

export async function markCalendarDayOptimistic(
  date: string,
  hasReflection: boolean,
  mood = "",
  extras?: { favoriteMoment?: string; hasFavoritePhoto?: boolean }
) {
  const [y, m] = date.split("-").map(Number);
  const days = (await loadCachedCalendar(y, m)) ?? [];
  const existing = days.find((d) => d.date === date);
  const favoriteMoment = extras?.favoriteMoment ?? "";
  const hasFavoritePhoto = extras?.hasFavoritePhoto ?? false;
  if (existing) {
    existing.has_entries = true;
    existing.has_nightcap = true;
    existing.entry_count = Math.max(existing.entry_count, 1);
    if (hasReflection) existing.has_reflection = true;
    if (mood) existing.mood = mood;
    if (favoriteMoment) existing.favorite_moment = favoriteMoment;
    if (hasFavoritePhoto) existing.has_favorite_photo = true;
    if (!existing.groups) existing.groups = [];
  } else {
    days.push({
      date,
      has_entries: true,
      has_reflection: hasReflection,
      has_nightcap: true,
      mood,
      favorite_moment: favoriteMoment,
      has_favorite_photo: hasFavoritePhoto,
      entry_count: 1,
      expense_total: "0",
      habit_count: 0,
      groups: [],
    });
  }
  await cacheCalendar(y, m, days);
}

export async function saveRitualDraft(draft: RitualDraftPersist) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO ritual_draft (id, json) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET json = excluded.json`,
    JSON.stringify(draft)
  );
}

export async function loadRitualDraft(): Promise<RitualDraftPersist | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ json: string }>(
    "SELECT json FROM ritual_draft WHERE id = 1"
  );
  if (!row) return null;
  return JSON.parse(row.json) as RitualDraftPersist;
}

export type OutboxRow = {
  id: number;
  type: string;
  payload_json: string;
  created_at: string;
  synced_at: string | null;
};

export async function enqueueOutbox(type: string, payload: unknown): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    "INSERT INTO outbox (type, payload_json, created_at) VALUES (?, ?, ?)",
    type,
    JSON.stringify(payload),
    new Date().toISOString()
  );
  return result.lastInsertRowId;
}

export async function listPendingOutbox(): Promise<OutboxRow[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxRow>(
    "SELECT id, type, payload_json, created_at, synced_at FROM outbox WHERE synced_at IS NULL ORDER BY id ASC"
  );
}

export async function markOutboxSynced(id: number) {
  const db = await getDb();
  await db.runAsync(
    "UPDATE outbox SET synced_at = ? WHERE id = ?",
    new Date().toISOString(),
    id
  );
}

export type RitualOutboxPayload = RitualRequest;

export type NightCapPhotoOutboxPayload =
  | { date: string; localUri: string; name: string; type: string }
  | { date: string; clear: true };
