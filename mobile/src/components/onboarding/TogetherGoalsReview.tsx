import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/src/theme/colors";
import { categoryGlyph } from "@/src/theme/iconMap";
import type { TogetherGoal } from "@/src/api/onboarding";

type Props = {
  goals: TogetherGoal[];
  approved: Set<string>;
  partnerName?: string;
  onToggle: (uuid: string) => void;
};

export function TogetherGoalsReview({
  goals,
  approved,
  partnerName,
  onToggle,
}: Props) {
  return (
    <View style={styles.wrap}>
      {goals.map((goal) => {
        const on = approved.has(goal.uuid);
        const glyph = categoryGlyph({
          emoji: goal.category_emoji,
          icon: goal.category_icon,
          name: goal.category_name,
        });
        return (
          <Pressable
            key={goal.uuid}
            onPress={() => onToggle(goal.uuid)}
            style={[styles.card, on && styles.cardOn]}
          >
            <Text style={styles.emoji}>{glyph === "✨" ? "📌" : glyph}</Text>
            <View style={styles.text}>
              <Text style={styles.name}>{goal.category_name}</Text>
              <Text style={styles.meta}>{goal.target_label}</Text>
              <Text style={styles.sub}>
                {on
                  ? partnerName
                    ? `Together with ${partnerName}`
                    : "Together"
                  : "Skip — they keep this on their side"}
              </Text>
            </View>
            <View style={[styles.mark, on && styles.markOn]}>
              <Text style={[styles.markText, on && styles.markTextOn]}>
                {on ? "✓" : ""}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
  },
  cardOn: {
    borderColor: colors.accent,
    backgroundColor: "rgba(139, 92, 246, 0.18)",
  },
  emoji: {
    fontSize: 26,
  },
  text: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  meta: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: "600",
    color: colors.accentSoft,
  },
  sub: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  mark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.elevated,
  },
  markOn: {
    backgroundColor: colors.accent,
  },
  markText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.muted,
  },
  markTextOn: {
    color: "#fff",
  },
});
