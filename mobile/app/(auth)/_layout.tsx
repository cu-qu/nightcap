import { Redirect, Stack } from "expo-router";

import { useAuthStore } from "@/src/store/authStore";
import { colors } from "@/src/theme/colors";

export default function AuthLayout() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (hydrated && isAuthenticated) {
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
