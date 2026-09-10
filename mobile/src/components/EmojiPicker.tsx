import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors } from "@/src/theme/colors";
import { emojiOptions } from "@/src/theme/emojiOptions";

type Props = {
  value: string;
  onChange: (emoji: string) => void;
};

export function EmojiPicker({ value, onChange }: Props) {
  return (
    <View>
      <Text style={styles.preview}>{value}</Text>
      <ScrollView
        style={styles.scroller}
        contentContainerStyle={styles.wrap}
        nestedScrollEnabled
        showsVerticalScrollIndicator
      >
        {emojiOptions.map((opt) => {
          const selected = value === opt.emoji;
          return (
            <Pressable
              key={`${opt.emoji}-${opt.label}`}
              onPress={() => onChange(opt.emoji)}
              style={[styles.chip, selected && styles.chipOn]}
              accessibilityLabel={opt.label}
            >
              <Text style={styles.emoji}>{opt.emoji}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    marginBottom: 10,
    fontSize: 36,
    textAlign: "center",
  },
  scroller: {
    maxHeight: 180,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    padding: 10,
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 4,
  },
  chip: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  chipOn: {
    borderColor: colors.accent,
    backgroundColor: "rgba(139, 92, 246, 0.25)",
  },
  emoji: {
    fontSize: 22,
  },
});
