import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { fetchCalendar } from "@/src/api/calendar";
import { GoalsSnapshot } from "@/src/components/GoalsSnapshot";
import { MoonRiseTransition } from "@/src/components/MoonRiseTransition";
import { PrimaryButton, Screen } from "@/src/components/PrimaryButton";
import { cacheCalendar, loadCachedCalendar } from "@/src/db/schema";
import { useGoalsStore } from "@/src/store/goalsStore";
import { useRitualDraftStore } from "@/src/store/ritualDraftStore";
import { colors } from "@/src/theme/colors";
import {
  formatFullDisplayDate,
  todayIso,
} from "@/src/utils/date";

export default function HomeScreen() {
  const router = useRouter();
  const setDate = useRitualDraftStore((s) => s.setDate);
  const loadGoals = useGoalsStore((s) => s.load);
  const goalsPeriod = useGoalsStore((s) => s.period);
  const today = todayIso();

  const [hasTodayNightCap, setHasTodayNightCap] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [moonVisible, setMoonVisible] = useState(false);
  const didNavigate = useRef(false);

  const loadHome = useCallback(async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    await loadGoals(goalsPeriod);

    const cached = await loadCachedCalendar(year, month);
    try {
      const data = await fetchCalendar(year, month);
      await cacheCalendar(year, month, data.days);
      const todayRow = data.days.find((d) => d.date === today);
      setHasTodayNightCap(
        !!(
          todayRow?.has_nightcap ||
          todayRow?.has_entries ||
          todayRow?.has_reflection
        )
      );
    } catch {
      const todayRow = cached?.find((d) => d.date === today);
      setHasTodayNightCap(
        !!(
          todayRow?.has_nightcap ||
          todayRow?.has_entries ||
          todayRow?.has_reflection
        )
      );
    }
  }, [today, loadGoals, goalsPeriod]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      void (async () => {
        try {
          await loadHome();
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [loadHome])
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadHome();
    } finally {
      setRefreshing(false);
    }
  }

  function startNightCap() {
    if (moonVisible) return;
    didNavigate.current = false;
    setDate(today);
    setMoonVisible(true);
  }

  const onMoonTransition = useCallback(() => {
    if (didNavigate.current) return;
    didNavigate.current = true;
    router.push("/ritual/spend");
  }, [router]);

  const onMoonFinished = useCallback(() => {
    setMoonVisible(false);
    didNavigate.current = false;
  }, []);

  return (
    <Screen>
      <MoonRiseTransition
        visible={moonVisible}
        onTransition={onMoonTransition}
        onFinished={onMoonFinished}
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || loading}
            onRefresh={() => void onRefresh()}
            tintColor={colors.accent}
          />
        }
      >
        <Text style={styles.brand}>NightCap</Text>
        <Text style={styles.greeting}>How did the day go?</Text>
        <Text style={styles.today}>{formatFullDisplayDate(today)}</Text>

        <View style={styles.ritualCard}>
          <Text style={styles.ritualEyebrow}>Tonight</Text>
          <Text style={styles.ritualTitle}>NightCap</Text>
          <Text style={styles.ritualBody}>
            {hasTodayNightCap
              ? "You’ve already logged tonight. Open it to update spend, habits, mood, or reflection."
              : "Close out the day — groups, mood, and a short reflection."}
          </Text>
          <PrimaryButton
            title={hasTodayNightCap ? "Edit NightCap" : "Start NightCap"}
            onPress={startNightCap}
          />
          <Pressable
            onPress={() => router.push("/(tabs)/calendar")}
            style={styles.secondaryLink}
            hitSlop={8}
          >
            <Text style={styles.secondaryLinkText}>
              Or pick another day on Calendar
            </Text>
          </Pressable>
        </View>

        <GoalsSnapshot />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  brand: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.accentSoft,
  },
  greeting: {
    marginTop: 10,
    fontSize: 30,
    fontWeight: "700",
    color: colors.text,
  },
  today: {
    marginTop: 8,
    fontSize: 16,
    color: colors.muted,
  },
  ritualCard: {
    marginTop: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.elevated,
    padding: 20,
  },
  ritualEyebrow: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.accentSoft,
  },
  ritualTitle: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: "700",
    color: colors.text,
  },
  ritualBody: {
    marginTop: 8,
    marginBottom: 20,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  secondaryLink: {
    marginTop: 16,
    alignItems: "center",
  },
  secondaryLinkText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.accentSoft,
  },
});
