import { Redirect, Stack } from "expo-router";

import { needsOnboarding } from "@/src/utils/needsOnboarding";
import { needsPaywall } from "@/src/utils/needsPaywall";
import { useAuthStore } from "@/src/store/authStore";
import { colors } from "@/src/theme/colors";

export default function AuthLayout() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  if (hydrated && isAuthenticated) {
    if (needsOnboarding(user)) {
      return <Redirect href="/(onboarding)" />;
    }
    if (needsPaywall(user)) {
      return <Redirect href="/paywall" />;
    }
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
