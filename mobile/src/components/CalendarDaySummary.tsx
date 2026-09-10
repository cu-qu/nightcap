import { StyleSheet, Text, View } from "react-native";

import { nightCapPhotoUrl } from "@/src/api/nightcaps";
import { AuthenticatedImage } from "@/src/components/AuthenticatedImage";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { moodLabel } from "@/src/constants/moods";
import { colors } from "@/src/theme/colors";
import { iconFor } from "@/src/theme/iconMap";
import type { CalendarDay } from "@/src/types/api";
import {
  ALL_FILTER,
  formatQtyLong,
  formatSpendDelta,
  groupsForFilter,
} from "@/src/utils/calendarStats";
import { formatDisplayDate, todayIso } from "@/src/utils/date";

type Props = {
  day: CalendarDay | null;
  date: string;
  filterId?: string;
  onStartOrEdit: () => void;
};

export function CalendarDaySummary({
  day,
  date,
  filterId = ALL_FILTER,
  onStartOrEdit,
}: Props) {
  const hasNightCap = !!(
    day?.has_nightcap ||
    day?.has_entries ||
    day?.has_reflection ||
    day?.has_favorite_photo ||
    day?.favorite_moment
  );
  const mood = day?.mood?.trim() ?? "";
  const groups = groupsForFilter(day, filterId);
  const favoriteMoment = day?.favorite_moment?.trim() ?? "";
  const hasFavoritePhoto = !!day?.has_favorite_photo;

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

      {hasFavoritePhoto || favoriteMoment ? (
        <View style={styles.moments}>
          {hasFavoritePhoto ? (
            <AuthenticatedImage
              uri={nightCapPhotoUrl(date)}
              style={styles.momentPhoto}
              accessibilityLabel="Favorite photo of the day"
            />
          ) : null}
          {favoriteMoment ? (
            <Text style={styles.momentText}>“{favoriteMoment}”</Text>
          ) : null}
        </View>
      ) : null}

      {groups.length > 0 ? (
        <View style={styles.groups}>
          {groups.map((g, i) => {
            const spend = Number(g.expense_total) || 0;
            const cats = g.categories ?? [];
            return (
              <View
                key={g.uuid ?? g.key ?? `${g.name}-${i}`}
                style={styles.groupRow}
              >
                <Text style={styles.groupIcon}>{iconFor(g.icon)}</Text>
                <View style={styles.groupBody}>
                  <View style={styles.groupTitleRow}>
                    <Text style={styles.groupName}>{g.name}</Text>
                    {spend > 0 ? (
                      <Text style={styles.spend}>{formatSpendDelta(spend)}</Text>
                    ) : null}
                  </View>
                  {cats.length
                    ? cats.map((c) => {
                        const amount = Number(c.amount) || 0;
                        const qty = Number(c.quantity) || 0;
                        const line =
                          c.metric_kind === "amount" || amount
                            ? formatSpendDelta(amount)
                            : c.metric_kind === "boolean"
                              ? qty
                                ? "Yes"
                                : "No"
                              : formatQtyLong(qty, c.unit);
                        if (!line) return null;
                        return (
                          <Text
                            key={`${c.name}-${c.unit}`}
                            style={styles.catLine}
                          >
                            {c.emoji ? `${c.emoji} ` : ""}
                            {c.name}
                            {" · "}
                            {line}
                          </Text>
                        );
                      })
                    : g.category_emojis?.length
                      ? (
                          <Text style={styles.catLine}>
                            {g.category_emojis.join(" ")}
                          </Text>
                        )
                      : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : hasNightCap && filterId !== ALL_FILTER ? (
        <Text style={styles.emptyFilter}>Nothing in this group today.</Text>
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
    marginTop: 20,
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
  groups: {
    gap: 12,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  groupIcon: {
    fontSize: 22,
    width: 28,
    textAlign: "center",
    marginTop: 1,
  },
  groupBody: {
    flex: 1,
    gap: 3,
  },
  groupTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  groupName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  spend: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.danger,
  },
  catLine: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  emptyFilter: {
    fontSize: 14,
    color: colors.muted,
  },
  moments: {
    gap: 10,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  momentPhoto: {
    width: "100%",
    height: 180,
    borderRadius: 14,
    backgroundColor: colors.elevated,
  },
  momentText: {
    fontSize: 15,
    lineHeight: 22,
    fontStyle: "italic",
    color: colors.text,
  },
});
