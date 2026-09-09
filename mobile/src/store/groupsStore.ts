import { create } from "zustand";

import * as categoriesApi from "@/src/api/categories";
import * as groupsApi from "@/src/api/groups";
import type {
  Category,
  CategoryCreateInput,
  CategoryGroup,
  CategoryGroupCreateInput,
  CategoryGroupUpdateInput,
  CategoryUpdateInput,
  RitualCategoryGroup,
} from "@/src/types/api";
import { SPEND_GROUP_KEY } from "@/src/types/api";

type GroupsState = {
  groups: CategoryGroup[];
  ritualGroups: RitualCategoryGroup[];
  ungrouped: Category[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshRitual: () => Promise<void>;
  spendCategories: () => Category[];
  createGroup: (input: CategoryGroupCreateInput) => Promise<CategoryGroup>;
  updateGroup: (
    id: number,
    input: CategoryGroupUpdateInput
  ) => Promise<CategoryGroup>;
  deleteGroup: (id: number) => Promise<void>;
  createCategory: (input: CategoryCreateInput) => Promise<Category>;
  updateCategory: (id: number, input: CategoryUpdateInput) => Promise<Category>;
  removeFromGroup: (id: number) => Promise<void>;
  assignToGroup: (categoryId: number, groupId: number) => Promise<void>;
};

export const useGroupsStore = create<GroupsState>((set, get) => ({
  groups: [],
  ritualGroups: [],
  ungrouped: [],
  loading: false,
  error: null,

  spendCategories: () => {
    const ritual = get().ritualGroups.find((g) => g.key === SPEND_GROUP_KEY);
    const fromRitual = (ritual?.categories ?? []).filter(
      (c) => c.metric_kind === "amount"
    );
    if (fromRitual.length) {
      return [...fromRitual].sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
      );
    }
    const spend = get().groups.find((g) => g.key === SPEND_GROUP_KEY);
    return [...(spend?.categories ?? [])]
      .filter((c) => c.metric_kind === "amount")
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  },

  load: async () => {
    await get().refresh();
  },

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const [groups, ritualGroups, ungrouped] = await Promise.all([
        groupsApi.listGroups(),
        groupsApi.listGroupsForRitual(),
        categoriesApi.listCategories({ ungrouped: true }),
      ]);

      // Attach nested categories for settings: list endpoint may omit them,
      // so hydrate from detail when missing.
      const withCats = await Promise.all(
        groups.map(async (g) => {
          if (g.categories) return g;
          try {
            return await groupsApi.getGroup(g.id);
          } catch {
            return g;
          }
        })
      );

      set({
        groups: withCats.sort(
          (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
        ),
        ritualGroups,
        ungrouped,
        loading: false,
      });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : "Failed to load groups",
      });
    }
  },

  refreshRitual: async () => {
    try {
      const ritualGroups = await groupsApi.listGroupsForRitual();
      set({ ritualGroups });
    } catch {
      // keep cache
    }
  },

  createGroup: async (input) => {
    const created = await groupsApi.createGroup(input);
    await get().refresh();
    return created;
  },

  updateGroup: async (id, input) => {
    const updated = await groupsApi.updateGroup(id, input);
    await get().refresh();
    return updated;
  },

  deleteGroup: async (id) => {
    await groupsApi.deleteGroup(id);
    await get().refresh();
  },

  createCategory: async (input) => {
    const created = await categoriesApi.createCategory(input);
    await get().refresh();
    return created;
  },

  updateCategory: async (id, input) => {
    const updated = await categoriesApi.updateCategory(id, input);
    await get().refresh();
    return updated;
  },

  removeFromGroup: async (id) => {
    await categoriesApi.removeCategoryFromGroup(id);
    await get().refresh();
  },

  assignToGroup: async (categoryId, groupId) => {
    await categoriesApi.assignCategoryToGroup(categoryId, groupId);
    await get().refresh();
  },
}));
