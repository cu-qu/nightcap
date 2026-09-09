import { create } from "zustand";

import { clampMood } from "@/src/constants/moods";
import type { Category, RitualItem, RitualRequest } from "@/src/types/api";
import {
  loadRitualDraft,
  saveRitualDraft,
} from "@/src/db/schema";
import { isFutureIsoDate, todayIso } from "@/src/utils/date";

type ValueMap = Record<string, string>;

type RitualDraftState = {
  date: string;
  spendValues: ValueMap;
  habitValues: ValueMap;
  booleanValues: Record<string, boolean>;
  mood: string;
  reflection: string;
  setDate: (date: string) => void;
  setSpendValue: (uuid: string, value: string) => void;
  setHabitValue: (uuid: string, value: string) => void;
  setBooleanValue: (uuid: string, value: boolean) => void;
  setCategoryValue: (category: Category, value: string | boolean) => void;
  getCategoryValue: (category: Category) => string | boolean;
  setMood: (value: string) => void;
  setReflection: (value: string) => void;
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
  mood: "",
  reflection: "",

  setDate: (date) => {
    if (isFutureIsoDate(date)) return;
    set({ date });
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

  setMood: (mood) => {
    set({ mood: clampMood(mood) });
    void get().persist();
  },

  setReflection: (reflection) => {
    set({ reflection });
    void get().persist();
  },

  clear: () => {
    set({
      date: todayIso(),
      spendValues: {},
      habitValues: {},
      booleanValues: {},
      mood: "",
      reflection: "",
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
      mood: draft.mood ?? "",
      reflection: draft.reflection ?? "",
    });
  },

  persist: async () => {
    const { date, spendValues, habitValues, booleanValues, mood, reflection } =
      get();
    await saveRitualDraft({
      date,
      spendValues,
      habitValues,
      booleanValues,
      mood,
      reflection,
    });
  },

  buildItems: (categories) => {
    const byUuid = Object.fromEntries(categories.map((c) => [c.uuid, c]));
    const { spendValues, habitValues, booleanValues } = get();
    const items: RitualItem[] = [];

    for (const [uuid, raw] of Object.entries(spendValues)) {
      const trimmed = raw.trim();
      if (!trimmed || Number(trimmed) <= 0) continue;
      const cat = byUuid[uuid];
      if (!cat) continue;
      items.push({ category_uuid: uuid, amount: trimmed });
    }

    for (const [uuid, raw] of Object.entries(habitValues)) {
      const trimmed = raw.trim();
      if (!trimmed || Number(trimmed) <= 0) continue;
      const cat = byUuid[uuid];
      if (!cat) continue;
      if (cat.metric_kind === "amount") {
        items.push({ category_uuid: uuid, amount: trimmed });
      } else {
        items.push({ category_uuid: uuid, quantity: trimmed });
      }
    }

    for (const [uuid, on] of Object.entries(booleanValues)) {
      if (!on) continue;
      if (!byUuid[uuid]) continue;
      items.push({ category_uuid: uuid, quantity: "1" });
    }

    return items;
  },

  buildRitualPayload: (categories) => {
    const { date, mood, reflection, buildItems } = get();
    return {
      date,
      // Always include mood so `""` clears on the backend.
      mood: clampMood(mood),
      reflection: reflection.trim(),
      status: "completed",
      items: buildItems(categories),
    };
  },
}));
