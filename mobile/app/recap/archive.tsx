import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchRecapIndex } from "@/src/api/recaps";
import { Screen } from "@/src/components/PrimaryButton";
import { colors } from "@/src/theme/colors";
import type { RecapIndexResponse } from "@/src/types/api";

export default function RecapArchiveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<RecapIndexResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await fetchRecapIndex());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load recaps.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const monthsByYear = useMemo(() => {
    const groups: { year: number; months: RecapIndexResponse["months"] }[] = [];
    for (const month of data?.months ?? []) {
      const last = groups[groups.length - 1];
      if (last && last.year === month.year) last.months.push(month);
      else groups.push({ year: month.year, months: [month] });
    }
    return groups;
  }, [data]);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 },
        ]}
      >
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>Back</Text>
        </Pressable>
        <Text style={styles.eyebrow}>Look back</Text>
        <Text style={styles.title}>Recaps</Text>
        <Text style={styles.body}>
          Past months and years — photos, moments, and what you logged.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!data && !error ? (
          <ActivityIndicator color={colors.accent} style={styles.loading} />
        ) : null}

        {data && !data.months.length && !data.years.length ? (
          <Text style={styles.empty}>
            Recaps appear here after a month closes with NightCaps.
          </Text>
        ) : null}

        {data?.years.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Years</Text>
            {data.years.map((year) => (
              <Pressable
                key={year.year}
                style={styles.row}
                onPress={() =>
                  router.push({
                    pathname: "/recap/year",
                    params: { year: String(year.year) },
                  })
                }
              >
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>{year.title} Year Recap</Text>
                  <Text style={styles.rowSub}>
                    {year.nights_logged} night
                    {year.nights_logged === 1 ? "" : "s"}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {monthsByYear.map((group) => (
          <View key={group.year} style={styles.section}>
            <Text style={styles.sectionLabel}>{group.year}</Text>
            {group.months.map((month) => (
              <Pressable
                key={`${month.year}-${month.month}`}
                style={styles.row}
                onPress={() =>
                  router.push({
                    pathname: "/recap/month",
                    params: {
                      year: String(month.year),
                      month: String(month.month),
                    },
                  })
                }
              >
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>{month.title}</Text>
                  <Text style={styles.rowSub}>
                    {month.nights_logged} night
                    {month.nights_logged === 1 ? "" : "s"}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
  },
  back: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.accentSoft,
  },
  eyebrow: {
    marginTop: 20,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.accentSoft,
  },
  title: {
    marginTop: 8,
    fontSize: 32,
    fontWeight: "700",
    color: colors.text,
  },
  body: {
    marginTop: 8,
    marginBottom: 20,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  error: {
    marginBottom: 16,
    fontSize: 15,
    color: colors.danger,
  },
  loading: {
    marginTop: 24,
  },
  empty: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  section: {
    marginBottom: 20,
    gap: 8,
  },
  sectionLabel: {
    marginBottom: 4,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.muted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  flex: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  rowSub: {
    marginTop: 4,
    fontSize: 13,
    color: colors.muted,
  },
  chevron: {
    fontSize: 22,
    color: colors.muted,
  },
});
