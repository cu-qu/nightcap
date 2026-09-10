import { create } from "zustand";

import { clampMood } from "@/src/constants/moods";
import type {
  Category,
  CompletedWith,
  NightCap,
  RitualEntry,
  RitualItem,
  RitualRequest,
} from "@/src/types/api";
import {
  loadRitualDraft,
  saveRitualDraft,
} from "@/src/db/schema";
import { isFutureIsoDate, todayIso } from "@/src/utils/date";
import { categorySupportsCompletedWith } from "@/src/utils/ritualCategories";

type ValueMap = Record<string, string>;
type CompletedWithMap = Record<string, CompletedWith>;

function formatSavedDecimal(raw: string | null | undefined): string {
  if (raw == null) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n === 0) return "";
  return String(n);
}

function isBlank(value: string | undefined): boolean {
  return !value || !value.trim();
}

function categoryForEntry(
  entry: RitualEntry,
  byUuid: Record<string, Category>
): Category | undefined {
  const uuid = entry.category_uuid;
  return entry.category_detail ?? (uuid ? byUuid[uuid] : undefined);
}

let persistChain: Promise<void> = Promise.resolve();
let persistQueued = false;

type RitualDraftState = {
  date: string;
  spendValues: ValueMap;
  habitValues: ValueMap;
  booleanValues: Record<string, boolean>;
  completedWith: CompletedWithMap;
  mood: string;
  reflection: string;
  favoriteMoment: string;
  favoritePhotoUri: string;
  favoritePhotoName: string;
  favoritePhotoType: string;
  hasRemotePhoto: boolean;
  photoCleared: boolean;
  setDate: (date: string) => void;
  beginForDate: (date: string, opts?: { reset?: boolean }) => void;
  setSpendValue: (uuid: string, value: string) => void;
  setHabitValue: (uuid: string, value: string) => void;
  setBooleanValue: (uuid: string, value: boolean) => void;
  setCategoryValue: (category: Category, value: string | boolean) => void;
  getCategoryValue: (category: Category) => string | boolean;
  setCompletedWith: (uuid: string, value: CompletedWith) => void;
  getCompletedWith: (uuid: string) => CompletedWith;
  setMood: (value: string) => void;
  setReflection: (value: string) => void;
  setFavoriteMoment: (value: string) => void;
  setFavoritePhoto: (file: { uri: string; name: string; type: string }) => void;
  clearFavoritePhoto: () => void;
  applySavedNightCap: (nightcap: NightCap, categories?: Category[]) => void;
  clear: () => void;
  hydrate: () => Promise<void>;
  persist: () => Promise<void>;
  buildItems: (categories: Category[]) => RitualItem[];
  buildRitualPayload: (categories: Category[]) => RitualRequest;
};

export const useRitualDraftStore = create<RitualDraftState>((set, get) => ({
  date: todayIso(),
  spendValues: {},
  habitValues: {},
  booleanValues: {},
  completedWith: {},
  mood: "",
  reflection: "",
  favoriteMoment: "",
  favoritePhotoUri: "",
  favoritePhotoName: "",
  favoritePhotoType: "",
  hasRemotePhoto: false,
  photoCleared: false,

  setDate: (date) => {
    if (isFutureIsoDate(date)) return;
    set({ date });
    void get().persist();
  },

  beginForDate: (date, opts) => {
    if (isFutureIsoDate(date)) return;
    const reset = !!opts?.reset || get().date !== date;
    if (!reset) return;
    set({
      date,
      spendValues: {},
      habitValues: {},
      booleanValues: {},
      completedWith: {},
      mood: "",
      reflection: "",
      favoriteMoment: "",
      favoritePhotoUri: "",
      favoritePhotoName: "",
      favoritePhotoType: "",
      hasRemotePhoto: false,
      photoCleared: false,
    });
    void get().persist();
  },

  setSpendValue: (uuid, value) => {
    set((s) => ({ spendValues: { ...s.spendValues, [uuid]: value } }));
    void get().persist();
  },

  setHabitValue: (uuid, value) => {
    set((s) => ({ habitValues: { ...s.habitValues, [uuid]: value } }));
    void get().persist();
  },

  setBooleanValue: (uuid, value) => {
    set((s) => ({ booleanValues: { ...s.booleanValues, [uuid]: value } }));
    void get().persist();
  },

  setCategoryValue: (category, value) => {
    if (category.metric_kind === "boolean") {
      get().setBooleanValue(category.uuid, Boolean(value));
      return;
    }
    const text = typeof value === "string" ? value : "";
    if (category.type === "finance_expense") {
      get().setSpendValue(category.uuid, text);
      return;
    }
    get().setHabitValue(category.uuid, text);
  },

  getCategoryValue: (category) => {
    const { spendValues, habitValues, booleanValues } = get();
    if (category.metric_kind === "boolean") {
      return !!booleanValues[category.uuid];
    }
    if (category.type === "finance_expense") {
      return spendValues[category.uuid] ?? "";
    }
    return habitValues[category.uuid] ?? "";
  },

  setCompletedWith: (uuid, value) => {
    set((s) => ({ completedWith: { ...s.completedWith, [uuid]: value } }));
    void get().persist();
  },

  getCompletedWith: (uuid) => get().completedWith[uuid] ?? "alone",

  setMood: (mood) => {
    set({ mood: clampMood(mood) });
    void get().persist();
  },

  setReflection: (reflection) => {
    set({ reflection });
    void get().persist();
  },

  setFavoriteMoment: (favoriteMoment) => {
    set({ favoriteMoment });
    void get().persist();
  },

  setFavoritePhoto: (file) => {
    set({
      favoritePhotoUri: file.uri,
      favoritePhotoName: file.name,
      favoritePhotoType: file.type,
      photoCleared: false,
    });
    void get().persist();
  },

  clearFavoritePhoto: () => {
    const hadRemote = get().hasRemotePhoto;
    set({
      favoritePhotoUri: "",
      favoritePhotoName: "",
      favoritePhotoType: "",
      hasRemotePhoto: false,
      photoCleared: hadRemote || get().photoCleared,
    });
    void get().persist();
  },

  applySavedNightCap: (nightcap, categories = []) => {
    if (nightcap.date && nightcap.date !== get().date) return;
    const byUuid = Object.fromEntries(categories.map((c) => [c.uuid, c]));
    const spendValues = { ...get().spendValues };
    const habitValues = { ...get().habitValues };
    const booleanValues = { ...get().booleanValues };
    const completedWith = { ...get().completedWith };

    for (const entry of nightcap.entries ?? []) {
      const uuid = String(
        entry.category_uuid || entry.category_detail?.uuid || ""
      );
      if (!uuid) continue;
      const cat = categoryForEntry(entry, byUuid) ?? byUuid[uuid];

      if (
        completedWith[uuid] === undefined &&
        (!cat || categorySupportsCompletedWith(cat))
      ) {
        const saved = entry.completed_with;
        if (saved === "alone" || saved === "with_partner") {
          completedWith[uuid] = saved;
        }
      }

      if (cat?.metric_kind === "boolean") {
        if (booleanValues[uuid] === undefined) {
          booleanValues[uuid] = Number(entry.quantity) >= 1;
        }
        continue;
      }

      const isSpend = cat
        ? cat.type === "finance_expense"
        : Boolean(formatSavedDecimal(entry.amount));
      const raw = isSpend
        ? formatSavedDecimal(entry.amount)
        : formatSavedDecimal(
            cat?.metric_kind === "amount" ? entry.amount : entry.quantity
          );
      if (!raw) continue;

      if (isSpend) {
        if (isBlank(spendValues[uuid])) spendValues[uuid] = raw;
      } else if (isBlank(habitValues[uuid])) {
        habitValues[uuid] = raw;
      }
    }

    const mood = get().mood || clampMood(nightcap.mood ?? "");
    const reflection = get().reflection || (nightcap.reflection ?? "");
    const favoriteMoment =
      get().favoriteMoment || (nightcap.favorite_moment ?? "");
    const hasLocalPhoto = !!get().favoritePhotoUri;
    const hasRemotePhoto = hasLocalPhoto
      ? get().hasRemotePhoto
      : get().photoCleared
        ? false
        : !!nightcap.has_favorite_photo;

    set({
      spendValues,
      habitValues,
      booleanValues,
      completedWith,
      mood,
      reflection,
      favoriteMoment,
      hasRemotePhoto,
    });
    void get().persist();
  },

  clear: () => {
    set({
      date: todayIso(),
      spendValues: {},
      habitValues: {},
      booleanValues: {},
      completedWith: {},
      mood: "",
      reflection: "",
      favoriteMoment: "",
      favoritePhotoUri: "",
      favoritePhotoName: "",
      favoritePhotoType: "",
      hasRemotePhoto: false,
      photoCleared: false,
    });
    void get().persist();
  },

  hydrate: async () => {
    const draft = await loadRitualDraft();
    if (!draft) return;
    const date =
      draft.date && !isFutureIsoDate(draft.date) ? draft.date : todayIso();
    set({
      date,
      spendValues: draft.spendValues ?? {},
      habitValues: draft.habitValues ?? {},
      booleanValues: draft.booleanValues ?? {},
      completedWith: draft.completedWith ?? {},
      mood: draft.mood ?? "",
      reflection: draft.reflection ?? "",
      favoriteMoment: draft.favoriteMoment ?? "",
      favoritePhotoUri: draft.favoritePhotoUri ?? "",
      favoritePhotoName: draft.favoritePhotoName ?? "",
      favoritePhotoType: draft.favoritePhotoType ?? "",
      hasRemotePhoto: !!draft.hasRemotePhoto,
      photoCleared: !!draft.photoCleared,
    });
  },

  persist: async () => {
    persistQueued = true;
    persistChain = persistChain
      .then(async () => {
        if (!persistQueued) return;
        persistQueued = false;
        const {
          date,
          spendValues,
          habitValues,
          booleanValues,
          completedWith,
          mood,
          reflection,
          favoriteMoment,
          favoritePhotoUri,
          favoritePhotoName,
          favoritePhotoType,
          hasRemotePhoto,
          photoCleared,
        } = get();
        await saveRitualDraft({
          date,
          spendValues,
          habitValues,
          booleanValues,
          completedWith,
          mood,
          reflection,
          favoriteMoment,
          favoritePhotoUri,
          favoritePhotoName,
          favoritePhotoType,
          hasRemotePhoto,
          photoCleared,
        });
      })
      .catch(() => {});
    await persistChain;
  },

  buildItems: (categories) => {
    const byUuid = Object.fromEntries(categories.map((c) => [c.uuid, c]));
    const { spendValues, habitValues, booleanValues, completedWith } = get();
    const items: RitualItem[] = [];

    for (const [uuid, raw] of Object.entries(spendValues)) {
      const trimmed = raw.trim();
      if (!trimmed || Number(trimmed) <= 0) continue;
      const cat = byUuid[uuid];
      if (!cat) continue;
      items.push({
        category_uuid: uuid,
        amount: trimmed,
      });
    }

    for (const [uuid, raw] of Object.entries(habitValues)) {
      const trimmed = raw.trim();
      if (!trimmed || Number(trimmed) <= 0) continue;
      const cat = byUuid[uuid];
      if (!cat) continue;
      if (cat.metric_kind === "amount") {
        items.push({
          category_uuid: uuid,
          amount: trimmed,
        });
      } else {
        items.push({
          category_uuid: uuid,
          quantity: trimmed,
          completed_with: completedWith[uuid] ?? "alone",
        });
      }
    }

    for (const [uuid, on] of Object.entries(booleanValues)) {
      if (!on) continue;
      if (!byUuid[uuid]) continue;
      items.push({
        category_uuid: uuid,
        quantity: "1",
        completed_with: completedWith[uuid] ?? "alone",
      });
    }

    return items;
  },

  buildRitualPayload: (categories) => {
    const { date, mood, reflection, favoriteMoment, buildItems } = get();
    return {
      date,
      // Always include mood so `""` clears on the backend.
      mood: clampMood(mood),
      reflection: reflection.trim(),
      favorite_moment: favoriteMoment.trim(),
      status: "completed",
      // Snapshot the form: omitted categories are removed on the server.
      replace_items: categories.length > 0,
      items: buildItems(categories),
    };
  },
}));
