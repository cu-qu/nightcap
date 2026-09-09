import { Redirect, Stack } from "expo-router";

import { useAuthStore } from "@/src/store/authStore";
import { colors } from "@/src/theme/colors";
import { needsOnboarding } from "@/src/utils/needsOnboarding";

export default function OnboardingLayout() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  if (hydrated && !isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }
  if (hydrated && isAuthenticated && !needsOnboarding(user)) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
