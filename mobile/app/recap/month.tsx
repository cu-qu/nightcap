import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { fetchMonthRecap } from "@/src/api/recaps";
import { RecapPlayer } from "@/src/components/RecapPlayer";
import { colors } from "@/src/theme/colors";
import type { RecapMonthResponse } from "@/src/types/api";

export default function MonthRecapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ year?: string; month?: string }>();
  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  const month = Number(params.month) || now.getMonth() + 1;

  const [data, setData] = useState<RecapMonthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    setData(null);
    void fetchMonthRecap(year, month)
      .then((payload) => {
        if (active) setData(payload);
      })
      .catch((e) => {
        if (active) {
          setError(e instanceof Error ? e.message : "Could not load this recap.");
        }
      });
    return () => {
      active = false;
    };
  }, [year, month]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <Text style={styles.back} onPress={() => router.back()}>
          Go back
        </Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return <RecapPlayer slides={data.slides} onClose={() => router.back()} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    padding: 24,
  },
  error: {
    fontSize: 16,
    color: colors.muted,
    textAlign: "center",
  },
  back: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: "700",
    color: colors.accentSoft,
  },
});
