import { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { CalendarDay } from "@/src/types/api";
import { colors } from "@/src/theme/colors";
import {
  ALL_FILTER,
  dayCellCaption,
  formatTotalsLine,
  isSpendishCaption,
  rangeTotals,
} from "@/src/utils/calendarStats";
import { isFutureIsoDate } from "@/src/utils/date";

type Props = {
  year: number;
  month: number;
  days: CalendarDay[];
  selectedDate?: string;
  filterId?: string;
  onSelectDate: (date: string) => void;
  onStartOrEditDate?: (date: string) => void;
  onChangeMonth: (year: number, month: number) => void;
};

const DOUBLE_TAP_MS = 350;

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function toIso(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function CalendarMonth({
  year,
  month,
  days,
  selectedDate,
  filterId = ALL_FILTER,
  onSelectDate,
  onStartOrEditDate,
  onChangeMonth,
}: Props) {
  const lastTap = useRef<{ date: string; at: number } | null>(null);
  const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
  const first = new Date(year, month - 1, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const title = first.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  function shift(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    onChangeMonth(d.getFullYear(), d.getMonth() + 1);
  }

  function startOrEdit(iso: string) {
    onSelectDate(iso);
    onStartOrEditDate?.(iso);
  }

  function handlePress(iso: string) {
    const now = Date.now();
    const prev = lastTap.current;
    lastTap.current = { date: iso, at: now };
    if (prev && prev.date === iso && now - prev.at < DOUBLE_TAP_MS) {
      lastTap.current = null;
      startOrEdit(iso);
      return;
    }
    onSelectDate(iso);
  }

  return (
    <View>
      <View style={styles.header}>
        <Pressable onPress={() => shift(-1)} style={styles.navBtn}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <Pressable onPress={() => shift(1)} style={styles.navBtn}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((d, i) => (
          <View key={`${d}-${i}`} style={styles.weekday}>
            <Text style={styles.weekdayText}>{d}</Text>
          </View>
        ))}
      </View>

      {weeks.map((week, wIdx) => {
        const isoDates = week
          .filter((day): day is number => day != null)
          .map((day) => toIso(year, month, day));
        const weekFrom = isoDates[0];
        const weekTo = isoDates[isoDates.length - 1];
        const weekLine =
          weekFrom && weekTo
            ? formatTotalsLine(
                rangeTotals(days, weekFrom, weekTo, filterId),
                filterId
              )
            : "";
        return (
          <View key={`w-${wIdx}`}>
            <View style={styles.grid}>
              {week.map((day, idx) => {
                if (day == null) {
                  return (
                    <View key={`e-${wIdx}-${idx}`} style={styles.dayCell} />
                  );
                }
                const iso = toIso(year, month, day);
                const meta = byDate[iso];
                const selected = selectedDate === iso;
                const future = isFutureIsoDate(iso);
                const mood = meta?.mood?.trim();
                const caption = future ? "" : dayCellCaption(meta, filterId);
                const spendish = isSpendishCaption(caption);
                return (
                  <Pressable
                    key={iso}
                    disabled={future}
                    onPress={() => handlePress(iso)}
                    onLongPress={() => startOrEdit(iso)}
                    delayLongPress={400}
                    style={styles.dayCell}
                  >
                    <View
                      style={[
                        styles.dayBubble,
                        selected && styles.dayBubbleSelected,
                        future && styles.dayBubbleFuture,
                      ]}
                    >
                      {mood && !future ? (
                        <Text style={styles.moodEmoji}>{mood}</Text>
                      ) : (
                        <Text
                          style={[
                            styles.dayText,
                            selected && styles.dayTextSelected,
                            future && styles.dayTextFuture,
                          ]}
                        >
                          {day}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.dayCaption,
                        selected && styles.dayCaptionSelected,
                        future && styles.dayTextFuture,
                      ]}
                    >
                      {mood && !future ? day : " "}
                    </Text>
                    <Text
                      style={[
                        styles.valueCaption,
                        spendish && styles.valueSpend,
                        selected && styles.valueSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {caption || " "}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {weekLine ? (
              <View style={styles.weekTotal}>
                <Text style={styles.weekTotalLabel}>Week</Text>
                <Text
                  style={[
                    styles.weekTotalValue,
                    isSpendishCaption(weekLine) && styles.valueSpend,
                  ]}
                >
                  {weekLine}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navBtn: {
    borderRadius: 12,
    backgroundColor: colors.elevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  navText: {
    color: colors.text,
    fontSize: 18,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  weekRow: {
    marginBottom: 8,
    flexDirection: "row",
  },
  weekday: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  weekdayText: {
    fontSize: 12,
    color: colors.muted,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: "14.28%",
    marginBottom: 4,
    alignItems: "center",
    padding: 2,
    minHeight: 70,
  },
  dayBubble: {
    height: 36,
    width: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  dayBubbleSelected: {
    backgroundColor: colors.accent,
  },
  dayBubbleFuture: {
    opacity: 0.4,
  },
  dayText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text,
  },
  dayTextSelected: {
    color: "#FFFFFF",
  },
  dayTextFuture: {
    color: colors.muted,
  },
  moodEmoji: {
    fontSize: 20,
  },
  dayCaption: {
    marginTop: 2,
    fontSize: 10,
    color: colors.muted,
    height: 12,
  },
  dayCaptionSelected: {
    color: colors.accentSoft,
  },
  valueCaption: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: "700",
    color: colors.accentSoft,
    height: 13,
  },
  valueSpend: {
    color: colors.danger,
  },
  valueSelected: {
    color: colors.text,
  },
  weekTotal: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.elevated,
  },
  weekTotalLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: colors.muted,
  },
  weekTotalValue: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.accentSoft,
  },
});
