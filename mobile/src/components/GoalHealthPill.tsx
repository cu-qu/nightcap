import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  clampPercent,
  formatGoalNumber,
  healthStyle,
  modePillLabel,
  uiHealth,
} from "@/src/lib/goalMode";
import { categoryGlyph } from "@/src/theme/iconMap";
import { colors } from "@/src/theme/colors";
import type { GroupGoalItem } from "@/src/types/goals";

type Props = {
  goal: GroupGoalItem;
  onPress?: () => void;
};

export function GoalHealthPill({ goal, onPress }: Props) {
  const health = uiHealth(goal.health);
  const pill = healthStyle(health);
  const kind = goal.category.metric_kind;
  const current = formatGoalNumber(goal.current_value, kind);
  const target = formatGoalNumber(goal.target_value, kind);
  const fill = clampPercent(goal.percent_used);
  const isOver = health === "over" || goal.percent_used > 100;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, { borderColor: `${pill.color}66` }]}
    >
      <Text style={styles.emoji}>
        {categoryGlyph({
          emoji: goal.category.emoji,
          icon: goal.category.icon,
        })}
      </Text>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {goal.display_name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {modePillLabel(goal)} · {current}/{target}
        </Text>
        <View style={styles.barTrack}>
          <View
            style={[
              styles.barFill,
              {
                width: `${isOver ? 100 : fill}%`,
                backgroundColor: pill.color,
              },
            ]}
          />
        </View>
      </View>
      <View style={[styles.badge, { backgroundColor: `${pill.color}33` }]}>
        <Text style={[styles.badgeText, { color: pill.color }]}>
          {pill.label}
        </Text>
      </View>
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
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "700",
  },
});
