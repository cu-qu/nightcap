import { Pressable, StyleSheet, Text, View } from "react-native";

import type { CalendarDay } from "@/src/types/api";
import { colors } from "@/src/theme/colors";
import { isFutureIsoDate } from "@/src/utils/date";

type Props = {
  year: number;
  month: number;
  days: CalendarDay[];
  selectedDate?: string;
  onSelectDate: (date: string) => void;
  onChangeMonth: (year: number, month: number) => void;
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function toIso(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function CalendarMonth({
  year,
  month,
  days,
  selectedDate,
  onSelectDate,
  onChangeMonth,
}: Props) {
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

  function shift(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    onChangeMonth(d.getFullYear(), d.getMonth() + 1);
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

      <View style={styles.grid}>
        {cells.map((day, idx) => {
          if (day == null) {
            return <View key={`e-${idx}`} style={styles.dayCell} />;
          }
          const iso = toIso(year, month, day);
          const meta = byDate[iso];
          const selected = selectedDate === iso;
          const future = isFutureIsoDate(iso);
          const mood = meta?.mood?.trim();
          return (
            <Pressable
              key={iso}
              disabled={future}
              onPress={() => onSelectDate(iso)}
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
              <View style={styles.dots}>
                {meta?.has_entries ? <View style={styles.dotEntry} /> : null}
                {meta?.has_reflection ? (
                  <View style={styles.dotReflection} />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
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
    marginBottom: 6,
    alignItems: "center",
    padding: 2,
    minHeight: 64,
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
  dots: {
    marginTop: 2,
    height: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  dotEntry: {
    height: 5,
    width: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accent,
  },
  dotReflection: {
    height: 5,
    width: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accentSoft,
  },
});
