import "../global.css";

import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import "react-native-reanimated";

import { flushOutbox } from "@/src/db/sync";
import { useAuthStore } from "@/src/store/authStore";
import { useCategoriesStore } from "@/src/store/categoriesStore";
import { useGroupsStore } from "@/src/store/groupsStore";
import { useRitualDraftStore } from "@/src/store/ritualDraftStore";
import { colors } from "@/src/theme/colors";

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

export default function RootLayout() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrated = useAuthStore((s) => s.hydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const loadCategories = useCategoriesStore((s) => s.load);
  const loadGroups = useGroupsStore((s) => s.load);
  const hydrateDraft = useRitualDraftStore((s) => s.hydrate);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await Promise.race([
          Promise.all([hydrate(), hydrateDraft()]),
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
  }, [hydrate, hydrateDraft]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadCategories();
    void loadGroups();
    void flushOutbox();
  }, [isAuthenticated, loadCategories, loadGroups]);

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
