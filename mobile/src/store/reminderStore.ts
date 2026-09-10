import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

import {
  DEFAULT_REMINDER_HOUR,
  DEFAULT_REMINDER_MINUTE,
  cancelNightlyReminder,
  remindersSupported,
  scheduleNightlyReminder,
} from "@/src/notifications/reminders";

const PREFS_KEY = "nightcap_reminder";

type ReminderPrefs = {
  enabled: boolean;
  hour: number;
  minute: number;
};

function clampHour(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_REMINDER_HOUR;
  return Math.min(23, Math.max(0, Math.round(value)));
}

function clampMinute(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_REMINDER_MINUTE;
  return Math.min(59, Math.max(0, Math.round(value)));
}

async function readPrefs(): Promise<ReminderPrefs | null> {
  try {
    if (await SecureStore.isAvailableAsync()) {
      const raw = await SecureStore.getItemAsync(PREFS_KEY);
      if (raw) return JSON.parse(raw) as ReminderPrefs;
    }
  } catch {
    // Fall through to web storage.
  }
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) return JSON.parse(raw) as ReminderPrefs;
    }
  } catch {
    return null;
  }
  return null;
}

async function writePrefs(prefs: ReminderPrefs): Promise<void> {
  const raw = JSON.stringify(prefs);
  try {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.setItemAsync(PREFS_KEY, raw);
      return;
    }
  } catch {
    // Fall through to web storage.
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(PREFS_KEY, raw);
    }
  } catch {
    // Prefs are device-local; failing to persist is non-fatal.
  }
}

type ReminderState = ReminderPrefs & {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setTime: (hour: number, minute: number) => Promise<void>;
  enable: (hour?: number, minute?: number) => Promise<boolean>;
  disable: () => Promise<void>;
  syncSchedule: () => Promise<void>;
};

let scheduleTimer: ReturnType<typeof setTimeout> | null = null;

function queueSchedule() {
  if (scheduleTimer) clearTimeout(scheduleTimer);
  scheduleTimer = setTimeout(() => {
    scheduleTimer = null;
    const { enabled, hour, minute } = useReminderStore.getState();
    if (!enabled) return;
    void scheduleNightlyReminder(hour, minute).then((ok) => {
      if (ok) return;
      const prefs = { enabled: false, hour, minute };
      useReminderStore.setState(prefs);
      void writePrefs(prefs);
    });
  }, 400);
}

export const useReminderStore = create<ReminderState>((set, get) => ({
  enabled: false,
  hour: DEFAULT_REMINDER_HOUR,
  minute: DEFAULT_REMINDER_MINUTE,
  hydrated: false,

  hydrate: async () => {
    const prefs = await readPrefs();
    set({
      enabled: prefs?.enabled === true,
      hour: clampHour(prefs?.hour ?? DEFAULT_REMINDER_HOUR),
      minute: clampMinute(prefs?.minute ?? DEFAULT_REMINDER_MINUTE),
      hydrated: true,
    });
  },

  setTime: async (hour, minute) => {
    const next = {
      enabled: get().enabled,
      hour: clampHour(hour),
      minute: clampMinute(minute),
    };
    set(next);
    await writePrefs(next);
    if (next.enabled) queueSchedule();
  },

  enable: async (hour, minute) => {
    if (scheduleTimer) {
      clearTimeout(scheduleTimer);
      scheduleTimer = null;
    }
    if (!remindersSupported()) return false;
    const next = {
      enabled: true,
      hour: clampHour(hour ?? get().hour),
      minute: clampMinute(minute ?? get().minute),
    };
    const ok = await scheduleNightlyReminder(next.hour, next.minute);
    const prefs = { ...next, enabled: ok };
    set(prefs);
    await writePrefs(prefs);
    return ok;
  },

  disable: async () => {
    if (scheduleTimer) {
      clearTimeout(scheduleTimer);
      scheduleTimer = null;
    }
    await cancelNightlyReminder();
    const prefs = {
      enabled: false,
      hour: get().hour,
      minute: get().minute,
    };
    set(prefs);
    await writePrefs(prefs);
  },

  syncSchedule: async () => {
    const { enabled, hour, minute } = get();
    if (!enabled || !remindersSupported()) {
      await cancelNightlyReminder();
      return;
    }
    const ok = await scheduleNightlyReminder(hour, minute);
    if (!ok) {
      const prefs = { enabled: false, hour, minute };
      set(prefs);
      await writePrefs(prefs);
    }
  },
}));
