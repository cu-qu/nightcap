import "../global.css";

import { DarkTheme, Stack, ThemeProvider, router } from "expo-router";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import "react-native-reanimated";

import { flushOutbox } from "@/src/db/sync";
import {
  REMINDER_PATH,
  cancelNightlyReminder,
  remindersSupported,
} from "@/src/notifications/reminders";
import { useAuthStore } from "@/src/store/authStore";
import { useCategoriesStore } from "@/src/store/categoriesStore";
import { useGroupsStore } from "@/src/store/groupsStore";
import { useReminderStore } from "@/src/store/reminderStore";
import { useRitualDraftStore } from "@/src/store/ritualDraftStore";
import { colors } from "@/src/theme/colors";
import { todayIso } from "@/src/utils/date";
import { needsOnboarding } from "@/src/utils/needsOnboarding";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();

const NightCapTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};

function useReminderObserver() {
  useEffect(() => {
    if (!remindersSupported()) return;

    function openFromNotification(notification: Notifications.Notification) {
      const url = notification.request.content.data?.url;
      if (typeof url !== "string" || url !== REMINDER_PATH) return;
      Notifications.clearLastNotificationResponse();

      const { isAuthenticated, user } = useAuthStore.getState();
      if (!isAuthenticated) {
        router.push("/(auth)/login");
        return;
      }
      if (needsOnboarding(user)) {
        router.push("/(onboarding)");
        return;
      }
      useRitualDraftStore.getState().beginForDate(todayIso());
      router.push(REMINDER_PATH);
    }

    const last = Notifications.getLastNotificationResponse();
    if (last?.notification) {
      openFromNotification(last.notification);
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        openFromNotification(response.notification);
      }
    );
    return () => subscription.remove();
  }, []);
}

export default function RootLayout() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrated = useAuthStore((s) => s.hydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const loadCategories = useCategoriesStore((s) => s.load);
  const loadGroups = useGroupsStore((s) => s.load);
  const hydrateDraft = useRitualDraftStore((s) => s.hydrate);
  const hydrateReminders = useReminderStore((s) => s.hydrate);
  const syncReminderSchedule = useReminderStore((s) => s.syncSchedule);

  useReminderObserver();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await Promise.race([
          Promise.all([hydrate(), hydrateDraft(), hydrateReminders()]),
          new Promise<void>((resolve) => setTimeout(resolve, 4000)),
        ]);
      } finally {
        if (!cancelled) {
          if (!useAuthStore.getState().hydrated) {
            useAuthStore.setState({ hydrated: true });
          }
          await SplashScreen.hideAsync();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrate, hydrateDraft, hydrateReminders]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadCategories();
    void loadGroups();
    void flushOutbox();
  }, [isAuthenticated, loadCategories, loadGroups]);

  useEffect(() => {
    if (!hydrated) return;
    if (isAuthenticated) void syncReminderSchedule();
    else void cancelNightlyReminder();
  }, [hydrated, isAuthenticated, syncReminderSchedule]);

  if (!hydrated) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <ThemeProvider value={NightCapTheme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="ritual/spend"
          options={{
            headerShown: true,
            title: "NightCap",
            presentation: "card",
            animation: "fade",
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
          }}
        />
        <Stack.Screen
          name="ritual/follow-up"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
});
