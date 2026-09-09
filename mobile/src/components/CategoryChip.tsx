import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/src/theme/colors";
import { categoryGlyph } from "@/src/theme/iconMap";

type Props = {
  label: string;
  icon?: string;
  emoji?: string;
  selected?: boolean;
  subtitle?: string;
  onPress?: () => void;
  onLongPress?: () => void;
};

export function CategoryChip({
  label,
  icon,
  emoji,
  selected,
  subtitle,
  onPress,
  onLongPress,
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      hitSlop={4}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipSelected : styles.chipIdle,
        pressed && styles.chipPressed,
      ]}
    >
      <View style={styles.row}>
        <Text style={styles.emoji}>{categoryGlyph({ emoji, icon })}</Text>
        <View style={styles.textCol}>
          <Text
            style={[styles.label, selected && styles.labelSelected]}
            numberOfLines={2}
          >
            {label}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    width: "47%",
    marginBottom: 12,
    marginRight: "3%",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 72,
  },
  chipIdle: {
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: "rgba(139, 92, 246, 0.25)",
  },
  chipPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.92,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  emoji: {
    fontSize: 24,
    marginRight: 8,
  },
  textCol: {
    flex: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  labelSelected: {
    color: colors.accentSoft,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: colors.muted,
  },
});
