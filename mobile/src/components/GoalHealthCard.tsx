import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { categoryGlyph } from "@/src/theme/iconMap";
import { colors } from "@/src/theme/colors";
import type { GroupGoalItem } from "@/src/types/goals";
import {
  goalHeadline,
  goalSubline,
  healthPill,
  periodPhrase,
  uiHealth,
} from "@/src/utils/goalCopy";

type Props = {
  goal: GroupGoalItem;
  onEdit?: (goal: GroupGoalItem) => void;
  onDelete?: (goal: GroupGoalItem) => void;
};

export function GoalHealthCard({ goal, onEdit, onDelete }: Props) {
  const health = uiHealth(goal.health);
  const pill = healthPill(health);
  const pct = Math.min(100, Math.max(0, goal.percent_used));
  const isOver = health === "over" || goal.percent_used > 100;
  const fill = isOver ? 100 : pct;

  function confirmDelete() {
    Alert.alert(
      "Remove goal?",
      `Stop tracking “${goal.display_name}” (${periodPhrase(goal.period)})?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => onDelete?.(goal),
        },
      ]
    );
  }

  return (
    <Pressable
      onPress={onEdit ? () => onEdit(goal) : undefined}
      disabled={!onEdit}
      accessibilityRole={onEdit ? "button" : undefined}
      accessibilityLabel={onEdit ? `Edit ${goal.display_name}` : undefined}
      style={styles.card}
    >
      <View style={styles.top}>
        <Text style={styles.emoji}>
          {categoryGlyph({
            emoji: goal.category.emoji,
            icon: goal.category.icon,
            name: goal.category.name || goal.display_name,
          })}
        </Text>
        <View style={styles.titles}>
          <Text style={styles.name} numberOfLines={1}>
            {goal.display_name}
          </Text>
          {goal.scope === "shared" ? (
            <Text style={styles.together}>Together</Text>
          ) : null}
          <Text style={styles.headline}>{goalHeadline(goal)}</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: `${pill.color}33` }]}>
          <Text style={[styles.pillText, { color: pill.color }]}>
            {pill.label}
          </Text>
        </View>
      </View>

      <Text style={styles.subline}>{goalSubline(goal)}</Text>

      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { width: `${fill}%`, backgroundColor: pill.color },
          ]}
        />
      </View>
      {isOver ? <Text style={styles.overHint}>over</Text> : null}

      {onEdit || onDelete ? (
        <View style={styles.actions}>
          {onEdit ? (
            <Pressable onPress={() => onEdit(goal)} hitSlop={8}>
              <Text style={styles.editText}>Edit</Text>
            </Pressable>
          ) : null}
          {onDelete ? (
            <Pressable onPress={confirmDelete} hitSlop={8}>
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
    marginBottom: 10,
  },
  top: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  emoji: {
    fontSize: 28,
    marginTop: 2,
  },
  titles: {
    flex: 1,
  },
  name: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  together: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.accentSoft,
  },
  headline: {
    marginTop: 4,
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  subline: {
    marginTop: 12,
    fontSize: 13,
    color: colors.muted,
  },
  barTrack: {
    marginTop: 10,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.elevated,
    overflow: "hidden",
  },
  barFill: {
    height: 8,
    borderRadius: 999,
  },
  overHint: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "700",
    color: colors.danger,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  actions: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  editText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.accentSoft,
  },
  removeText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.danger,
  },
});
