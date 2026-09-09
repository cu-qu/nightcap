import { create } from "zustand";

import * as authApi from "@/src/api/auth";
import { setUnauthorizedHandler } from "@/src/api/client";
import { clearTokens, getAccessToken, setTokens } from "@/src/api/tokens";
import type { User } from "@/src/types/api";

type AuthState = {
  user: User | null;
  hydrated: boolean;
  isAuthenticated: boolean;
  hydrate: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
};

export const useAuthStore = create<AuthState>((set, get) => {
  setUnauthorizedHandler(() => {
    void get().logout();
  });

  return {
    user: null,
    hydrated: false,
    isAuthenticated: false,

    setUser: (user) => set({ user, isAuthenticated: !!user }),

    hydrate: async () => {
      try {
        const access = await getAccessToken();
        if (!access) {
          set({ user: null, isAuthenticated: false, hydrated: true });
          return;
        }
        const user = await authApi.fetchMe();
        set({ user, isAuthenticated: true, hydrated: true });
      } catch {
        await clearTokens();
        set({ user: null, isAuthenticated: false, hydrated: true });
      }
    },

    login: async (username, password) => {
      const tokens = await authApi.login({ username, password });
      await setTokens(tokens.access, tokens.refresh);
      const user = await authApi.fetchMe();
      set({ user, isAuthenticated: true, hydrated: true });
    },

    register: async (username, email, password) => {
      const data = await authApi.register({ username, email, password });
      await setTokens(data.access, data.refresh);
      set({ user: data.user, isAuthenticated: true, hydrated: true });
    },

    logout: async () => {
      await clearTokens();
      set({ user: null, isAuthenticated: false });
    },
  };
});
