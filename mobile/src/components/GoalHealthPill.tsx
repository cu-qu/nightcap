import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  clampPercent,
  healthStyle,
  modePillLabel,
  uiHealth,
} from "@/src/lib/goalMode";
import { categoryGlyph } from "@/src/theme/iconMap";
import { colors } from "@/src/theme/colors";
import type { GroupGoalItem } from "@/src/types/goals";
import { goalHeadline, goalSubline } from "@/src/utils/goalCopy";
import { formatCategoryValue } from "@/src/utils/units";

type Props = {
  goal: GroupGoalItem;
  onPress?: () => void;
  /** Full-width row that wraps the name and progress instead of clipping them. */
  fullWidth?: boolean;
};

export function GoalHealthPill({ goal, onPress, fullWidth }: Props) {
  const health = uiHealth(goal.health);
  const pill = healthStyle(health);
  const current = formatCategoryValue(goal.current_value, goal.category);
  const target = formatCategoryValue(goal.target_value, goal.category);
  const fill = clampPercent(goal.percent_used);
  const isOver = health === "over" || goal.percent_used > 100;
  const name =
    goal.scope === "shared" ? `${goal.display_name} · 💛` : goal.display_name;
  const glyph = categoryGlyph({
    emoji: goal.category.emoji,
    icon: goal.category.icon,
    name: goal.category.name || goal.display_name,
  });
  const bar = (
    <View style={[styles.barTrack, fullWidth && styles.barTrackFull]}>
      <View
        style={[
          styles.barFill,
          fullWidth && styles.barFillFull,
          {
            width: `${isOver ? 100 : fill}%`,
            backgroundColor: pill.color,
          },
        ]}
      />
    </View>
  );
  const badge = (
    <View
      style={[
        styles.badge,
        fullWidth && styles.badgeFull,
        { backgroundColor: `${pill.color}33` },
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          fullWidth && styles.badgeTextFull,
          { color: pill.color },
        ]}
      >
        {pill.label}
      </Text>
    </View>
  );

  if (fullWidth) {
    const headline = goalHeadline(goal);
    const subline = goalSubline(goal);
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${name}. ${headline}. ${subline}. ${pill.label}`}
        style={[styles.card, { borderColor: `${pill.color}66` }]}
      >
        <View style={styles.cardTop}>
          <Text style={styles.emoji}>{glyph}</Text>
          <Text style={styles.cardName}>{name}</Text>
          {badge}
        </View>
        <View style={styles.cardCopy}>
          <Text style={styles.cardHeadline}>{headline}</Text>
          <Text style={styles.cardSubline}>{subline}</Text>
        </View>
        {bar}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, { borderColor: `${pill.color}66` }]}
    >
      <Text style={styles.emoji}>{glyph}</Text>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {goal.category.metric_kind === "boolean"
            ? modePillLabel(goal)
            : `${modePillLabel(goal)} · ${current}/${target}`}
        </Text>
        {bar}
      </View>
      {badge}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minWidth: 168,
    maxWidth: 220,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: colors.elevated,
  },
  emoji: {
    fontSize: 20,
  },
  body: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  meta: {
    fontSize: 11,
    color: colors.muted,
  },
  barTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  barFill: {
    height: 4,
    borderRadius: 999,
  },
  badge: {
    flexShrink: 0,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "700",
  },
  card: {
    alignSelf: "stretch",
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: colors.elevated,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  cardName: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: colors.text,
  },
  cardCopy: {
    marginLeft: 28,
    gap: 2,
  },
  cardHeadline: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  cardSubline: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  badgeFull: {
    marginTop: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeTextFull: {
    fontSize: 12,
  },
  barTrackFull: {
    height: 6,
    marginTop: 2,
  },
  barFillFull: {
    height: 6,
  },
});
