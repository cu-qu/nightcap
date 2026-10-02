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
import { nudgePartner, nudgeSentMessage } from "@/src/api/partnership";
import { fetchRecapIndex } from "@/src/api/recaps";
import { GoalsSnapshot } from "@/src/components/GoalsSnapshot";
import { MoonRiseTransition } from "@/src/components/MoonRiseTransition";
import { PrimaryButton, Screen } from "@/src/components/PrimaryButton";
import { cacheCalendar, loadCachedCalendar } from "@/src/db/schema";
import { useAuthStore } from "@/src/store/authStore";
import { useGoalsStore } from "@/src/store/goalsStore";
import { useRitualDraftStore } from "@/src/store/ritualDraftStore";
import { colors } from "@/src/theme/colors";
import type { CalendarDay, RecapIndexResponse } from "@/src/types/api";
import { dayHasNightCap } from "@/src/utils/calendarStats";
import {
  formatFullDisplayDate,
  todayIso,
} from "@/src/utils/date";

export default function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const beginForDate = useRitualDraftStore((s) => s.beginForDate);
  const loadGoals = useGoalsStore((s) => s.load);
  const goalsPeriod = useGoalsStore((s) => s.period);
  const today = todayIso();
  const [recaps, setRecaps] = useState<RecapIndexResponse | null>(null);

  const [todayRow, setTodayRow] = useState<CalendarDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [moonVisible, setMoonVisible] = useState(false);
  const [nudging, setNudging] = useState(false);
  const [nudgeMessage, setNudgeMessage] = useState<string | null>(null);
  const didNavigate = useRef(false);
  const hasTodayNightCap = dayHasNightCap(todayRow);
  const partner = todayRow?.partner ?? null;
  const incomingNudge = !!partner?.incoming_nudge_at && !hasTodayNightCap;
  const canNudgePartner =
    !!partner && !partner.has_nightcap && !partner.nudged_at;

  const loadHome = useCallback(async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    await loadGoals(goalsPeriod);

    try {
      setRecaps(await fetchRecapIndex());
    } catch {
      setRecaps(null);
    }

    const cached = await loadCachedCalendar(year, month);
    try {
      const data = await fetchCalendar(year, month);
      await cacheCalendar(year, month, data.days);
      const todayRow = data.days.find((d) => d.date === today) ?? null;
      setTodayRow(todayRow);
    } catch {
      const cachedRow = cached?.find((d) => d.date === today) ?? null;
      setTodayRow(cachedRow);
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
    beginForDate(today, { reset: hasTodayNightCap });
    setMoonVisible(true);
  }

  async function onNudgePartner() {
    if (!canNudgePartner || nudging) return;
    setNudging(true);
    setNudgeMessage(null);
    try {
      const { nudge } = await nudgePartner(today);
      setTodayRow((current) =>
        current?.partner
          ? {
              ...current,
              partner: { ...current.partner, nudged_at: nudge.created_at },
            }
          : current
      );
      setNudgeMessage(nudgeSentMessage(nudge));
    } catch (e) {
      setNudgeMessage(e instanceof Error ? e.message : "Couldn’t send that nudge");
    } finally {
      setNudging(false);
    }
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
        <Text style={styles.greeting}>
          {user?.partnership?.members && user.partnership.members.length > 1
            ? "How did the day go, you two?"
            : "How did the day go?"}
        </Text>
        <Text style={styles.today}>{formatFullDisplayDate(today)}</Text>

        <View style={styles.ritualCard}>
          <Text style={styles.ritualEyebrow}>Tonight</Text>
          <Text style={styles.ritualTitle}>NightCap</Text>
          <Text style={styles.ritualBody}>
            {incomingNudge
              ? `${partner?.username} nudged you to close out tonight.`
              : hasTodayNightCap
                ? "You’ve already logged tonight. Open it to update spend, habits, mood, or reflection."
                : "Close out the day — groups, mood, and a short reflection."}
          </Text>
          {partner && !incomingNudge ? (
            <Text style={styles.partnerLine}>
              {partner.has_nightcap
                ? `${partner.username} already NightCap’d tonight.`
                : partner.nudged_at
                  ? `Nudged ${partner.username} · waiting`
                  : `${partner.username} hasn’t NightCap’d yet.`}
            </Text>
          ) : null}
          <View style={styles.ritualActions}>
            <PrimaryButton
              title={
                incomingNudge
                  ? "Start NightCap"
                  : hasTodayNightCap
                    ? "Edit NightCap"
                    : "Start NightCap"
              }
              onPress={startNightCap}
            />
            {canNudgePartner ? (
              <PrimaryButton
                title={`Nudge ${partner?.username ?? "partner"}`}
                variant="secondary"
                onPress={() => void onNudgePartner()}
                loading={nudging}
              />
            ) : null}
          </View>
          {nudgeMessage ? (
            <Text style={styles.nudgeMessage}>{nudgeMessage}</Text>
          ) : null}
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

        {recaps?.featured_month || recaps?.featured_year ? (
          <View style={styles.recapCard}>
            <Text style={styles.ritualEyebrow}>Look back</Text>
            <Text style={styles.recapTitle}>
              {recaps.featured_month
                ? `${recaps.featured_month.title} Recap`
                : `${recaps.featured_year?.title} Recap`}
            </Text>
            <Text style={styles.ritualBody}>
              Photos, favorite moments, and what you logged last
              {recaps.featured_year && !recaps.featured_month
                ? " year"
                : " month"}
              . Available here for the first week.
            </Text>
            {recaps.featured_month ? (
              <PrimaryButton
                title={`Open ${recaps.featured_month.title}`}
                onPress={() =>
                  router.push({
                    pathname: "/recap/month",
                    params: {
                      year: String(recaps.featured_month!.year),
                      month: String(recaps.featured_month!.month),
                    },
                  })
                }
              />
            ) : null}
            {recaps.featured_year ? (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/recap/year",
                    params: { year: String(recaps.featured_year!.year) },
                  })
                }
                style={styles.secondaryLink}
                hitSlop={8}
              >
                <Text style={styles.secondaryLinkText}>
                  {recaps.featured_year.title} Year Recap
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

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
  partnerLine: {
    marginTop: -8,
    marginBottom: 16,
    fontSize: 14,
    color: colors.accentSoft,
  },
  ritualActions: {
    gap: 10,
  },
  nudgeMessage: {
    marginTop: 12,
    textAlign: "center",
    fontSize: 13,
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
  recapCard: {
    marginTop: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 20,
  },
  recapTitle: {
    marginTop: 8,
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
  },
});
