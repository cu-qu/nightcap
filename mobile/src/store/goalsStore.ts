import { create } from "zustand";

import * as goalsApi from "@/src/api/goals";
import type {
  GoalPeriod,
  GroupGoalSummary,
  PendingTogetherGoal,
  SetGoalInput,
} from "@/src/types/goals";

type GoalsState = {
  summary: GroupGoalSummary | null;
  pending: PendingTogetherGoal[];
  period: GoalPeriod;
  lastFetched: number | null;
  loading: boolean;
  error: string | null;
  setPeriod: (period: GoalPeriod) => void;
  load: (period?: GoalPeriod) => Promise<void>;
  refresh: () => Promise<void>;
  invalidate: () => Promise<void>;
  setGoal: (input: SetGoalInput) => Promise<void>;
  acceptPending: (id: number) => Promise<void>;
  declinePending: (id: number) => Promise<void>;
  deactivateGoal: (id: number) => Promise<void>;
};

export const useGoalsStore = create<GoalsState>((set, get) => ({
  summary: null,
  pending: [],
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
      const [summary, pending] = await Promise.all([
        goalsApi.getGroupSummary(next),
        goalsApi.getPendingGoals().catch(() => get().pending),
      ]);
      set({ summary, pending, lastFetched: Date.now(), loading: false });
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

  acceptPending: async (id) => {
    try {
      await goalsApi.acceptGoal(id);
      await get().refresh();
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Could not approve that goal",
      });
    }
  },

  declinePending: async (id) => {
    try {
      await goalsApi.declineGoal(id);
      await get().refresh();
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Could not update that goal",
      });
    }
  },

  deactivateGoal: async (id) => {
    await goalsApi.deactivateGoal(id);
    await get().refresh();
  },
}));
