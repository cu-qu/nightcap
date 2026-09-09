import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  clampMood,
  moodLabel,
  SUGGESTED_MOODS,
} from "@/src/constants/moods";
import { colors } from "@/src/theme/colors";

type Props = {
  value: string;
  onChange: (mood: string) => void;
  onClear?: () => void;
};

export function MoodPicker({ value, onChange, onClear }: Props) {
  function select(mood: string) {
    const next = clampMood(mood);
    if (next === value) {
      onChange("");
      onClear?.();
      return;
    }
    onChange(next);
  }

  return (
    <View>
      <View style={styles.row}>
        {SUGGESTED_MOODS.map((opt) => {
          const selected = value === opt.emoji;
          return (
            <Pressable
              key={opt.emoji}
              onPress={() => select(opt.emoji)}
              style={[styles.chip, selected && styles.chipOn]}
            >
              <Text style={styles.emoji}>{opt.emoji}</Text>
              <Text style={[styles.label, selected && styles.labelOn]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {value ? (
        <Text style={styles.selectedHint}>
          Selected {value}
          {moodLabel(value) ? ` · ${moodLabel(value)}` : ""}
          {" · tap again to clear"}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    width: "18%",
    minWidth: 56,
    flexGrow: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  chipOn: {
    borderColor: colors.accent,
    backgroundColor: "rgba(139, 92, 246, 0.25)",
  },
  emoji: {
    fontSize: 26,
  },
  label: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
  },
  labelOn: {
    color: colors.accentSoft,
  },
  selectedHint: {
    marginTop: 10,
    fontSize: 12,
    color: colors.muted,
  },
});
