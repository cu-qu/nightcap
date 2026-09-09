import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { fetchCalendar } from "@/src/api/calendar";
import { CalendarDaySummary } from "@/src/components/CalendarDaySummary";
import { CalendarMonth } from "@/src/components/CalendarMonth";
import { MoonRiseTransition } from "@/src/components/MoonRiseTransition";
import { Screen } from "@/src/components/PrimaryButton";
import { cacheCalendar, loadCachedCalendar } from "@/src/db/schema";
import { useRitualDraftStore } from "@/src/store/ritualDraftStore";
import { colors } from "@/src/theme/colors";
import type { CalendarDay } from "@/src/types/api";
import { isFutureIsoDate } from "@/src/utils/date";

export default function CalendarScreen() {
  const router = useRouter();
  const setDate = useRitualDraftStore((s) => s.setDate);
  const selectedDate = useRitualDraftStore((s) => s.date);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [moonVisible, setMoonVisible] = useState(false);
  const didNavigate = useRef(false);

  const load = useCallback(async (y: number, m: number) => {
    setLoading(true);
    const cached = await loadCachedCalendar(y, m);
    if (cached) setDays(cached);
    try {
      const data = await fetchCalendar(y, m);
      setDays(data.days);
      await cacheCalendar(y, m, data.days);
    } catch {
      // keep cache
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(year, month);
  }, [year, month, load]);

  const selectedDay = useMemo(
    () => days.find((d) => d.date === selectedDate) ?? null,
    [days, selectedDate]
  );

  const canStart = !!selectedDate && !isFutureIsoDate(selectedDate);

  function onSelectDate(date: string) {
    if (isFutureIsoDate(date)) return;
    setDate(date);
  }

  function startOrEditNightCap() {
    if (!canStart || moonVisible) return;
    didNavigate.current = false;
    setDate(selectedDate);
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
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>
          Moods and group activity show on each day. Select today or a past day,
          then start or edit your NightCap.
        </Text>
        <CalendarMonth
          year={year}
          month={month}
          days={days}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          onChangeMonth={(y, m) => {
            setYear(y);
            setMonth(m);
          }}
        />
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}

        {canStart ? (
          <CalendarDaySummary
            day={selectedDay}
            date={selectedDate}
            onStartOrEdit={startOrEditNightCap}
          />
        ) : (
          <Text style={styles.selectHint}>
            Select a day above to NightCap it.
          </Text>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 40,
  },
  hint: {
    marginBottom: 8,
    fontSize: 16,
    color: colors.muted,
    lineHeight: 22,
  },
  loading: {
    marginTop: 24,
    alignItems: "center",
  },
  selectHint: {
    marginTop: 28,
    textAlign: "center",
    fontSize: 14,
    color: colors.muted,
  },
});
