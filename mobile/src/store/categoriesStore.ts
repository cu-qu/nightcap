import { create } from "zustand";

import type { Category } from "@/src/types/api";
import {
  FOLLOW_UP_ICON_KEYS,
  SPEND_ICON_KEYS,
} from "@/src/theme/iconMap";
import * as categoriesApi from "@/src/api/categories";
import { cacheCategories, loadCachedCategories } from "@/src/db/schema";

type CategoriesState = {
  categories: Category[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  spendCategories: () => Category[];
  followUpCategories: () => Category[];
  customHabitCategories: () => Category[];
};

function sortByIconOrder(list: Category[], order: readonly string[]) {
  return [...list].sort((a, b) => {
    const ai = order.indexOf(a.icon);
    const bi = order.indexOf(b.icon);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

export const useCategoriesStore = create<CategoriesState>((set, get) => ({
  categories: [],
  loading: false,
  error: null,

  load: async () => {
    const cached = await loadCachedCategories();
    if (cached.length) set({ categories: cached });
    await get().refresh();
  },

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const categories = await categoriesApi.listCategories();
      await cacheCategories(categories);
      set({ categories, loading: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load categories";
      set({ loading: false, error: message });
    }
  },

  spendCategories: () => {
    const { categories } = get();
    const spend = categories.filter(
      (c) =>
        c.type === "finance_expense" ||
        (SPEND_ICON_KEYS as readonly string[]).includes(c.icon)
    );
    return sortByIconOrder(spend, SPEND_ICON_KEYS);
  },

  followUpCategories: () => {
    const { categories } = get();
    const follow = categories.filter((c) =>
      (FOLLOW_UP_ICON_KEYS as readonly string[]).includes(c.icon)
    );
    return sortByIconOrder(follow, FOLLOW_UP_ICON_KEYS);
  },

  customHabitCategories: () => {
    const { categories } = get();
    return categories.filter(
      (c) =>
        !c.is_default &&
        (c.type === "habit" || c.type === "custom" || c.type === "fitness")
    );
  },
}));
