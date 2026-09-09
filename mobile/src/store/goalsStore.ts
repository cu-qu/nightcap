import { create } from "zustand";

import * as goalsApi from "@/src/api/goals";
import type {
  GoalPeriod,
  GroupGoalSummary,
  SetGoalInput,
} from "@/src/types/goals";

type GoalsState = {
  summary: GroupGoalSummary | null;
  period: GoalPeriod;
  lastFetched: number | null;
  loading: boolean;
  error: string | null;
  setPeriod: (period: GoalPeriod) => void;
  load: (period?: GoalPeriod) => Promise<void>;
  refresh: () => Promise<void>;
  invalidate: () => Promise<void>;
  setGoal: (input: SetGoalInput) => Promise<void>;
  deactivateGoal: (id: number) => Promise<void>;
};

export const useGoalsStore = create<GoalsState>((set, get) => ({
  summary: null,
  period: "weekly",
  lastFetched: null,
  loading: false,
  error: null,

  setPeriod: (period) => {
    set({ period });
  },

  load: async (period) => {
    const next = period ?? get().period;
    set({ loading: true, error: null, period: next });
    try {
      const summary = await goalsApi.getGroupSummary(next);
      set({ summary, lastFetched: Date.now(), loading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Failed to load goals",
        loading: false,
      });
    }
  },

  refresh: async () => {
    await get().load(get().period);
  },

  invalidate: async () => {
    await get().refresh();
  },

  setGoal: async (input) => {
    await goalsApi.setGoal(input);
    await get().refresh();
  },

  deactivateGoal: async (id) => {
    await goalsApi.deactivateGoal(id);
    await get().refresh();
  },
}));
