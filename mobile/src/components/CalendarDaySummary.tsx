import { StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "@/src/components/PrimaryButton";
import { moodLabel } from "@/src/constants/moods";
import { colors } from "@/src/theme/colors";
import { iconFor } from "@/src/theme/iconMap";
import type { CalendarDay } from "@/src/types/api";
import { formatCurrency, formatDisplayDate, todayIso } from "@/src/utils/date";

type Props = {
  day: CalendarDay | null;
  date: string;
  onStartOrEdit: () => void;
};

export function CalendarDaySummary({ day, date, onStartOrEdit }: Props) {
  const hasNightCap = !!(
    day?.has_nightcap ||
    day?.has_entries ||
    day?.has_reflection
  );
  const mood = day?.mood?.trim() ?? "";
  const groups = day?.groups ?? [];
  const expense = Number(day?.expense_total ?? 0);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        {mood ? <Text style={styles.mood}>{mood}</Text> : null}
        <View style={styles.headerText}>
          <Text style={styles.date}>
            {formatDisplayDate(date)}
            {date === todayIso() ? " · Today" : ""}
          </Text>
          {mood ? (
            <Text style={styles.moodMeta}>
              {moodLabel(mood) ?? "Custom mood"}
            </Text>
          ) : (
            <Text style={styles.moodMeta}>
              {hasNightCap ? "NightCap logged" : "No NightCap yet"}
            </Text>
          )}
        </View>
      </View>

      {hasNightCap ? (
        <View style={styles.stats}>
          <Text style={styles.stat}>
            {formatCurrency(expense)} spend · {day?.entry_count ?? 0} entries
            {(day?.habit_count ?? 0) > 0 ? ` · ${day?.habit_count} habits` : ""}
          </Text>
        </View>
      ) : null}

      {groups.length > 0 ? (
        <View style={styles.groups}>
          {groups.map((g, i) => (
            <View
              key={g.uuid ?? g.key ?? `${g.name}-${i}`}
              style={styles.groupRow}
            >
              <Text style={styles.groupIcon}>{iconFor(g.icon)}</Text>
              <View style={styles.groupBody}>
                <Text style={styles.groupName}>{g.name}</Text>
                <Text style={styles.groupMeta}>
                  {g.category_emojis?.length
                    ? g.category_emojis.join(" ")
                    : `${g.entry_count} categor${g.entry_count === 1 ? "y" : "ies"}`}
                  {Number(g.expense_total) > 0
                    ? ` · ${formatCurrency(Number(g.expense_total))}`
                    : ""}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <PrimaryButton
        title={hasNightCap ? "Edit NightCap" : "Start NightCap"}
        onPress={onStartOrEdit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 28,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 20,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  mood: {
    fontSize: 40,
  },
  headerText: {
    flex: 1,
  },
  date: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  moodMeta: {
    marginTop: 4,
    fontSize: 14,
    color: colors.muted,
  },
  stats: {
    paddingTop: 4,
  },
  stat: {
    fontSize: 14,
    color: colors.muted,
  },
  groups: {
    gap: 10,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  groupIcon: {
    fontSize: 22,
    width: 28,
    textAlign: "center",
  },
  groupBody: {
    flex: 1,
  },
  groupName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  groupMeta: {
    marginTop: 2,
    fontSize: 13,
    color: colors.muted,
  },
});
