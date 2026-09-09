import { Redirect, Tabs } from "expo-router";
import { Text } from "react-native";

import { useAuthStore } from "@/src/store/authStore";
import { colors } from "@/src/theme/colors";
import { needsOnboarding } from "@/src/utils/needsOnboarding";

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 16, opacity: focused ? 1 : 0.55 }}>{label}</Text>
  );
}

export default function TabsLayout() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  if (hydrated && !isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }
  if (hydrated && isAuthenticated && needsOnboarding(user)) {
    return <Redirect href="/(onboarding)" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.accentSoft,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => <TabIcon label="🌙" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ focused }) => <TabIcon label="📅" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="graphs"
        options={{
          title: "Graphs",
          tabBarIcon: ({ focused }) => <TabIcon label="📊" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="goals"
        options={{
          title: "Goals",
          tabBarIcon: ({ focused }) => <TabIcon label="🎯" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ focused }) => <TabIcon label="⚙️" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="categories-groups"
        options={{
          href: null,
          title: "Categories & Groups",
        }}
      />
    </Tabs>
  );
}
