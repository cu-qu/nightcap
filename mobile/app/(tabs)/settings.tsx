import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { getApiBaseUrl } from "@/src/api/client";
import { PrimaryButton, Screen } from "@/src/components/PrimaryButton";
import { useAuthStore } from "@/src/store/authStore";
import { colors } from "@/src/theme/colors";

export default function SettingsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.muted}>Signed in as</Text>
        <Text style={styles.username}>{user?.username ?? "—"}</Text>
        <Text style={styles.api}>API: {getApiBaseUrl()}</Text>

        <Pressable
          style={styles.linkRow}
          onPress={() => router.push("/(tabs)/categories-groups")}
          hitSlop={6}
        >
          <View style={styles.flex}>
            <Text style={styles.linkTitle}>Categories & Groups</Text>
            <Text style={styles.linkSub}>
              Configure Spend, custom groups, and ungrouped categories
            </Text>
          </View>
          <Text style={styles.linkChevron}>›</Text>
        </Pressable>

        <Pressable
          style={styles.linkRow}
          onPress={() => router.push("/(tabs)/goals")}
          hitSlop={6}
        >
          <Text style={styles.linkTitle}>Goals</Text>
          <Text style={styles.linkChevron}>›</Text>
        </Pressable>

        <View style={styles.signOut}>
          <PrimaryButton
            title="Sign out"
            variant="secondary"
            onPress={() => void logout()}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 48,
  },
  muted: {
    fontSize: 14,
    color: colors.muted,
  },
  username: {
    marginBottom: 8,
    fontSize: 20,
    fontWeight: "600",
    color: colors.text,
  },
  api: {
    marginBottom: 20,
    fontSize: 12,
    color: colors.muted,
  },
  linkRow: {
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  flex: {
    flex: 1,
  },
  linkTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  linkSub: {
    marginTop: 4,
    fontSize: 13,
    color: colors.muted,
  },
  linkChevron: {
    fontSize: 22,
    color: colors.muted,
  },
  signOut: {
    marginTop: 40,
  },
});
