import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
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
import { useGroupsStore } from "@/src/store/groupsStore";
import { useRitualDraftStore } from "@/src/store/ritualDraftStore";
import { colors } from "@/src/theme/colors";
import type { CalendarDay } from "@/src/types/api";
import { SPEND_GROUP_KEY } from "@/src/types/api";
import {
  ALL_FILTER,
  formatTotalsLine,
  groupFilterId,
  isSpendishCaption,
  rangeTotals,
} from "@/src/utils/calendarStats";
import { isFutureIsoDate, todayIso, toIsoDate } from "@/src/utils/date";

export default function CalendarScreen() {
  const router = useRouter();
  const beginForDate = useRitualDraftStore((s) => s.beginForDate);
  const groups = useGroupsStore((s) => s.groups);
  const loadGroups = useGroupsStore((s) => s.load);
  const now = new Date();
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterId, setFilterId] = useState(ALL_FILTER);
  const [moonVisible, setMoonVisible] = useState(false);
  const didNavigate = useRef(false);

  const load = useCallback(async (y: number, m: number) => {
    const cached = await loadCachedCalendar(y, m);
    if (cached) setDays(cached);
    else setLoading(true);
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

  useFocusEffect(
    useCallback(() => {
      void load(year, month);
    }, [year, month, load])
  );

  useEffect(() => {
    if (!groups.length) void loadGroups();
  }, [groups.length, loadGroups]);

  const selectedDay = useMemo(
    () => days.find((d) => d.date === selectedDate) ?? null,
    [days, selectedDate]
  );

  const canStart = !!selectedDate && !isFutureIsoDate(selectedDate);

  const monthToDateLine = useMemo(() => {
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const last = new Date(year, month, 0);
    const today = todayIso();
    const endIso = toIsoDate(last);
    const end = today < endIso && today >= start ? today : endIso;
    const line = formatTotalsLine(
      rangeTotals(days, start, end, filterId),
      filterId
    );
    if (!line) return "";
    const currentMonth = today >= start && today <= endIso;
    return currentMonth ? `${line} so far` : line;
  }, [days, filterId, month, year]);

  const filterChips = useMemo(() => {
    const chips = [
      { id: ALL_FILTER, label: "All" },
      ...[...groups]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((g) => ({
          id: groupFilterId(g),
          label: g.key === SPEND_GROUP_KEY ? "Spend" : g.name,
        }))
        .filter((c) => c.id),
    ];
    return chips;
  }, [groups]);

  function onSelectDate(date: string) {
    if (isFutureIsoDate(date)) return;
    setSelectedDate(date);
  }

  function startOrEditNightCap(date = selectedDate) {
    if (!date || isFutureIsoDate(date) || moonVisible) return;
    didNavigate.current = false;
    const day = days.find((d) => d.date === date);
    const hasNightCap = !!(
      day?.has_nightcap ||
      day?.has_entries ||
      day?.has_reflection ||
      day?.has_favorite_photo ||
      day?.favorite_moment
    );
    beginForDate(date, { reset: hasNightCap });
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
          Filter a group to see spend or movement on each day, with week and
          month totals.
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {filterChips.map((chip) => {
            const on = filterId === chip.id;
            return (
              <Pressable
                key={chip.id}
                onPress={() => setFilterId(chip.id)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {monthToDateLine ? (
          <View style={styles.monthBanner}>
            <Text style={styles.monthBannerLabel}>This month</Text>
            <Text
              style={[
                styles.monthBannerValue,
                isSpendishCaption(monthToDateLine) && styles.monthSpend,
              ]}
            >
              {monthToDateLine}
            </Text>
          </View>
        ) : null}

        <CalendarMonth
          year={year}
          month={month}
          days={days}
          selectedDate={selectedDate}
          filterId={filterId}
          onSelectDate={onSelectDate}
          onStartOrEditDate={startOrEditNightCap}
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
            filterId={filterId}
            onStartOrEdit={startOrEditNightCap}
          />
        ) : (
          <Text style={styles.selectHint}>
            Select a day, or long-press / double-tap it to NightCap.
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
    marginBottom: 12,
    fontSize: 16,
    color: colors.muted,
    lineHeight: 22,
  },
  chips: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 14,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipOn: {
    borderColor: colors.accent,
    backgroundColor: "rgba(139, 92, 246, 0.22)",
  },
  chipText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.muted,
  },
  chipTextOn: {
    color: colors.text,
  },
  monthBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  monthBannerLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
  },
  monthBannerValue: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.accentSoft,
  },
  monthSpend: {
    color: colors.danger,
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
